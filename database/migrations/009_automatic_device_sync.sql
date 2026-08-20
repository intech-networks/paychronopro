CREATE TABLE IF NOT EXISTS scheduler_sync_configurations (
  agent_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (interval_minutes BETWEEN 1 AND 10080),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS scheduler_one_active_job_per_device_idx
  ON scheduler_sync_jobs (device_id)
  WHERE status IN ('pending', 'running') AND device_id IS NOT NULL;
