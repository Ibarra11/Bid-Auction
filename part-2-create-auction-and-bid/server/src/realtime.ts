import type { Server as HttpServer } from 'node:http';
import type { FastifyBaseLogger } from 'fastify';
import { Server } from 'socket.io';
import { z } from 'zod';

const auctionSubscriptionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type AuctionChangedEvent = {
  slug: string;
  bidId: string;
};

type SubscriptionResult = { ok: true } | { ok: false; error: string };

type ClientToServerEvents = {
  'auction:watch': (payload: unknown, acknowledge: (result: SubscriptionResult) => void) => void;
};

type ServerToClientEvents = {
  'auction:changed': (event: AuctionChangedEvent) => void;
};

export function auctionRoom(slug: string): string {
  return `auction:${slug}`;
}

export type AuctionRealtime = {
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

  io.on('connection', (socket) => {
    socket.on('auction:watch', async (payload, acknowledge) => {
      const parsed = auctionSubscriptionSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge({ ok: false, error: 'Invalid auction subscription' });
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
    publishAuctionChanged(event) {
      io.to(auctionRoom(event.slug)).emit('auction:changed', event);
    },

    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
