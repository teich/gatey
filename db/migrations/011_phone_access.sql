CREATE TABLE IF NOT EXISTS user_phone_numbers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'Mobile',
  notes TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  can_open INTEGER NOT NULL DEFAULT 1 CHECK (can_open IN (0, 1)),
  can_hold_open INTEGER NOT NULL DEFAULT 0 CHECK (can_hold_open IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_phone_numbers_user
ON user_phone_numbers (user_id);

CREATE TABLE IF NOT EXISTS twilio_action_attempts (
  id TEXT PRIMARY KEY,
  call_sid TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('open', 'hold_open')),
  caller_e164 TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  household_id TEXT NOT NULL,
  household_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'unknown')),
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  detail TEXT NOT NULL DEFAULT '',
  UNIQUE (call_sid, action)
);

CREATE INDEX IF NOT EXISTS idx_twilio_action_attempts_requested
ON twilio_action_attempts (requested_at DESC);

CREATE TABLE IF NOT EXISTS twilio_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  call_sid TEXT NOT NULL DEFAULT '',
  caller_e164 TEXT NOT NULL DEFAULT '',
  event TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT,
  household_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_twilio_events_occurred
ON twilio_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_twilio_events_call
ON twilio_events (call_sid, occurred_at);
