CREATE TABLE IF NOT EXISTS party_mode (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  household_id TEXT NOT NULL,
  household_name TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_party_mode_state_end
ON party_mode (state, ends_at);
