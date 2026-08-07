CREATE TABLE ws_novel_chapters (
    id TEXT PRIMARY KEY,
    novel_id INTEGER NOT NULL REFERENCES ws_novels (id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    title TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    translation_status TEXT NOT NULL DEFAULT 'none',
    analysis_status TEXT NOT NULL DEFAULT 'none',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (novel_id, seq)
);
