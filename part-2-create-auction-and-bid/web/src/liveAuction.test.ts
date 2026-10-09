import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFallbackRefreshController, createRefreshCoalescer } from './liveAuction';

afterEach(() => vi.useRealTimers());

describe('auction refresh coalescing', () => {
  it('runs at most one trailing refresh while a refresh is in flight', async () => {
    let release: (() => void) | undefined;
    const firstRefresh = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstRefresh)
      .mockResolvedValue(undefined);
    const coalescedRefresh = createRefreshCoalescer(refresh);

    const first = coalescedRefresh();
    const second = coalescedRefresh();
    const third = coalescedRefresh();
    const fourth = coalescedRefresh();
    expect(refresh).toHaveBeenCalledTimes(1);

    release?.();
    await Promise.all([first, second, third, fourth]);

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('allows a later notification to refresh after the prior burst completes', async () => {
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const coalescedRefresh = createRefreshCoalescer(refresh);

    await coalescedRefresh();
    await coalescedRefresh();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('degraded realtime refresh', () => {
  it('refreshes immediately and every five seconds until realtime recovers', () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const fallback = createFallbackRefreshController(refresh);

    fallback.update('polling');
    fallback.update('polling');
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(3);

    fallback.update('live');
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
