import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const app = buildApp();
afterAll(() => app.close());

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

  it('returns the six seeded auctions ordered by closing time', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auctions' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(6);
    expect(response.json()[0]).toMatchObject({
      slug: 'one-point-five-tb-ddr5-ecc',
      currentPriceCents: 689000,
      bidCount: 0,
    });
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
});
