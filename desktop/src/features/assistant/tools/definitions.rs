use crate::features::assistant::tools::novel::OUTLINE_PAGE;
use crate::features::assistant::tools::paging::NEXT_NOTE;
use serde_json::Value;
use serde_json::json;

const ENTRY_TYPES: [&str; 5] = ["name", "place", "org", "title", "term"];

const KNOWLEDGE_EDIT_KINDS: [&str; 9] = [
    "rename",
    "retype",
    "del",
    "merge",
    "fact",
    "props",
    "evidence",
    "add_entity",
    "add_fact",
];

fn novel_id_property() -> Value {
    json!({ "type": "integer", "description": "Novel id from read_novel." })
}

fn target_property() -> Value {
    json!({ "type": "string", "enum": ["VI", "EN"], "description": "Translation target language." })
}

fn lang_property() -> Value {
    json!({ "type": "string", "enum": ["src", "VI", "EN"], "description": "Knowledge language: src is the original text, VI and EN are translations." })
}

fn from_property() -> Value {
    json!({ "type": "integer", "minimum": 1, "description": "First paragraph position, default 1." })
}

fn to_property() -> Value {
    json!({ "type": "integer", "minimum": 1, "description": "Last paragraph position, default the end of the chapter." })
}

fn chapter_property() -> Value {
    json!({ "type": "integer", "description": "Chapter number from read_novel." })
}

fn paragraph_position_property() -> Value {
    json!({ "type": "integer", "minimum": 1, "description": "1-based paragraph position." })
}

fn new_dictionary_entry_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "src": { "type": "string", "description": "Source term." },
            "dst": { "type": "string", "description": "Translated term." },
            "type": { "type": "string", "enum": ENTRY_TYPES, "description": "Entry type." },
            "note": { "type": "string", "description": "Optional note." }
        },
        "required": ["src", "dst", "type"],
        "additionalProperties": false
    })
}

fn dictionary_update_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "id": { "type": "integer", "description": "Entry id from read_translation with part guide." },
            "src": { "type": "string", "description": "New source term." },
            "dst": { "type": "string", "description": "New translated term." },
            "type": { "type": "string", "enum": ENTRY_TYPES, "description": "New entry type." },
            "note": { "type": "string", "description": "New note." }
        },
        "required": ["id"],
        "additionalProperties": false
    })
}

fn evidence_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "chapter": { "type": "integer", "description": "Chapter number." },
            "p": paragraph_position_property(),
            "quote": { "type": "string", "description": "Quote from that paragraph." }
        },
        "required": ["chapter", "p", "quote"],
        "additionalProperties": false
    })
}

fn knowledge_edit_schema(description: &str) -> Value {
    json!({
        "type": "object",
        "description": description,
        "properties": {
            "k": { "type": "string", "enum": KNOWLEDGE_EDIT_KINDS, "description": "Edit kind." }
        },
        "required": ["k"]
    })
}

fn paragraph_replacement_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "p": paragraph_position_property(),
            "expected": { "type": "string", "description": "Current text of the paragraph, exactly as read." },
            "text": { "type": "string", "description": "New text of the paragraph." }
        },
        "required": ["p", "expected", "text"],
        "additionalProperties": false
    })
}

fn review_finding_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "n": paragraph_position_property(),
            "severity": { "type": "string", "enum": ["error", "warning", "info"], "description": "How serious the problem is." },
            "category": { "type": "string", "enum": ["name", "dict", "meaning", "omission", "style"], "description": "Kind of problem." },
            "from": { "type": "string", "description": "Snippet of the current translation, copied verbatim. Must not be empty." },
            "to": { "type": "string", "description": "Text that replaces the first occurrence of `from`." },
            "reason": { "type": "string", "description": "Why the change is needed, in the user's language." }
        },
        "required": ["n", "severity", "category", "from", "to", "reason"],
        "additionalProperties": false
    })
}

fn knowledge_change_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "target": { "type": "string", "description": "What is changed, for example the entity name or the predicate." },
            "before": { "type": "string", "description": "The current state, in a few words." },
            "after": { "type": "string", "description": "The state after the edit, in a few words." },
            "reason": { "type": "string", "description": "Why the change fixes the issue, in the user's language." },
            "ev": {
                "type": "array",
                "description": "Evidence from the chapters that supports the change.",
                "items": evidence_schema()
            },
            "edit": knowledge_edit_schema("The knowledge edit that performs the change, in the syntax of edit_novel_knowledge.")
        },
        "required": ["target", "before", "after", "reason", "ev", "edit"],
        "additionalProperties": false
    })
}

