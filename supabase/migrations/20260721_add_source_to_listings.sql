-- Add source column to listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source text not null default 'njuskalo';

-- Create an index on the source column since we will filter by it often in the dashboard
CREATE INDEX IF NOT EXISTS listings_source_idx ON listings (source);
