# GRILL.md — Part 2: Create auctions and bid

These product and domain decisions were agreed before implementation.

## Actors

- Ten predefined users are seeded in PostgreSQL.
- A new browser tab starts as a randomly selected seeded user. The selection is stored for
  that tab so navigation and reloads keep the same identity, while separate tabs can start
  as different users.
- A small user switcher can change the active user for the current tab, and the app shows
  the active user's identity.
- There is no authentication. The active user owns auctions they post and cannot bid on
  their own auctions.

## Auctions

- A listing requires title, category, description, condition, location, starting price,
  and a future closing time. The active user supplies seller identity.
- Listings publish immediately and cannot be edited or cancelled in this capability.
- Closing timestamps are stored in UTC and displayed in the browser's local time. An
  auction closes at its configured time without an automatic extension. Ended auctions
  remain visible with their final amount, highest bidder, and bid history, but reject bids.
- Product artwork is selected from the existing category-based illustrations; there are
  no uploads or external image URLs.
- New listings do not accept specifications. The details page hides the specifications
  section when none exist.
- Categories are limited to GPUs, CPUs, Memory, Chassis, Networking, and Cooling. Condition
  is selected from a controlled list.
- The six existing catalog items are seeded into PostgreSQL and all catalog, search, and
  detail views read through the API.
- Text search and category filters query database-backed auctions. The supported ordering
  is ending soonest; price and bid-count sorting are outside this capability.

## Money and bidding

- USD values are stored as integer cents: for example, `$123.45` is stored as `12345`.
  Floating-point values are never used for money calculations.
- With no accepted bids, the first bid may equal the starting price. Every later bid must
  be at least $1 above the highest accepted bid.
- Every accepted bid is stored and shown with bidder, amount, and timestamp.
- Bids cannot be edited or withdrawn.
- Part 2 guarantees ordinary sequential behavior. Simultaneous bids can both validate
  against the same previous amount; transaction locking is deliberately deferred to Part 3.
- Checkout and payment after an auction closes are outside this capability.

## Reset behavior

`npm run db:reset` drops only `auction_part_2`, recreates it, applies migrations, and
restores the ten demo users and six original auctions. User-created auctions and bids are
discarded. Normal starts and container restarts preserve data.

## Delivery slices

1. Database-backed marketplace and tab-scoped predefined-user switching.
2. Post and immediately view an auction as the active user.
3. Place, validate, persist, and inspect bids through auction close.
