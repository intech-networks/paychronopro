CREATE TABLE IF NOT EXISTS scheduler_device_user_pushes (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  device_id BIGINT NOT NULL REFERENCES scheduler_devices(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT NOT NULL DEFAULT '',
  UNIQUE (device_id, employee_id)
);

CREATE INDEX IF NOT EXISTS scheduler_device_user_pushes_agent_status_idx
  ON scheduler_device_user_pushes (agent_id, status, requested_at);
