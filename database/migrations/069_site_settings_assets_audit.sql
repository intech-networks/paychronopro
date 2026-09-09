ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS favicon_data BYTEA,
  ADD COLUMN IF NOT EXISTS favicon_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS favicon_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_favicon_mime_type_check'
  ) THEN
    ALTER TABLE site_settings
      ADD CONSTRAINT site_settings_favicon_mime_type_check
      CHECK (favicon_mime_type IS NULL OR favicon_mime_type IN ('image/png', 'image/x-icon'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_favicon_pair_check'
  ) THEN
    ALTER TABLE site_settings
      ADD CONSTRAINT site_settings_favicon_pair_check
      CHECK ((favicon_data IS NULL) = (favicon_mime_type IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_favicon_size_check'
  ) THEN
    ALTER TABLE site_settings
      ADD CONSTRAINT site_settings_favicon_size_check
      CHECK (favicon_data IS NULL OR OCTET_LENGTH(favicon_data) BETWEEN 1 AND 524288);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS site_settings_audit (
  id BIGSERIAL PRIMARY KEY,
  site_settings_id SMALLINT NOT NULL DEFAULT 1 REFERENCES site_settings(id) ON DELETE CASCADE,
  changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  site_name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  has_logo BOOLEAN NOT NULL DEFAULT FALSE,
  has_favicon BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS site_settings_audit_changed_at_idx
  ON site_settings_audit (changed_at DESC, id DESC);
