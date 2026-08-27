CREATE TABLE IF NOT EXISTS company_holidays (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (LENGTH(BTRIM(name)) BETWEEN 1 AND 140),
  start_date DATE NOT NULL,
  end_date DATE,
  holiday_type TEXT NOT NULL CHECK (holiday_type IN ('regular', 'special_non_working', 'company', 'other')),
  description TEXT NOT NULL DEFAULT '' CHECK (LENGTH(description) <= 2000),
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS company_holidays_active_dates_idx
  ON company_holidays (start_date, end_date)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS company_holidays_active_name_start_idx
  ON company_holidays (LOWER(name), start_date)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS company_events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL CHECK (LENGTH(BTRIM(title)) BETWEEN 1 AND 160),
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  location TEXT NOT NULL DEFAULT '' CHECK (LENGTH(location) <= 200),
  description TEXT NOT NULL DEFAULT '' CHECK (LENGTH(description) <= 4000),
  event_type TEXT NOT NULL CHECK (event_type IN ('company_event', 'meeting', 'training', 'celebration', 'other')),
  organizer_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  attendees TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (COALESCE(end_date, start_date) > start_date OR start_time IS NULL OR end_time > start_time)
);

CREATE INDEX IF NOT EXISTS company_events_active_dates_idx
  ON company_events (start_date, end_date, start_time)
  WHERE status = 'active';

INSERT INTO modules (module_key, name, description, sort_order)
VALUES ('calendar', 'Calendar', 'Company holidays and events.', 45)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT role.id, module.id,
       role.name IN ('Administrator', 'HR Manager'),
       TRUE,
       role.name IN ('Administrator', 'HR Manager'),
       role.name IN ('Administrator', 'HR Manager')
FROM roles role
CROSS JOIN modules module
WHERE module.module_key = 'calendar'
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_create = EXCLUDED.can_create,
  can_view = EXCLUDED.can_view,
  can_update = EXCLUDED.can_update,
  can_delete = EXCLUDED.can_delete,
  updated_at = NOW();
