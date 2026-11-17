CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credentials TEXT NOT NULL,
  snapshot TEXT NOT NULL DEFAULT '[]',
  last_sync TEXT,
  last_attempt INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
