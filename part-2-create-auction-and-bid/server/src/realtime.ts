import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { FastifyBaseLogger } from 'fastify';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { z } from 'zod';

const auctionSubscriptionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type AuctionChangedEvent = {
  slug: string;
  bidId: string;
};

export type RealtimeStatus = 'ok' | 'degraded';

type SubscriptionResult = { ok: true } | { ok: false; error: string };

type ClientToServerEvents = {
  'auction:watch': (payload: unknown, acknowledge: (result: SubscriptionResult) => void) => void;
};

type ServerToClientEvents = {
  'auction:changed': (event: AuctionChangedEvent) => void;
  'realtime:status': (event: { status: RealtimeStatus }) => void;
};

export function auctionRoom(slug: string): string {
  return `auction:${slug}`;
}

export type AuctionRealtime = {
  connectRedis(redisUrl: string, channelPrefix?: string): Promise<void>;
  getStatus(): RealtimeStatus;
  publishAuctionChanged(event: AuctionChangedEvent): void;
  close(): Promise<void>;
};

export function createAuctionRealtime(
  httpServer: HttpServer,
  logger: FastifyBaseLogger,
  auctionExists: (slug: string) => Promise<boolean>,
): AuctionRealtime {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    serveClient: false,
  });
  let status: RealtimeStatus = 'degraded';
  let redisClients: [Redis, Redis] | null = null;
  let redisReady = [false, false];
  let closed = false;

  function updateStatus() {
    const nextStatus: RealtimeStatus = redisReady.every(Boolean) ? 'ok' : 'degraded';
    if (status === nextStatus) return;
    status = nextStatus;
    if (closed) return;
    logger.info({ realtime: status }, `realtime ${status}`);
    io.local.emit('realtime:status', { status });
  }

  function trackRedisClient(client: Redis, index: number, label: string) {
    client.on('ready', () => {
      redisReady[index] = true;
      updateStatus();
    });
    client.on('reconnecting', () => {
      redisReady[index] = false;
      updateStatus();
    });
    client.on('end', () => {
      redisReady[index] = false;
      updateStatus();
    });
    client.on('error', (error: Error) => {
      redisReady[index] = false;
      updateStatus();
      logger.error({ err: error, redisClient: label }, 'Redis realtime connection error');
    });
  }

  io.on('connection', (socket) => {
    socket.emit('realtime:status', { status });
    socket.on('auction:watch', async (payload, acknowledge) => {
      const parsed = auctionSubscriptionSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge({ ok: false, error: 'Invalid auction subscription' });
        return;
      }
      if (status !== 'ok') {
        acknowledge({ ok: false, error: 'Realtime unavailable' });
        return;
      }

      try {
        if (!(await auctionExists(parsed.data.slug))) {
          acknowledge({ ok: false, error: 'Auction not found' });
          return;
        }
        await socket.join(auctionRoom(parsed.data.slug));
        acknowledge({ ok: true });
      } catch (error) {
        logger.error({ err: error, slug: parsed.data.slug }, 'auction subscription failed');
        acknowledge({ ok: false, error: 'Auction subscription unavailable' });
      }
    });
  });

  return {
    async connectRedis(redisUrl, channelPrefix = 'auction-part-2') {
      if (redisClients) return;
      const publisher = new Redis(redisUrl);
      const subscriber = publisher.duplicate();
      redisClients = [publisher, subscriber];
      trackRedisClient(publisher, 0, 'publisher');
      trackRedisClient(subscriber, 1, 'subscriber');
      io.adapter(createAdapter(publisher, subscriber, { key: channelPrefix }));
      await Promise.all(
        redisClients.map(
          (client) =>
            new Promise<void>((resolve) => {
              if (client.status === 'ready') resolve();
              else client.once('ready', resolve);
            }),
        ),
      );
    },

    getStatus() {
      return status;
    },

    publishAuctionChanged(event) {
      if (status === 'ok') io.to(auctionRoom(event.slug)).emit('auction:changed', event);
    },

    async close() {
      closed = true;
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (redisClients) {
        await Promise.all(
          redisClients.map(async (client) => {
            client.disconnect();
          }),
        );
      }
    },
  };
}
