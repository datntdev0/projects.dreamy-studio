CREATE TABLE ws_novel_translation_dictionary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_id INTEGER NOT NULL REFERENCES ws_novels (id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    src TEXT NOT NULL,
    dst TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'term',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (novel_id, target, src)
);
CREATE INDEX ix_ws_novel_translation_dictionary_novel ON ws_novel_translation_dictionary (novel_id, target);
