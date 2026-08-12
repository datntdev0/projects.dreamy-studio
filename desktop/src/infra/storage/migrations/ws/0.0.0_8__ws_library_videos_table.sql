CREATE TABLE ws_library_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ext TEXT NOT NULL, size INTEGER NOT NULL, duration_ms INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, fps REAL NULL, rights TEXT NOT NULL, origin TEXT NOT NULL, collection_id INTEGER NULL, has_poster INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX idx_ws_library_videos_name ON ws_library_videos (name COLLATE NOCASE);
CREATE INDEX idx_ws_library_videos_collection_id ON ws_library_videos (collection_id);
