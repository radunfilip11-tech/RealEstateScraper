-- Create seen_listings table to track all ads we've already checked
-- This prevents redundant detail-page fetches for non-private ads across monitor cycles

CREATE TABLE seen_listings (
  external_id text PRIMARY KEY,
  advertiser_type text,
  seen_at timestamptz DEFAULT now(),
  worker_id integer
);

-- Enable Row Level Security
ALTER TABLE seen_listings ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (monitor script uses service role key)
CREATE POLICY "Service role full access" ON seen_listings
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Anon/authenticated users can read (for potential UI stats)
CREATE POLICY "Public read access" ON seen_listings
  FOR SELECT
  USING (true);

-- Index for fast lookups during cycle start
CREATE INDEX idx_seen_listings_seen_at ON seen_listings(seen_at DESC);
