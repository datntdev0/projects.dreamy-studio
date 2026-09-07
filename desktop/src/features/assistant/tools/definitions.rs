use serde_json::Value;
use serde_json::json;

const ENTRY_TYPES: [&str; 5] = ["name", "place", "org", "title", "term"];

fn novel_id_property() -> Value {
    json!({ "type": "integer", "description": "Novel id from list_novel." })
}

fn target_property() -> Value {
    json!({ "type": "string", "enum": ["VI", "EN"], "description": "Translation target language." })
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

fn base_definitions() -> Value {
    json!([
        {
            "name": "list_novel",
            "description": "List every novel in the workspace with its title, author, language, tags and chapter counts.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "read_novel",
            "description": "Read one novel: its metadata and the outline of its chapters (number, title, word count, translation and analysis status).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property()
                },
                "required": ["novelId"],
                "additionalProperties": false
            }
        },
        {
            "name": "read_novel_chapter",
            "description": "Read the paragraphs of one chapter. Paragraph positions are 1-based. A page holds at most 60 paragraphs or 12000 characters; when `next` is not null, call again with from set to `next`.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "from": { "type": "integer", "minimum": 1, "description": "First paragraph position, default 1." },
                    "to": { "type": "integer", "minimum": 1, "description": "Last paragraph position, default the end of the chapter." }
                },
                "required": ["novelId", "chapter"],
                "additionalProperties": false
            }
        },
        {
            "name": "read_novel_knowledge",
            "description": "Read the knowledge base of one novel: its entities (id, type, name, titles, aliases, chapters where they appear) and the facts that touch them. `types` and `predicates` list the keys the ontology allows. Entities can be filtered by `type` and by a case-insensitive `query` on name, titles or aliases. A page holds 80 entities by default; when `next` is not null, call again with offset set to `next`.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": { "type": "string", "enum": ["src", "VI", "EN"], "description": "Knowledge language: src is the original text, VI and EN are translations." },
                    "query": { "type": "string", "description": "Keep only entities whose name, titles or aliases contain this text." },
                    "type": { "type": "string", "description": "Keep only entities of this type key." },
                    "offset": { "type": "integer", "minimum": 0, "description": "Entities to skip, default 0." },
                    "limit": { "type": "integer", "minimum": 1, "description": "Entities per page, default 80, at most 400." }
                },
                "required": ["novelId", "lang"],
                "additionalProperties": false
            }
        },
        {
            "name": "read_translation",
            "description": "Read the paragraphs of one translated chapter next to their source text. Paragraph positions are 1-based. A page holds at most 60 paragraphs or 12000 characters (source and translation together); when `next` is not null, call again with from set to `next`. It is an error when the chapter has no translation for the target yet.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": target_property(),
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "from": { "type": "integer", "minimum": 1, "description": "First paragraph position, default 1." },
                    "to": { "type": "integer", "minimum": 1, "description": "Last paragraph position, default the end of the chapter." }
                },
                "required": ["novelId", "target", "chapter"],
                "additionalProperties": false
            }
        },
        {
            "name": "read_translation_guide",
            "description": "Read the translation rules of one novel for one target language: the translation guidelines, the dictionary entries (id, src, dst, type, note) and the consistency warnings found in the translated chapters.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": target_property()
                },
                "required": ["novelId", "target"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_novel",
            "description": "Change the metadata of one novel. Only the fields you pass are changed; the novel language cannot be changed. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "title": { "type": "string", "description": "New display title." },
                    "name": { "type": "string", "description": "New name." },
                    "author": { "type": "string", "description": "New author." },
                    "description": { "type": "string", "description": "New description." },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "New full list of tags; it replaces the old list." }
                },
                "required": ["novelId"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_novel_chapter",
            "description": "Rename a chapter and/or replace the text of some of its paragraphs. For every paragraph pass `expected`, its current text exactly as read_novel_chapter returned it. All `expected` values are checked first; if any differs, nothing is written. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "title": { "type": "string", "description": "New chapter title." },
                    "paragraphs": {
                        "type": "array",
                        "description": "Paragraph replacements.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "p": { "type": "integer", "minimum": 1, "description": "1-based paragraph position." },
                                "expected": { "type": "string", "description": "Current text of the paragraph, exactly as read." },
                                "text": { "type": "string", "description": "New text of the paragraph." }
                            },
                            "required": ["p", "expected", "text"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["novelId", "chapter"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_novel_knowledge",
            "description": "Apply edits to the knowledge base of one novel atomically: if any edit is invalid, none is applied. Returns {applied, remap}, where remap maps the `ref` of each added item to its new id. Requires editing to be enabled for the session. `edits` is an array of objects, each with a required \"k\" naming the edit and these fields: rename {id, name}; retype {id, type}; del {id}; merge {sources: [id], target: id}; fact {id, pred?, subject?, object?} to change a fact; props {id, titles?, aliases?} to replace the titles or aliases of an entity; evidence {id, add?: [{chapter, p, q}], remove?: [{chapter, p, q}]}; add_entity {ref, type, name, titles?, aliases?, ev: [{chapter, p, q}]}; add_fact {ref, pred, subject, object?, ev: [{chapter, p, q}]}. In evidence, `chapter` is the chapter number, `p` the 1-based paragraph position and `q` a quote from that paragraph. Ids, `type` keys and `pred` keys come from read_novel_knowledge.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": { "type": "string", "enum": ["src", "VI", "EN"], "description": "Knowledge language: src is the original text, VI and EN are translations." },
                    "edits": {
                        "type": "array",
                        "minItems": 1,
                        "description": "Edits to apply in order.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "k": { "type": "string", "enum": ["rename", "retype", "del", "merge", "fact", "props", "evidence", "add_entity", "add_fact"], "description": "Edit kind." }
                            },
                            "required": ["k"]
                        }
                    }
                },
                "required": ["novelId", "lang", "edits"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_translation_passage",
            "description": "Replace the text of one translated paragraph. Pass `expected`, the current translation exactly as read_translation returned it; if it differs, nothing is written. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": target_property(),
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "p": { "type": "integer", "minimum": 1, "description": "1-based paragraph position." },
                    "expected": { "type": "string", "description": "Current translation of the paragraph, exactly as read." },
                    "text": { "type": "string", "description": "New translation of the paragraph." }
                },
                "required": ["novelId", "target", "chapter", "p", "expected", "text"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_dictionary",
            "description": "Add, update and remove translation dictionary entries of one novel for one target language. Entries are checked first; if one is invalid (a duplicate `src`, an unknown id), nothing is written. Entry types are name, place, org, title and term. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": target_property(),
                    "add": {
                        "type": "array",
                        "description": "Entries to add.",
                        "items": new_dictionary_entry_schema()
                    },
                    "update": {
                        "type": "array",
                        "description": "Entries to change; only the fields you pass are changed.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": { "type": "integer", "description": "Entry id from read_translation_guide." },
                                "src": { "type": "string", "description": "New source term." },
                                "dst": { "type": "string", "description": "New translated term." },
                                "type": { "type": "string", "enum": ENTRY_TYPES, "description": "New entry type." },
                                "note": { "type": "string", "description": "New note." }
                            },
                            "required": ["id"],
                            "additionalProperties": false
                        }
                    },
                    "remove": {
                        "type": "array",
                        "description": "Ids of the entries to delete.",
                        "items": { "type": "integer" }
                    }
                },
                "required": ["novelId", "target"],
                "additionalProperties": false
            }
        },
        {
            "name": "submit_translation_review",
            "description": "Submit the result of a translation review as a card the user can apply or reject item by item. Call it exactly once, after reading the whole chapter; a later call replaces the earlier one. Nothing is written to the novel. Each finding quotes `from`, a snippet copied verbatim from the current translation of paragraph `n`, and the `to` that replaces its first occurrence. Findings whose paragraph or snippet does not match, and dictionary entries whose `src` already exists, are dropped; the result lists them in `dropped` (with the 0-based `index` into the array you sent) so you can fix and submit again.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": target_property(),
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "checked": { "type": "integer", "minimum": 0, "description": "Number of paragraphs you checked." },
                    "findings": {
                        "type": "array",
                        "description": "Problems found in the translation.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "n": { "type": "integer", "minimum": 1, "description": "1-based paragraph position." },
                                "severity": { "type": "string", "enum": ["error", "warning", "info"], "description": "How serious the problem is." },
                                "category": { "type": "string", "enum": ["name", "dict", "meaning", "omission", "style"], "description": "Kind of problem." },
                                "from": { "type": "string", "description": "Snippet of the current translation, copied verbatim. Must not be empty." },
                                "to": { "type": "string", "description": "Text that replaces the first occurrence of `from`." },
                                "reason": { "type": "string", "description": "Why the change is needed, in the user's language." }
                            },
                            "required": ["n", "severity", "category", "from", "to", "reason"],
                            "additionalProperties": false
                        }
                    },
                    "dictionary": {
                        "type": "array",
                        "description": "Dictionary entries worth adding. Terms already in the dictionary are dropped.",
                        "items": new_dictionary_entry_schema()
                    }
                },
                "required": ["novelId", "target", "chapter", "checked", "findings", "dictionary"],
                "additionalProperties": false
            }
        }
    ])
}

