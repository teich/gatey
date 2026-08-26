CREATE TABLE IF NOT EXISTS unifi_person_links (
  controller_user_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user" (id) ON DELETE CASCADE,
  linked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unifi_person_links_user
ON unifi_person_links (user_id);

CREATE TABLE IF NOT EXISTS visitor_households (
  controller_visitor_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES organization (id) ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visitor_households_household
ON visitor_households (household_id);

-- Existing Gatey-created and PIN-managed visitors already have an owner. Preserve
-- those relationships when introducing explicit admin assignments.
INSERT OR IGNORE INTO visitor_households (controller_visitor_id, household_id, assigned_at)
SELECT controller_visitor_id, household_id, created_at
FROM credentials;

INSERT OR IGNORE INTO visitor_households (controller_visitor_id, household_id, assigned_at)
SELECT controller_visitor_id, household_id, replaced_at
FROM visitor_pins;
