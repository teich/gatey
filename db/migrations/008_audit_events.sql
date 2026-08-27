CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  household_id TEXT,
  household_name TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
ON audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_household_occurred_at
ON audit_events (household_id, occurred_at DESC);
