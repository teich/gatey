CREATE TABLE IF NOT EXISTS visitor_pins (
  controller_visitor_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL DEFAULT 'oren-home',
  label TEXT NOT NULL,
  pin TEXT NOT NULL,
  replaced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visitor_pins_household
ON visitor_pins (household_id);
