# Dreamy knowledge

Read and edit the knowledge base of a novel (entities and facts extracted from its chapters) through the `dreamy` MCP server.

This is NOT the translation dictionary. Glossary entries ("từ điển", terms and names to translate) are changed with `edit_translation` (see `dreamy-translation`).

## Tools
- `read_novel_knowledge`: read the knowledge base of one novel by `novelId` and `lang` (`src` is the original text, `VI` and `EN` are translations). It returns the entities (id, type, name, titles, aliases, chapters where they appear), the facts that touch them, and the `types` and `predicates` the ontology allows. Filter with `query` (name, titles or aliases) and `type`. While `next` is not null, call again with `offset` set to `next`; `limit` sets the page size.
- `read_knowledge_issues`: read the issues the knowledge checker finds (id, rule, severity, message, and the entities and facts involved with their evidence) by `novelId` and `lang`. Filter with `issueIds` and `rule`. At most 50 issues are returned.
- `edit_novel_knowledge`: apply `edits` to the knowledge base by `novelId` and `lang`, atomically: if any edit is invalid, none is applied. It returns `{applied, remap}`, where `remap` maps the `ref` of each added item to its new id. Each edit has a required `k`:
  - `rename` {id, name}
  - `retype` {id, type}
  - `del` {id}
  - `merge` {sources: [id], target: id}
  - `fact` {id, pred?, subject?, object?}
  - `props` {id, titles?, aliases?}, it replaces the titles or aliases
  - `evidence` {id, add?: [{chapter, p, q}], remove?: [{chapter, p, q}]}
  - `add_entity` {ref, type, name, titles?, aliases?, ev: [{chapter, p, q}]}
  - `add_fact` {ref, pred, subject, object?, ev: [{chapter, p, q}]}
  - In evidence, `p` is the 1-based paragraph position and `q` a quote from it. Ids, `type` keys and `pred` keys come from `read_novel_knowledge`.
- `submit_knowledge_changes`: submit a set of knowledge edits as one card the user applies or rejects as a whole; see the workflow below.

## Rules
- Read the knowledge with `read_novel_knowledge` before you edit it, and copy ids, `type` keys and `pred` keys from the result.
- New entities and new facts need evidence from chapters that were already analyzed. When the evidence is missing because the chapter was not analyzed yet, tell the user and suggest an analysis run with `start_run` (see `dreamy-pipeline`).
- Edit only when the user asks for a change, and change only what was asked. After an edit, say plainly what changed.
- If an edit tool says editing is not enabled, tell the user to turn it on in the assistant panel.

## Workflow: fix knowledge issues
The caller gives the inputs: `novelId`, `lang` and the ids of the selected issues.
1. Call `read_knowledge_issues` with `novelId` and `lang`, passing the ids as `issueIds`, to read the issues with the entities and facts they involve and their evidence. Use `read_novel_knowledge` if you need more context about an item.
2. Call `read_novel_chapter` (see `dreamy-novel`) with `novelId` to read the evidence passages (chapter and paragraph) and decide what the correct knowledge is.
3. Propose the smallest set of edits that fixes the issues: merge duplicates, retype or rename entities, change or delete facts, fix aliases and evidence. Do not change items the issues do not involve.
4. Call `submit_knowledge_changes` exactly once with `novelId`, `lang`, a short `title` and `changes`. Each change has `target`, `before`, `after`, `reason` (in the user's language), `ev` (a list of `{chapter, p, quote}`) and the `edit` that performs it, in the syntax of `edit_novel_knowledge`.
   - The app tries the edits on a copy of the knowledge base and returns `validation`: `resolves` is the number of issues fixed and `introduces` lists the new issues the edits would cause.
   - If `validation.ok` is false, or the tool returns an error, fix the edits and call `submit_knowledge_changes` again; the last call replaces the earlier one.
5. Leave out issues that cannot be fixed from the existing knowledge and chapters, for example when the chapter must be analysed again, and say which ones in your summary.
6. Do not edit the knowledge base or the novel yourself. The user applies or rejects the change set on the card.
7. Finish with a brief summary in the user's language: what you changed and which issues you left out.
