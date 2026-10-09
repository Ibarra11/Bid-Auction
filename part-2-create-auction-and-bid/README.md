# Auction House — Part 2

```sh
npm install
npm start
```

`npm start` ensures the shared PostgreSQL and Redis containers and isolated `auction_part_2`
database are ready, runs pending migrations, and starts both apps. Open
<http://localhost:5102> (API <http://localhost:3102>).

Auction detail pages use Socket.IO rooms for live bid invalidations. The API publishes
committed bid changes through Redis so watchers connected to any API instance refetch the
authoritative auction. If realtime is unavailable, detail pages visibly degrade to a
five-second HTTP refresh until the connection recovers.

Use `npm run db:reset` to discard Part 2 data and restore the ten predefined users and six
seeded auctions. It does not affect databases used by other parts.
