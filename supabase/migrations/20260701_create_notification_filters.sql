-- Create notification_filters table for saved WhatsApp alert rules
-- Each row is one saved filter rule with an associated phone number

CREATE TABLE notification_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Filter criteria (mirrors Dashboard filters)
  property_types TEXT[] NOT NULL DEFAULT '{}',
  transaction_types TEXT[] NOT NULL DEFAULT '{}',
  sources TEXT[] NOT NULL DEFAULT '{}',
  advertiser_types TEXT[] NOT NULL DEFAULT '{}',
  statuses TEXT[] NOT NULL DEFAULT '{}',

  -- Location filters
  location_counties TEXT[] NOT NULL DEFAULT '{}',
  location_cities TEXT[] NOT NULL DEFAULT '{}',
  location_neighborhoods TEXT[] NOT NULL DEFAULT '{}',

  -- Range filters
  price_min INTEGER,
  price_max INTEGER,
  size_min INTEGER,
  size_max INTEGER,

  -- Tracking
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE notification_filters ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (poll job uses service role key)
CREATE POLICY "Service role full access" ON notification_filters
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Anon/authenticated users can read + write (single-user internal app, no auth layer)
CREATE POLICY "Public full access" ON notification_filters
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for polling job: find active rules quickly
CREATE INDEX idx_notification_filters_active ON notification_filters(is_active) WHERE is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_notification_filters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_filters_updated_at
  BEFORE UPDATE ON notification_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_filters_updated_at();
