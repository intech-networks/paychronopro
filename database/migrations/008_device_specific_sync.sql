ALTER TABLE scheduler_sync_jobs ADD COLUMN IF NOT EXISTS device_id BIGINT REFERENCES scheduler_devices(id) ON DELETE CASCADE;
ALTER TABLE scheduler_backups ADD COLUMN IF NOT EXISTS device_id BIGINT REFERENCES scheduler_devices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS scheduler_jobs_device_status_idx ON scheduler_sync_jobs (device_id, status, requested_at);
CREATE INDEX IF NOT EXISTS scheduler_backups_device_uploaded_idx ON scheduler_backups (device_id, uploaded_at DESC);
