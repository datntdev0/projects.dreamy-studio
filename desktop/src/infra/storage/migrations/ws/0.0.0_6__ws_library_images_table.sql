CREATE TABLE ws_library_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    rights TEXT NOT NULL,
    origin TEXT NOT NULL,
    collection_id INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_ws_library_images_name ON ws_library_images (name COLLATE NOCASE);
CREATE INDEX idx_ws_library_images_collection_id ON ws_library_images (collection_id);
