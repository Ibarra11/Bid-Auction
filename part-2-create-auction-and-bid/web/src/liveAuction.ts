import { io } from 'socket.io-client';

export type AuctionChangedEvent = {
  slug: string;
  bidId: string;
};

export type LiveAuctionStatus = 'connecting' | 'live' | 'reconnecting';

type SubscriptionResult = { ok: true } | { ok: false; error: string };

export function createRefreshCoalescer(refresh: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let trailingRefreshRequested = false;

  return () => {
    if (inFlight) {
      trailingRefreshRequested = true;
      return inFlight;
    }

    const run = async () => {
      let lastError: unknown;
      do {
        trailingRefreshRequested = false;
        try {
          await refresh();
          lastError = undefined;
        } catch (error) {
          lastError = error;
        }
      } while (trailingRefreshRequested);
      if (lastError) throw lastError;
    };

    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export function watchAuctionChanges(
  slug: string,
  handlers: {
    onChanged: (event: AuctionChangedEvent) => void;
    onSubscribed: () => void;
    onStatusChanged: (status: LiveAuctionStatus) => void;
  },
): () => void {
  const socket = io({ autoConnect: false });

  socket.on('connect', () => {
    handlers.onStatusChanged('connecting');
    socket.emit('auction:watch', { slug }, (result: SubscriptionResult) => {
      if (!result.ok) {
        handlers.onStatusChanged('reconnecting');
        return;
      }
      handlers.onStatusChanged('live');
      handlers.onSubscribed();
    });
  });
  socket.on('auction:changed', (event: AuctionChangedEvent) => {
    if (event.slug === slug) handlers.onChanged(event);
  });
  socket.on('disconnect', () => handlers.onStatusChanged('reconnecting'));
  socket.on('connect_error', () => handlers.onStatusChanged('reconnecting'));

  const connectTimer = window.setTimeout(() => socket.connect(), 0);
  return () => {
    window.clearTimeout(connectTimer);
    socket.disconnect();
  };
}
