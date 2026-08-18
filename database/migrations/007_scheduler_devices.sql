CREATE TABLE IF NOT EXISTS scheduler_devices (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  ip_address INET NOT NULL,
  port INTEGER NOT NULL DEFAULT 4370 CHECK (port BETWEEN 1 AND 65535),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'online', 'offline')),
  last_checked_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, ip_address, port)
);
CREATE INDEX IF NOT EXISTS scheduler_devices_agent_idx ON scheduler_devices (agent_id, name);
