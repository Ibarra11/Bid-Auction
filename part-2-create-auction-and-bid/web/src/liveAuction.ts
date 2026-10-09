import { io } from 'socket.io-client';

export type AuctionChangedEvent = {
  slug: string;
  bidId: string;
};

export type LiveAuctionStatus = 'connecting' | 'live' | 'polling';
type RealtimeStatusEvent = { status: 'ok' | 'degraded' };

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

export function createFallbackRefreshController(refresh: () => void) {
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    update(status: LiveAuctionStatus) {
      if (status === 'polling' && timer === null) {
        refresh();
        timer = setInterval(refresh, 5_000);
      }
      if (status === 'live' && timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
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
  let subscribed = false;

  function subscribe() {
    if (!socket.connected || subscribed) return;
    socket.emit('auction:watch', { slug }, (result: SubscriptionResult) => {
      subscribed = result.ok;
      if (!result.ok) {
        handlers.onStatusChanged('polling');
        return;
      }
      handlers.onStatusChanged('live');
      handlers.onSubscribed();
    });
  }

  socket.on('connect', () => {
    subscribed = false;
    handlers.onStatusChanged('connecting');
    subscribe();
  });
  socket.on('auction:changed', (event: AuctionChangedEvent) => {
    if (event.slug === slug) handlers.onChanged(event);
  });
  socket.on('realtime:status', (event: RealtimeStatusEvent) => {
    if (event.status === 'degraded') {
      subscribed = false;
      handlers.onStatusChanged('polling');
      return;
    }
    subscribe();
  });
  socket.on('disconnect', () => {
    subscribed = false;
    handlers.onStatusChanged('polling');
  });
  socket.on('connect_error', () => handlers.onStatusChanged('polling'));

  const connectTimer = window.setTimeout(() => socket.connect(), 0);
  return () => {
    window.clearTimeout(connectTimer);
    socket.disconnect();
  };
}
