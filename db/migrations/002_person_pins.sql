CREATE TABLE IF NOT EXISTS person_pins (
  controller_user_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL DEFAULT 'oren-home',
  label TEXT NOT NULL,
  pin TEXT NOT NULL,
  replaced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_person_pins_household
ON person_pins (household_id);
