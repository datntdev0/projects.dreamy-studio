CREATE TABLE ws_pipeline_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id INTEGER NOT NULL REFERENCES ws_pipeline_history (id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL,
    passage INTEGER,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    started_at TEXT,
    finished_at TEXT
);
CREATE INDEX ix_ws_pipeline_tasks_pipeline ON ws_pipeline_tasks (pipeline_id);
