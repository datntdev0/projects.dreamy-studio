CREATE TABLE ws_library_voices_next (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    engine TEXT NOT NULL,
    engine_kind TEXT NOT NULL,
    source TEXT NOT NULL,
    language TEXT NOT NULL,
    gender TEXT NOT NULL,
    preset TEXT NULL,
    reference_kind TEXT NULL,
    reference_sound_id INTEGER NULL,
    reference_name TEXT NOT NULL,
    sample_text TEXT NOT NULL,
    sample_duration_ms INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    rights TEXT NOT NULL DEFAULT 'own',
    collection_id INTEGER NULL
);

INSERT INTO ws_library_voices_next (
    id, name, engine, engine_kind, source, language, gender, preset,
    reference_kind, reference_sound_id, reference_name, sample_text, sample_duration_ms,
    created_at, updated_at, rights, collection_id
)
SELECT
    id, name, engine, engine_kind, source, language, gender, preset,
    reference_kind, reference_sound_id, reference_name, sample_text, sample_duration_ms,
    created_at, updated_at, rights, collection_id
FROM ws_library_voices;

DROP TABLE ws_library_voices;

ALTER TABLE ws_library_voices_next RENAME TO ws_library_voices;

CREATE INDEX idx_ws_library_voices_created_at ON ws_library_voices (created_at);
CREATE INDEX idx_ws_library_voices_reference_sound_id ON ws_library_voices (reference_sound_id);
CREATE INDEX idx_ws_library_voices_collection_id ON ws_library_voices (collection_id);
