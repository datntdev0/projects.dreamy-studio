CREATE TABLE ws_library_prompts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, rights TEXT NOT NULL, origin TEXT NOT NULL, collection_id INTEGER NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX idx_ws_library_prompts_name ON ws_library_prompts (name COLLATE NOCASE);
CREATE INDEX idx_ws_library_prompts_collection_id ON ws_library_prompts (collection_id);
