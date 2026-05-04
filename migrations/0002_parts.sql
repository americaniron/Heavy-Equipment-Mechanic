-- 0002_parts.sql
-- Parts catalog + FTS5 mirror for typeahead search.
-- Source files live in ./data/ and are ingested by a script in the next slice
-- (cat_parts_inventory.xls ~26K rows, costex_2026.pdf ~17K rows).

CREATE TABLE parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  make TEXT NOT NULL,
  model_compat_json TEXT,
  price_usd REAL,
  stock_status TEXT,
  source_file TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (part_number, source_file)
);
CREATE INDEX idx_parts_make ON parts(make);
CREATE INDEX idx_parts_category ON parts(category);

-- FTS5 mirror over the searchable columns. content='parts' keeps storage
-- compact; triggers below replicate inserts/updates/deletes.
CREATE VIRTUAL TABLE parts_fts USING fts5(
  part_number,
  description,
  model_compat_json,
  content='parts',
  content_rowid='id',
  tokenize='porter unicode61'
);

-- Sync triggers: keep parts_fts coherent with parts.
CREATE TRIGGER parts_ai AFTER INSERT ON parts BEGIN
  INSERT INTO parts_fts(rowid, part_number, description, model_compat_json)
  VALUES (new.id, new.part_number, new.description, new.model_compat_json);
END;

CREATE TRIGGER parts_ad AFTER DELETE ON parts BEGIN
  INSERT INTO parts_fts(parts_fts, rowid, part_number, description, model_compat_json)
  VALUES ('delete', old.id, old.part_number, old.description, old.model_compat_json);
END;

CREATE TRIGGER parts_au AFTER UPDATE ON parts BEGIN
  INSERT INTO parts_fts(parts_fts, rowid, part_number, description, model_compat_json)
  VALUES ('delete', old.id, old.part_number, old.description, old.model_compat_json);
  INSERT INTO parts_fts(rowid, part_number, description, model_compat_json)
  VALUES (new.id, new.part_number, new.description, new.model_compat_json);
END;
