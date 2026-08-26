CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL DEFAULT 'oren-home',
  label TEXT NOT NULL,
  pin TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  controller_visitor_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'active',
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_household_state_end
ON credentials (household_id, state, ends_at);
