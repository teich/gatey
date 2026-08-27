CREATE TABLE IF NOT EXISTS gate_codes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES organization (id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  pin TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('home', 'ongoing', 'temporary')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  controller_ends_at TEXT NOT NULL,
  controller_visitor_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'disabled')),
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gate_codes_household_state_kind
ON gate_codes (household_id, state, kind);

-- Preserve Gatey-created temporary codes as first-class Gatey codes.
INSERT OR IGNORE INTO gate_codes (
  id, household_id, label, pin, kind, starts_at, ends_at, controller_ends_at,
  controller_visitor_id, state, disabled_at, created_at, updated_at
)
SELECT
  id, household_id, label, pin, 'temporary', starts_at, ends_at, ends_at,
  controller_visitor_id,
  CASE WHEN revoked_at IS NULL THEN 'active' ELSE 'disabled' END,
  revoked_at, created_at, created_at
FROM credentials;

-- Existing manually managed UniFi visitors remain outside Gatey until an
-- administrator explicitly moves each one through the migration flow.
