CREATE TABLE IF NOT EXISTS organization_positions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_positions_name_idx ON organization_positions (name);

INSERT INTO organization_positions (name) VALUES
  ('Rank and File'),
  ('Department Supervisor'),
  ('Department Manager'),
  ('Area Manager'),
  ('Senior Manager'),
  ('Vice President'),
  ('President'),
  ('Chief Executive Officer')
ON CONFLICT (name) DO NOTHING;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS position_order FROM organization_positions
)
UPDATE organization_positions position SET sort_order = ranked.position_order
FROM ranked WHERE ranked.id = position.id AND position.sort_order = 0;