fn read_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "read_novel",
            "description": format!("Without `novelId`, list every novel (id, title, author, language, tags, chapter count, and per language the number of translated and analyzed chapters). With `novelId`, read one novel: its metadata, per target language the translated chapters and per language the analyzed chapters as number ranges (e.g. \"1-49,52\"), and a page of at most {OUTLINE_PAGE} chapters of the outline (number, title, word count). While `next` is not null, call again with `from` set to `next`."),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id; leave out to list the novels." },
                    "from": { "type": "integer", "minimum": 1, "description": "First chapter number of the outline page, default the first chapter." },
                    "to": { "type": "integer", "minimum": 1, "description": "Last chapter number of the outline page, default the last chapter." }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "read_novel_chapter",
            "description": format!("Read the paragraphs of one chapter; positions are 1-based. {NEXT_NOTE}"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "chapter": chapter_property(),
                    "from": from_property(),
                    "to": to_property()
                },
                "required": ["novelId", "chapter"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "read_novel_knowledge",
            "description": "Read the knowledge base of one novel: its entities (id, type, name, titles, aliases, chapters where they appear), the facts that touch them, and the `types` and `predicates` the ontology allows. Filter entities by `type` and by `query` (name, titles or aliases). While `next` is not null, call again with `offset` set to `next`.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": lang_property(),
                    "query": { "type": "string", "description": "Keep only entities whose name, titles or aliases contain this text." },
                    "type": { "type": "string", "description": "Keep only entities of this type key." },
                    "offset": { "type": "integer", "minimum": 0, "description": "Entities to skip, default 0." },
                    "limit": { "type": "integer", "minimum": 1, "description": "Entities per page, default 80, at most 400." }
                },
                "required": ["novelId", "lang"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "read_translation",
            "description": format!("Read the translation of one novel. `part` text (default) returns the paragraphs of one `chapter` next to their source and fails when the chapter has no translation yet. {NEXT_NOTE} `part` guide returns the translation guidelines, the dictionary entries (id, src, dst, type, note) and the consistency warnings."),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": target_property(),
                    "part": { "type": "string", "enum": ["text", "guide"], "description": "What to read, default text." },
                    "chapter": chapter_property(),
                    "from": from_property(),
                    "to": to_property()
                },
                "required": ["novelId", "target"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "read_knowledge_issues",
            "description": "Read the issues the knowledge checker finds in the knowledge base of one novel, the same ones the user sees in the Knowledge review tab: id, rule, severity, message and the items involved (entities and facts, each with its evidence). Filter by `issueIds` and `rule`. At most 50 issues are returned.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": lang_property(),
                    "issueIds": { "type": "array", "items": { "type": "string" }, "description": "Keep only the issues with these ids." },
                    "rule": { "type": "string", "description": "Keep only the issues raised by this rule key." }
                },
                "required": ["novelId", "lang"],
                "additionalProperties": false
            }
        }),
    ]
}

