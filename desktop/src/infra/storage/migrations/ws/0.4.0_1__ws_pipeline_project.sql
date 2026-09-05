CREATE TABLE ws_pipeline_history_backup AS SELECT * FROM ws_pipeline_history;
CREATE TABLE ws_pipeline_tasks_backup AS SELECT * FROM ws_pipeline_tasks;
DROP TABLE ws_pipeline_tasks;
DROP TABLE ws_pipeline_history;
CREATE TABLE ws_pipeline_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_id INTEGER REFERENCES ws_novels (id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES ws_projects (id) ON DELETE CASCADE,
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
INSERT INTO ws_pipeline_history
    (id, novel_id, kind, target, status, total, done, failed, created_at, started_at, finished_at)
SELECT id, novel_id, kind, target, status, total, done, failed, created_at, started_at, finished_at
FROM ws_pipeline_history_backup;
CREATE TABLE ws_pipeline_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id INTEGER NOT NULL REFERENCES ws_pipeline_history (id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL,
    segment_id TEXT,
    passage INTEGER,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    started_at TEXT,
    finished_at TEXT
);
INSERT INTO ws_pipeline_tasks
    (id, pipeline_id, chapter_id, passage, status, progress, error, started_at, finished_at)
SELECT id, pipeline_id, chapter_id, passage, status, progress, error, started_at, finished_at
FROM ws_pipeline_tasks_backup;
DROP TABLE ws_pipeline_tasks_backup;
DROP TABLE ws_pipeline_history_backup;
CREATE INDEX ix_ws_pipeline_history_novel ON ws_pipeline_history (novel_id, id DESC);
CREATE INDEX ix_ws_pipeline_history_project ON ws_pipeline_history (project_id, id DESC);
CREATE INDEX ix_ws_pipeline_tasks_pipeline ON ws_pipeline_tasks (pipeline_id);
