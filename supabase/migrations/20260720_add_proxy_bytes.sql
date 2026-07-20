-- Track approximate proxy bandwidth used per monitor cycle, so the dashboard
-- can show real MB/GB usage instead of guessing at IPRoyal projections.

ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS proxy_bytes bigint;