fn edit_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "edit_novel",
            "description": "Without `chapter`, change the metadata of one novel; only the fields you pass change and the language cannot be changed. With `chapter`, rename that chapter (`title`) and/or replace paragraphs; nothing is written when any `expected` differs from the current text.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel; leave out to change the novel itself." },
                    "title": { "type": "string", "description": "New novel title, or new chapter title when `chapter` is set." },
                    "name": { "type": "string", "description": "New novel name." },
                    "author": { "type": "string", "description": "New novel author." },
                    "description": { "type": "string", "description": "New novel description." },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "New full list of novel tags; it replaces the old list." },
                    "paragraphs": {
                        "type": "array",
                        "description": "Paragraph replacements of the chapter.",
                        "items": paragraph_replacement_schema()
                    }
                },
                "required": ["novelId"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "edit_novel_knowledge",
            "description": "Apply edits to the knowledge base of one novel atomically: if any edit is invalid, none is applied. Returns {applied, remap}, where remap maps the `ref` of each added item to its new id. Each edit has a required \"k\" and these fields: rename {id, name}; retype {id, type}; del {id}; merge {sources: [id], target: id}; fact {id, pred?, subject?, object?}; props {id, titles?, aliases?} replaces the titles or aliases; evidence {id, add?: [{chapter, p, q}], remove?: [{chapter, p, q}]}; add_entity {ref, type, name, titles?, aliases?, ev: [{chapter, p, q}]}; add_fact {ref, pred, subject, object?, ev: [{chapter, p, q}]}. In evidence `p` is the 1-based paragraph position and `q` a quote from it. Ids, `type` keys and `pred` keys come from read_novel_knowledge.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": lang_property(),
                    "edits": {
                        "type": "array",
                        "minItems": 1,
                        "description": "Edits to apply in order.",
                        "items": knowledge_edit_schema("One edit.")
                    }
                },
                "required": ["novelId", "lang", "edits"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "edit_translation",
            "description": "Change the translation of one novel. To change a passage pass `chapter`, `p`, `expected` (the current translation exactly as read) and `text`; nothing is written when `expected` differs. To change the dictionary pass `add`, `update` and/or `remove`; every entry is checked first and one invalid entry (duplicate `src`, unknown id) writes nothing. Make one kind of change per call.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": target_property(),
                    "chapter": chapter_property(),
                    "p": paragraph_position_property(),
                    "expected": { "type": "string", "description": "Current translation of the paragraph, exactly as read." },
                    "text": { "type": "string", "description": "New translation of the paragraph." },
                    "add": {
                        "type": "array",
                        "description": "Dictionary entries to add.",
                        "items": new_dictionary_entry_schema()
                    },
                    "update": {
                        "type": "array",
                        "description": "Dictionary entries to change; only the fields you pass change.",
                        "items": dictionary_update_schema()
                    },
                    "remove": {
                        "type": "array",
                        "description": "Ids of the dictionary entries to delete.",
                        "items": { "type": "integer" }
                    }
                },
                "required": ["novelId", "target"],
                "additionalProperties": false
            }
        }),
    ]
}

fn submit_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "submit_translation_review",
            "description": "Submit the result of a translation review as a card the user applies or rejects item by item; nothing is written to the novel. Call it once, after reading the whole chapter; a later call replaces the earlier one. Each finding quotes `from`, a snippet copied verbatim from the current translation of paragraph `n`, and the `to` that replaces its first occurrence. Findings that do not match and dictionary entries whose `src` already exists come back in `dropped` (with their 0-based `index`): fix them and submit again.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": target_property(),
                    "chapter": chapter_property(),
                    "checked": { "type": "integer", "minimum": 0, "description": "Number of paragraphs you checked." },
                    "findings": {
                        "type": "array",
                        "description": "Problems found in the translation.",
                        "items": review_finding_schema()
                    },
                    "dictionary": {
                        "type": "array",
                        "description": "Dictionary entries worth adding.",
                        "items": new_dictionary_entry_schema()
                    }
                },
                "required": ["novelId", "target", "chapter", "checked", "findings", "dictionary"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "submit_knowledge_changes",
            "description": "Submit a set of knowledge edits as one card the user applies or rejects as a whole. The edits are tried on a copy of the knowledge base and the checker runs on the result; nothing is written. The result is {validation: {ok, resolves, introduces}}: `resolves` counts the issues fixed and `introduces` lists the new issues the edits would cause. When ok is false, or an edit cannot be applied, fix the edits and call again; the last call replaces the earlier one. Each change pairs a readable description (`target`, `before`, `after`, `reason`, `ev`) with the `edit` that performs it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": lang_property(),
                    "title": { "type": "string", "description": "Short title of the change set, in the user's language." },
                    "changes": {
                        "type": "array",
                        "minItems": 1,
                        "description": "The changes, applied in order.",
                        "items": knowledge_change_schema()
                    }
                },
                "required": ["novelId", "lang", "title", "changes"],
                "additionalProperties": false
            }
        }),
    ]
}

pub(super) fn novel_definitions() -> Vec<Value> {
    let mut tools = read_definitions();
    tools.extend(edit_definitions());
    tools.extend(submit_definitions());
    tools
}
