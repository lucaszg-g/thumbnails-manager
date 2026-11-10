CREATE TABLE IF NOT EXISTS calendar_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config TEXT,
  tokens TEXT,
  calendar_id TEXT,
  last_sync TEXT,
  last_error TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO calendar_connection (id) VALUES (1);
CREATE TABLE IF NOT EXISTS calendar_events (
  job_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  fingerprint TEXT,
  overdue_event_id TEXT,
  reminded_due TEXT
);
CREATE TABLE IF NOT EXISTS calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
