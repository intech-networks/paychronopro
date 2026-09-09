CREATE TABLE IF NOT EXISTS site_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_name TEXT NOT NULL DEFAULT 'PayTimePro' CHECK (LENGTH(BTRIM(site_name)) BETWEEN 1 AND 80),
  tagline TEXT NOT NULL DEFAULT 'Simple, secure payroll for modern teams.' CHECK (LENGTH(tagline) <= 160),
  support_email TEXT NOT NULL DEFAULT 'hello@paytimepro.com' CHECK (LENGTH(support_email) <= 254),
  footer_text TEXT NOT NULL DEFAULT 'Secure workforce access' CHECK (LENGTH(footer_text) <= 120),
  primary_color TEXT NOT NULL DEFAULT '#17314D' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color TEXT NOT NULL DEFAULT '#3F5872' CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color TEXT NOT NULL DEFAULT '#9A6D4A' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('site_settings', 'Site Settings', 'Manage site identity, logo, and application colors.', 12)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT role.id, module.id, TRUE, TRUE, TRUE, TRUE
FROM roles role
CROSS JOIN modules module
WHERE role.name = 'Administrator'
  AND module.module_key = 'site_settings'
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_create = TRUE,
  can_view = TRUE,
  can_update = TRUE,
  can_delete = TRUE,
  updated_at = NOW();
