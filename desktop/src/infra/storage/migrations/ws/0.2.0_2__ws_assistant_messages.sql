CREATE TABLE ws_assistant_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    activities TEXT NOT NULL DEFAULT '[]',
    citations TEXT NOT NULL DEFAULT '[]',
    attachments TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_ws_assistant_messages_session_seq ON ws_assistant_messages (session_id, seq);
