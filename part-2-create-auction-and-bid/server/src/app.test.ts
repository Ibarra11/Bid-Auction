import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from './app.js';

const app = buildApp();
const cleanup = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://auction:auction@localhost:55432/auction_part_2',
});
afterAll(async () => {
  await cleanup.end();
  await app.close();
});

describe('database-backed marketplace API', () => {
  it('reports a healthy database', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, db: 'ok' });
  });

  it('returns the ten predefined users', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/users' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(10);
    expect(response.json()[0]).toEqual({ id: 1, displayName: 'Avery Chen', handle: 'avery' });
  });

  it('returns all six seeded auctions', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auctions' });

    expect(response.statusCode).toBe(200);
    const auctions = response.json() as Array<{ slug: string }>;
    expect(auctions.length).toBeGreaterThanOrEqual(6);
    expect(auctions.map((auction) => auction.slug)).toEqual(
      expect.arrayContaining([
        'nvidia-h100-sxm-80gb',
        'amd-epyc-9654',
        'one-point-five-tb-ddr5-ecc',
        'supermicro-4u-gpu-chassis',
        'quantum-2-400g-switch',
        'direct-to-chip-cooling-loop',
      ]),
    );
  });

  it('filters auctions by text and category', async () => {
    const search = await app.inject({ method: 'GET', url: '/api/auctions?q=kubernetes' });
    const category = await app.inject({ method: 'GET', url: '/api/auctions?category=Cooling' });

    expect(search.json().map((auction: { slug: string }) => auction.slug)).toEqual([
      'amd-epyc-9654',
    ]);
    expect(category.json().map((auction: { slug: string }) => auction.slug)).toEqual([
      'direct-to-chip-cooling-loop',
    ]);
  });

  it('returns one auction with its seller and integer-cent price', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auctions/nvidia-h100-sxm-80gb' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: 'NVIDIA H100 SXM 80GB',
      currentPriceCents: 1845000,
      seller: { id: 1, displayName: 'Avery Chen', handle: 'avery' },
    });
  });

  it('rejects invalid filters and reports missing auctions', async () => {
    const invalid = await app.inject({ method: 'GET', url: '/api/auctions?category=Storage' });
    const missing = await app.inject({ method: 'GET', url: '/api/auctions/not-here' });

    expect(invalid.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
  });

  it('validates auction input at the API boundary', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auctions',
      payload: {
        userId: 1,
        title: 'x',
        category: 'Storage',
        description: 'too short',
        condition: 'Mint',
        location: '',
        startingPriceCents: 12.5,
        endsAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Invalid auction' });
  });

  it('persists an auction owned by the active user', async () => {
    const title = `Slice Two Test ${Date.now()}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/auctions',
      payload: {
        userId: 2,
        title,
        category: 'GPUs',
        description: 'A clean test listing that proves the complete persistence path.',
        condition: 'Used · Fully tested',
        location: 'Sacramento, CA',
        startingPriceCents: 12345,
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });

    expect(response.statusCode).toBe(201);
    const { slug } = response.json() as { slug: string };
    try {
      const detail = await app.inject({ method: 'GET', url: `/api/auctions/${slug}` });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        slug,
        title,
        currentPriceCents: 12345,
        category: 'GPUs',
        seller: { id: 2, displayName: 'Maya Thompson', handle: 'maya' },
        specs: [],
      });
    } finally {
      await cleanup.query('DELETE FROM auctions WHERE slug = $1', [slug]);
    }
  });

  it('rejects an unknown seller', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auctions',
      payload: {
        userId: 99999,
        title: 'Unknown Seller Listing',
        category: 'CPUs',
        description: 'This otherwise valid listing belongs to nobody in the marketplace.',
        condition: 'Open box · Bench tested',
        location: 'Oakland, CA',
        startingPriceCents: 50000,
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Unknown active user' });
  });
});
