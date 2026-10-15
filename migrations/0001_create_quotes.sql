CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  seller_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  pdf_key TEXT,
  pdf_updated_at TEXT
);

CREATE INDEX IF NOT EXISTS quotes_updated_at_idx ON quotes(updated_at DESC);
