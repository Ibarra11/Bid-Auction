import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createAuctionRealtime, type AuctionChangedEvent } from './realtime.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:56379';
const sockets: Socket[] = [];
const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.disconnect());
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function createInstance(channelPrefix: string) {
  let realtime: ReturnType<typeof createAuctionRealtime>;
  const app = buildApp({
    publishAuctionChanged: (event) => realtime.publishAuctionChanged(event),
    getRealtimeStatus: () => realtime.getStatus(),
  });
  apps.push(app);
  realtime = createAuctionRealtime(app.server, app.log, app.auctionExists);
  app.addHook('onClose', async () => realtime.close());
  await realtime.connectRedis(redisUrl, channelPrefix);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, address, realtime };
}

async function connect(url: string): Promise<Socket> {
  const socket = createClient(url, { forceNew: true });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

async function watch(socket: Socket, slug: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    socket.emit('auction:watch', { slug }, resolve);
  });
}

describe('distributed auction realtime', () => {
  it('delivers a committed bid from API A to a watcher on API B within one second', async () => {
    const channelPrefix = `part-2-distributed-test-${randomUUID()}`;
    const instanceA = await createInstance(channelPrefix);
    const instanceB = await createInstance(channelPrefix);
    expect(instanceA.realtime.getStatus()).toBe('ok');
    expect(instanceB.realtime.getStatus()).toBe('ok');
    expect(
      (await instanceA.app.inject({ method: 'GET', url: '/api/health' })).json(),
    ).toMatchObject({ ok: true, db: 'ok', realtime: 'ok' });

    const created = await instanceA.app.inject({
      method: 'POST',
      url: '/api/auctions',
      payload: {
        userId: 1,
        title: `Distributed Realtime ${Date.now()}`,
        category: 'GPUs',
        description: 'A temporary listing used to prove cross-instance realtime delivery.',
        condition: 'Used · Fully tested',
        location: 'San Jose, CA',
        startingPriceCents: 10000,
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    const { slug } = created.json() as { slug: string };

    try {
      const watcher = await connect(instanceB.address);
      expect(await watch(watcher, slug)).toEqual({ ok: true });
      const received = new Promise<AuctionChangedEvent>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('cross-instance event timed out')),
          1_000,
        );
        watcher.once('auction:changed', (event: AuctionChangedEvent) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      const bid = await instanceA.app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        payload: { userId: 2, amountCents: 10000 },
      });

      expect(bid.statusCode).toBe(201);
      await expect(received).resolves.toEqual({ slug, bidId: bid.json().id });
    } finally {
      const cleanupPool = new pg.Pool({
        connectionString:
          process.env.DATABASE_URL ?? 'postgres://auction:auction@localhost:55432/auction_part_2',
      });
      await cleanupPool.query('DELETE FROM auctions WHERE slug = $1', [slug]);
      await cleanupPool.end();
    }
  });
});
