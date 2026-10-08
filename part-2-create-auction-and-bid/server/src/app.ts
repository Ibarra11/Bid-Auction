import Fastify from 'fastify';
import pg from 'pg';
import { z } from 'zod';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://auction:auction@localhost:55432/auction_part_2';

const categorySchema = z.enum(['GPUs', 'CPUs', 'Memory', 'Chassis', 'Networking', 'Cooling']);
const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: categorySchema.optional(),
});
const slugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

type AuctionRow = {
  slug: string;
  title: string;
  kicker: string;
  category: string;
  art: string;
  starting_price_cents: number;
  ends_at: Date;
  seller_id: number;
  seller_display_name: string;
  seller_handle: string;
  location: string;
  condition: string;
  description: string;
  specs: Array<[string, string]>;
};

const auctionSelect = `
  SELECT a.slug, a.title, a.kicker, a.category, a.art, a.starting_price_cents,
    a.ends_at, a.location, a.condition, a.description, a.specs,
    seller.id AS seller_id, seller.display_name AS seller_display_name,
    seller.handle AS seller_handle
  FROM auctions a
  JOIN users seller ON seller.id = a.seller_user_id`;

function toAuction(row: AuctionRow) {
  return {
    slug: row.slug,
    title: row.title,
    kicker: row.kicker,
    category: row.category,
    art: row.art,
    currentPriceCents: row.starting_price_cents,
    bidCount: 0,
    currentBidder: null,
    endsAt: row.ends_at.toISOString(),
    seller: {
      id: row.seller_id,
      displayName: row.seller_display_name,
      handle: row.seller_handle,
    },
    location: row.location,
    condition: row.condition,
    description: row.description,
    specs: row.specs,
  };
}

export function buildApp() {
  const app = Fastify({ logger: true, requestIdHeader: 'x-request-id' });
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 1000 });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.get('/api/health', async (request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { ok: true, db: 'ok', requestId: request.id };
    } catch (error) {
      request.log.error({ err: error }, 'database health check failed');
      return reply.code(503).send({ ok: false, db: 'down', requestId: request.id });
    }
  });

  app.get('/api/users', async () => {
    const result = await pool.query<{ id: number; display_name: string; handle: string }>(
      'SELECT id, display_name, handle FROM users ORDER BY id',
    );
    return result.rows.map((user) => ({
      id: user.id,
      displayName: user.display_name,
      handle: user.handle,
    }));
  });

  app.get('/api/auctions', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid auction filters' });
    }

    const result = await pool.query<AuctionRow>(
      `${auctionSelect}
       WHERE ($1 = '' OR concat_ws(' ', a.title, a.kicker, a.category) ILIKE '%' || $1 || '%')
         AND ($2 = '' OR a.category = $2)
       ORDER BY a.ends_at ASC, a.id ASC`,
      [parsed.data.q ?? '', parsed.data.category ?? ''],
    );
    return result.rows.map(toAuction);
  });

  app.get('/api/auctions/:slug', async (request, reply) => {
    const parsed = slugParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid auction slug' });
    }

    const result = await pool.query<AuctionRow>(`${auctionSelect} WHERE a.slug = $1`, [
      parsed.data.slug,
    ]);
    if (!result.rows[0]) {
      return reply.code(404).send({ error: 'Auction not found' });
    }
    return toAuction(result.rows[0]);
  });

  app.addHook('onClose', async () => pool.end());
  return app;
}
