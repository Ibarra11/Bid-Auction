CREATE TABLE bids (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auction_id bigint NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_user_id integer NOT NULL REFERENCES users(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bids_auction_created_idx ON bids (auction_id, created_at DESC, id DESC);
