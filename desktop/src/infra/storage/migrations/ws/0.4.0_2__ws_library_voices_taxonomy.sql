ALTER TABLE ws_library_voices ADD COLUMN rights TEXT NOT NULL DEFAULT 'own';
ALTER TABLE ws_library_voices ADD COLUMN collection_id INTEGER NULL;
CREATE INDEX idx_ws_library_voices_collection_id ON ws_library_voices (collection_id);
