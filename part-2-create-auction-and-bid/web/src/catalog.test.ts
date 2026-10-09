import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAuctions, formatCurrency, formatTimeLeft, parseDollarsToCents } from './catalog';

afterEach(() => vi.restoreAllMocks());

describe('catalog helpers', () => {
  it('formats integer cents as USD', () => {
    expect(formatCurrency(12345)).toBe('$123.45');
    expect(formatCurrency(10000)).toBe('$100');
  });

  it('formats remaining time and ended auctions', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    expect(formatTimeLeft('2026-01-01T14:05:00.000Z', now)).toBe('2h 5m');
    expect(formatTimeLeft('2026-01-01T11:59:00.000Z', now)).toBe('Ended');
  });

  it('parses dollar input into exact integer cents', () => {
    expect(parseDollarsToCents('1250')).toBe(125000);
    expect(parseDollarsToCents('1250.09')).toBe(125009);
    expect(parseDollarsToCents('12.999')).toBeNull();
    expect(parseDollarsToCents('0')).toBeNull();
  });

  it('sends text and category filters to the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchAuctions('  server rack  ', 'Chassis');

    expect(fetchMock).toHaveBeenCalledWith('/api/auctions?q=server+rack&category=Chassis');
  });
});
