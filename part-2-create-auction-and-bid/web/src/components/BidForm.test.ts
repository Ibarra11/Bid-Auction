import { describe, expect, it } from 'vitest';
import { BidRequestError } from '../catalog';
import { staleBidMessage } from './BidForm';

describe('stale bid feedback', () => {
  it('turns an authoritative minimum into actionable copy', () => {
    const error = new BidRequestError('Bid is below the current minimum', 409, {
      code: 'BID_TOO_LOW',
      minimumBidCents: 10200,
      currentPriceCents: 10100,
      bidCount: 4,
    });

    expect(staleBidMessage(error)).toBe('Another bid arrived first. The new minimum is $102.');
  });

  it('does not treat other conflicts as stale bids', () => {
    const error = new BidRequestError('This auction has ended', 409, {
      code: 'AUCTION_ENDED',
    });

    expect(staleBidMessage(error)).toBeNull();
  });
});
