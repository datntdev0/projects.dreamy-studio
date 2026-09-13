# Dreamy novel

Read and edit the text of novels through the `dreamy` MCP server.

## Tools
- `read_novel`: without `novelId` list every novel (id, title, author, language, tags, chapter count, and per language how many chapters are translated and analyzed).
  - With `novelId` it reads one novel: its metadata, `translation` (per target language `VI`/`EN`: `count` and `chapters`, the translated chapter numbers as ranges such as "1-49,52") and `analysis` (the same per knowledge language `src`/`VI`/`EN`), and one page of at most 50 chapters of the outline (number, title, word count).
  - Optional `from` and `to` are chapter numbers that bound the outline page. While `next` is not null, call again with `from` set to `next`.
  - To answer how far the novel is translated or analyzed, read `translation` and `analysis`; you do not need to page through the outline.
- `read_novel_chapter`: read the paragraphs of one chapter by `novelId` and `chapter` (the chapter number from `read_novel`); positions are 1-based. Optional `from` and `to` bound the paragraph positions.
- `edit_novel`: change one novel by `novelId`.
  - Without `chapter` it changes the metadata: `title`, `name`, `author`, `description` and `tags` (the full new list, it replaces the old one). Only the fields you pass change and the language cannot be changed.
  - With `chapter` it changes that chapter: a new `title` and/or `paragraphs`, a list of `{p, expected, text}` where `expected` is the exact current text of paragraph `p` and `text` is its replacement. Nothing is written when any `expected` differs from the current text.

## Rules
- Read the chapter with `read_novel_chapter` before you answer about it, and point to paragraphs by their position `p`.
- A page holds a limited number of paragraphs. While the result has a `next` value, call the tool again with `from` set to `next` to read on.
- Edit only when the user asks for a change. Read the chapter right before the edit and copy `expected` exactly as read.
- Change only what the user asked for. After an edit, say plainly what changed.
- If an edit tool says editing is not enabled, tell the user to turn it on in the assistant panel.
- The translation of a chapter is not changed here: use the `dreamy-translation` skill. The knowledge base is not changed here: use the `dreamy-knowledge` skill.
