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

  it('validates, persists, and returns sequential bid history', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/auctions',
      payload: {
        userId: 1,
        title: `Bid Test ${Date.now()}`,
        category: 'Networking',
        description: 'A temporary listing used to verify every sequential bidding rule.',
        condition: 'Certified refurbished',
        location: 'Portland, OR',
        startingPriceCents: 50000,
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(created.statusCode).toBe(201);
    const { slug } = created.json() as { slug: string };

    try {
      const sellerBid = await app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        payload: { userId: 1, amountCents: 50000 },
      });
      expect(sellerBid.statusCode).toBe(409);
      expect(sellerBid.json()).toEqual({
        code: 'SELLER_CANNOT_BID',
        error: 'Sellers cannot bid on their own auctions',
      });

      const lowFirstBid = await app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        payload: { userId: 2, amountCents: 49999 },
      });
      expect(lowFirstBid.statusCode).toBe(409);
      expect(lowFirstBid.json()).toMatchObject({
        code: 'BID_TOO_LOW',
        minimumBidCents: 50000,
        currentPriceCents: 50000,
        bidCount: 0,
      });

      const firstBid = await app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        payload: { userId: 2, amountCents: 50000 },
      });
      expect(firstBid.statusCode).toBe(201);
      expect(firstBid.json()).toMatchObject({
        amountCents: 50000,
        bidder: { id: 2, handle: 'maya' },
      });

      const lowLaterBid = await app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        payload: { userId: 3, amountCents: 50099 },
      });
      expect(lowLaterBid.statusCode).toBe(409);
      expect(lowLaterBid.json()).toMatchObject({
        code: 'BID_TOO_LOW',
        minimumBidCents: 50100,
        currentPriceCents: 50000,
        bidCount: 1,
      });

      const secondBid = await app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        payload: { userId: 3, amountCents: 50100 },
      });
      expect(secondBid.statusCode).toBe(201);

      const detail = await app.inject({ method: 'GET', url: `/api/auctions/${slug}` });
      expect(detail.json()).toMatchObject({
        currentPriceCents: 50100,
        bidCount: 2,
        currentBidder: 'theo',
      });
      expect(detail.json().bidHistory).toHaveLength(2);
      expect(
        detail.json().bidHistory.map((bid: { amountCents: number }) => bid.amountCents),
      ).toEqual([50100, 50000]);

      await cleanup.query(
        `UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE slug = $1`,
        [slug],
      );
      const endedBid = await app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        payload: { userId: 4, amountCents: 50200 },
      });
      expect(endedBid.statusCode).toBe(409);
      expect(endedBid.json()).toEqual({
        code: 'AUCTION_ENDED',
        error: 'This auction has ended',
      });
    } finally {
      await cleanup.query('DELETE FROM auctions WHERE slug = $1', [slug]);
    }
  });

  it('serializes simultaneous identical bids so only one is accepted', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/auctions',
      payload: {
        userId: 1,
        title: `Concurrent Bid Test ${Date.now()}`,
        category: 'GPUs',
        description: 'A temporary listing used to prove atomic concurrent bid acceptance.',
        condition: 'Used · Fully tested',
        location: 'San Jose, CA',
        startingPriceCents: 70000,
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    const { slug } = created.json() as { slug: string };
    const blocker = await cleanup.connect();

    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE bids IN SHARE MODE');

      const pending = [2, 3, 4].map((userId) =>
        app.inject({
          method: 'POST',
          url: `/api/auctions/${slug}/bids`,
          payload: { userId, amountCents: 70000 },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await blocker.query('COMMIT');

      const responses = await Promise.all(pending);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409, 409]);
      for (const conflict of responses.filter((response) => response.statusCode === 409)) {
        expect(conflict.json()).toMatchObject({
          code: 'BID_TOO_LOW',
          currentPriceCents: 70000,
          minimumBidCents: 70100,
          bidCount: 1,
        });
      }

      const detail = await app.inject({ method: 'GET', url: `/api/auctions/${slug}` });
      expect(detail.json().bidHistory).toHaveLength(1);
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
      await cleanup.query('DELETE FROM auctions WHERE slug = $1', [slug]);
    }
  });

  it('rejects a bid that arrived before close but acquired the auction lock afterward', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/auctions',
      payload: {
        userId: 1,
        title: `Deadline Lock Test ${Date.now()}`,
        category: 'Networking',
        description:
          'A temporary listing used to prove deadline checks occur after lock acquisition.',
        condition: 'Certified refurbished',
        location: 'Portland, OR',
        startingPriceCents: 90000,
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    const { slug } = created.json() as { slug: string };
    const blocker = await cleanup.connect();

    try {
      await blocker.query('BEGIN');
      await blocker.query(
        `UPDATE auctions
         SET ends_at = clock_timestamp() + interval '500 milliseconds'
         WHERE slug = $1`,
        [slug],
      );

      const pendingBid = app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        payload: { userId: 2, amountCents: 90000 },
      });
      await new Promise((resolve) => setTimeout(resolve, 700));
      await blocker.query('COMMIT');

      const response = await pendingBid;
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        code: 'AUCTION_ENDED',
        error: 'This auction has ended',
      });

      const detail = await app.inject({ method: 'GET', url: `/api/auctions/${slug}` });
      expect(detail.json().bidHistory).toHaveLength(0);
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
      await cleanup.query('DELETE FROM auctions WHERE slug = $1', [slug]);
    }
  });
});