fn knowledge_review_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "read_knowledge_issues",
            "description": "Read the issues the knowledge checker finds in the knowledge base of one novel, the same ones the user sees in the Knowledge review tab. Each issue has an id, the rule that raised it, a severity, a message and the items it involves (entities with id, type and name; facts with id, pred, subject and object; every item with its evidence [{chapter, p, q}]). Issues can be filtered by `issueIds` and by `rule`. At most 50 issues are returned.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": { "type": "string", "enum": ["src", "VI", "EN"], "description": "Knowledge language: src is the original text, VI and EN are translations." },
                    "issueIds": { "type": "array", "items": { "type": "string" }, "description": "Keep only the issues with these ids." },
                    "rule": { "type": "string", "description": "Keep only the issues raised by this rule key." }
                },
                "required": ["novelId", "lang"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "submit_knowledge_changes",
            "description": "Submit a set of knowledge edits as one card the user applies or rejects as a whole. The edits are tried on a copy of the knowledge base first and the checker is run on the result; nothing is written. The result is {validation: {ok, resolves, introduces}}: `resolves` counts the issues the edits fix and `introduces` lists the messages of the new issues they would cause; when ok is false, fix the edits and call the tool again, the last call replaces the earlier one. It is an error when an edit cannot be applied. Each change pairs a readable description (`target`, `before`, `after`, `reason`, `ev`) with the `edit` that performs it. The edit has a required \"k\" and these fields: rename {id, name}; retype {id, type}; del {id}; merge {sources: [id], target: id}; fact {id, pred?, subject?, object?}; props {id, titles?, aliases?}; evidence {id, add?: [{chapter, p, q}], remove?: [{chapter, p, q}]}; add_entity {ref, type, name, titles?, aliases?, ev: [{chapter, p, q}]}; add_fact {ref, pred, subject, object?, ev: [{chapter, p, q}]}. Ids, `type` keys and `pred` keys come from read_novel_knowledge and read_knowledge_issues.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": { "type": "string", "enum": ["src", "VI", "EN"], "description": "Knowledge language the edits apply to." },
                    "title": { "type": "string", "description": "Short title of the change set, in the user's language." },
                    "changes": {
                        "type": "array",
                        "minItems": 1,
                        "description": "The changes, applied in order.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "target": { "type": "string", "description": "What is changed, for example the entity name or the predicate." },
                                "before": { "type": "string", "description": "The current state, in a few words." },
                                "after": { "type": "string", "description": "The state after the edit, in a few words." },
                                "reason": { "type": "string", "description": "Why the change fixes the issue, in the user's language." },
                                "ev": {
                                    "type": "array",
                                    "description": "Evidence from the chapters that supports the change.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "chapter": { "type": "integer", "description": "Chapter number." },
                                            "p": { "type": "integer", "minimum": 1, "description": "1-based paragraph position." },
                                            "quote": { "type": "string", "description": "Quote from that paragraph." }
                                        },
                                        "required": ["chapter", "p", "quote"],
                                        "additionalProperties": false
                                    }
                                },
                                "edit": {
                                    "type": "object",
                                    "description": "The knowledge edit that performs the change.",
                                    "properties": {
                                        "k": { "type": "string", "enum": ["rename", "retype", "del", "merge", "fact", "props", "evidence", "add_entity", "add_fact"], "description": "Edit kind." }
                                    },
                                    "required": ["k"]
                                }
                            },
                            "required": ["target", "before", "after", "reason", "ev", "edit"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["novelId", "lang", "title", "changes"],
                "additionalProperties": false
            }
        }),
    ]
}

pub(super) fn novel_definitions() -> Vec<Value> {
    let mut tools = base_definitions().as_array().cloned().unwrap_or_default();
    tools.extend(knowledge_review_definitions());
    tools
}
