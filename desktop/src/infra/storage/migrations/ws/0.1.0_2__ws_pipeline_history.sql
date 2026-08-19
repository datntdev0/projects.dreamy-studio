CREATE TABLE ws_pipeline_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_id INTEGER NOT NULL REFERENCES ws_novels (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    total INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
);
CREATE INDEX ix_ws_pipeline_history_novel ON ws_pipeline_history (novel_id, id DESC);
