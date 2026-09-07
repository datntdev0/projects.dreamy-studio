CREATE TABLE ws_assistant_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    scope_kind TEXT NOT NULL,
    novel_id INTEGER,
    provider TEXT,
    cli_session TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    preview TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    edit_granted INTEGER NOT NULL DEFAULT 0,
    project_id INTEGER
);
CREATE INDEX ix_ws_assistant_sessions_updated ON ws_assistant_sessions (updated_at);
