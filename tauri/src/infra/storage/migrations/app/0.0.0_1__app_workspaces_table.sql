CREATE TABLE app_workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    path_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    last_opened_at TEXT NOT NULL
);

CREATE INDEX idx_app_workspaces_last_opened_at ON app_workspaces (last_opened_at DESC);
