CREATE TABLE IF NOT EXISTS unifi_service_accounts (
  controller_user_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  marked_at TEXT NOT NULL,
  marked_by_user_id TEXT NOT NULL,
  marked_by_name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unifi_service_accounts_marked_at
ON unifi_service_accounts (marked_at DESC);
