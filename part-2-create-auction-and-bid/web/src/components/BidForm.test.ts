import { describe, expect, it } from 'vitest';
import { BidRequestError } from '../catalog';
import { bidConflictMessage } from './BidForm';

describe('stale bid feedback', () => {
  it('turns an authoritative minimum into actionable copy', () => {
    const error = new BidRequestError('Bid is below the current minimum', 409, {
      code: 'BID_TOO_LOW',
      minimumBidCents: 10200,
      currentPriceCents: 10100,
      bidCount: 4,
    });

    expect(bidConflictMessage(error)).toBe('Another bid arrived first. The new minimum is $102.');
  });

  it('explains when an auction ended before the bid was accepted', () => {
    const error = new BidRequestError('This auction has ended', 409, {
      code: 'AUCTION_ENDED',
    });

    expect(bidConflictMessage(error)).toBe('This auction ended before your bid could be accepted.');
  });
});
