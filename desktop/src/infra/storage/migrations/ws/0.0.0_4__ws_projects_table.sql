CREATE TABLE ws_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    template TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    novel_id INTEGER,
    src_kind TEXT,
    src_lang TEXT,
    range_from INTEGER,
    range_to INTEGER,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    opened_at TEXT NOT NULL
);
