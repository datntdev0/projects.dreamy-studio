CREATE TABLE ws_tags (
    id TEXT NOT NULL,
    tag TEXT NOT NULL,
    type TEXT NOT NULL,
    PRIMARY KEY (type, id, tag)
);

CREATE INDEX idx_ws_tags_type_tag ON ws_tags (type, tag);
