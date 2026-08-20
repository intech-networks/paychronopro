CREATE TABLE IF NOT EXISTS scheduler_device_user_checks (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  device_id BIGINT NOT NULL REFERENCES scheduler_devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  users_found INTEGER,
  users_queued INTEGER,
  error TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS scheduler_one_active_user_check_per_device_idx
  ON scheduler_device_user_checks (device_id)
  WHERE status IN ('pending','running');
