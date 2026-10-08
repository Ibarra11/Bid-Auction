# Auction Marketplace

This context describes the people, listings, and offers that make up the auction marketplace.

## Language

**User**:
One of the predefined people who can sell equipment or bid on another user's auction.
_Avoid_: Account, customer

**Auction**:
A published listing through which a seller offers one item for bidding until a specified closing time.
_Avoid_: Product, item listing

**Seller**:
The user who publishes and owns an auction.
_Avoid_: Vendor

**Bid**:
An accepted offer from a user to pay a specified amount for an auctioned item.
_Avoid_: Maximum bid, proxy bid

**Starting Price**:
The amount from which bidding begins before an auction has accepted any bids.
_Avoid_: Opening bid

**Current Amount**:
The starting price when there are no accepted bids, or the highest accepted bid thereafter.
_Avoid_: Asking price

**Minimum Bid**:
The starting price before any bid is accepted, or one dollar above the highest accepted bid thereafter.
_Avoid_: Minimum raise

**Bid History**:
The chronological record of every accepted bid, including its bidder, amount, and time.
_Avoid_: Activity log

**Ended Auction**:
An auction whose closing time has passed and which no longer accepts bids, while remaining visible with its final bidding result.
_Avoid_: Closed listing, expired auction
