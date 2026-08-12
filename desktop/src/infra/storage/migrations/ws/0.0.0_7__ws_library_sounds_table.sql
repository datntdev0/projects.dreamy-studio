CREATE TABLE ws_library_sounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    sample_rate INTEGER NOT NULL,
    channels INTEGER NOT NULL,
    peaks BLOB NOT NULL,
    overview BLOB NOT NULL,
    rights TEXT NOT NULL,
    origin TEXT NOT NULL,
    collection_id INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_ws_library_sounds_name ON ws_library_sounds (name COLLATE NOCASE);
CREATE INDEX idx_ws_library_sounds_collection_id ON ws_library_sounds (collection_id);
