# Dreamy translation

Read and edit the translation of a novel, and its translation dictionary, through the `dreamy` MCP server.

## The translation dictionary
The translation dictionary (glossary, "từ điển", terms, names) belongs to the translation. Change it with `edit_translation`.
- It needs no analyzed chapter and no evidence.
- Read the guide first (`read_translation` with `part` `guide`) to get the entry ids and to avoid a duplicate `src`.
- `type` is one of `name`, `place`, `org`, `title`, `term`.
- Never use `edit_novel_knowledge` for dictionary entries: that tool changes the knowledge base, which is a different thing (see `dreamy-knowledge`).

## Tools
- `read_translation`: read the translation of one novel by `novelId` and `target` (`VI` or `EN`).
  - `part` `text` (default) with `chapter` returns the paragraphs of that chapter next to their source; it fails when the chapter has no translation yet. Optional `from` and `to` bound the paragraph positions. While the result has a `next` value, call again with `from` set to `next`.
  - `part` `guide` returns the translation guidelines, the dictionary entries (`id`, `src`, `dst`, `type`, `note`) and the open consistency warnings.
- `edit_translation`: change the translation of one novel by `novelId` and `target`. Make one kind of change per call.
  - Passage: pass `chapter`, `p` (1-based paragraph position), `expected` (the current translation exactly as read) and `text` (the new translation). Nothing is written when `expected` differs.
  - Dictionary: pass `add` (a list of `{src, dst, type, note?}`), `update` (a list of `{id, src?, dst?, type?, note?}`, only the fields you pass change) and/or `remove` (a list of entry ids). Every entry is checked first and one invalid entry (duplicate `src`, unknown id) writes nothing.
- `submit_translation_review`: submit the result of a review as a card; see the workflow below.

## Rules
- Read before you edit: the guide for the dictionary, the chapter text for a passage.
- Edit only when the user asks for a change, and change only what was asked. After an edit, say plainly what changed.
- If an edit tool says editing is not enabled, tell the user to turn it on in the assistant panel.
- Do not change the dictionary or the passages while you run a review: the user applies the items on the review card.

## Workflow: review a chapter
The caller gives the inputs: `novelId`, `target` and the chapter number.
1. Call `read_translation` with `novelId`, `target` and `part` `guide` to learn the translation guidelines, the dictionary and the open consistency warnings.
2. Call `read_translation` with `novelId`, `target` and `chapter` and read every page: while the result has a `next` value, call it again with `from` set to `next`.
3. Call `read_novel_knowledge` (see `dreamy-knowledge`) for `novelId` with `lang` `src` and check that the names of personas and locations in the translation match the knowledge and the dictionary.
4. Check dictionary consistency, wrong meaning, omissions (source text left out of the translation) and style against the guidelines.
5. Call `submit_translation_review` exactly once with `novelId`, `target`, `chapter`, `checked` (the number of paragraphs you checked), `findings` and `dictionary`.
   - Each finding has `n` (paragraph position), `severity` (`error`, `warning` or `info`), `category` (`name`, `dict`, `meaning`, `omission` or `style`), `from`, `to` and `reason`.
   - `from` must be a snippet copied verbatim from the current translation of paragraph `n`, as short as possible but unique in that paragraph; `to` replaces its first occurrence. Write `reason` in the user's language.
   - For an omission, set `from` to the snippet just before the missing text and `to` to that snippet followed by the missing translation.
   - `dictionary` lists terms worth adding, each with `src`, `dst`, `type` (`name`, `place`, `org`, `title` or `term`) and an optional `note`.
   - If the result lists `dropped` items, you may fix them and call the tool once more; the last call replaces the earlier one.
6. Do not edit the translation, the dictionary or the novel yourself. The user applies or rejects each item on the review card.
7. Finish with a summary of two or three sentences in the user's language: what you checked and the main problems found.
