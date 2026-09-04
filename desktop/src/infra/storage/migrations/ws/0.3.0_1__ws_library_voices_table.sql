CREATE TABLE ws_library_voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    engine TEXT NOT NULL,
    engine_kind TEXT NOT NULL,
    source TEXT NOT NULL,
    language TEXT NOT NULL,
    gender TEXT NOT NULL,
    preset TEXT NULL,
    prompt TEXT NOT NULL,
    reference_kind TEXT NULL,
    reference_sound_id INTEGER NULL,
    reference_name TEXT NOT NULL,
    sample_text TEXT NOT NULL,
    sample_duration_ms INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_ws_library_voices_created_at ON ws_library_voices (created_at);
CREATE INDEX idx_ws_library_voices_reference_sound_id ON ws_library_voices (reference_sound_id);
