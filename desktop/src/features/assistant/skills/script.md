# Dreamy script

Read, search, draft and edit the script of a project (units of blocks: narration, dialogue, pauses) through the `dreamy` MCP server.

## Tools
- `read_project`: without `projectId` list the projects; with it read one project: its metadata, the text version it works from (`srcKind`, `srcLang`), the linked novel, the progress of its modules and the chapters of the linked novel with the id of the script unit written for each (null when none yet).
- `read_script`: read the script of one project by `projectId`.
  - Without `unitId`: the configuration `cfg` (the block `types` allowed), the cast (the speaker ids a dialogue block names in `who`) and the outline of the units.
  - With `unitId`: the blocks of that unit (id, type, text, who, paren, ms, loc, time, ref, beat, refs, chars); positions `p` are 1-based. Optional `from` and `to` bound the positions.
  - `withSource` adds to every block the source paragraphs its `ref` and `refs` (`chapter.paragraph`) point to.
  - While the result has a `next` value, call again with `from` set to `next`.
- `search_project`: search the text, speaker (`who`) and location (`loc`) of the blocks by `projectId` and `query`, optionally within one `unitId`. At most 50 results; `truncated` is true when more match.
- `edit_project`: change the `name` and/or `description` of one project by `projectId`. The name must not be empty.
- `edit_script`: change the script of one project by `projectId`; make one kind of change per call.
  - Blocks: pass `unitId` and `ops`, run in order and all checked first (if one fails, nothing is written). Each op has a `k`: `set` {id, expected, type?, text?, who?, paren?, ms?, loc?, time?, beat?}; `insert` {after, ref?, block} (`after` null puts it first; `ref` is a temporary id later ops may use and comes back in `remap`); `delete` {id, expected}; `move` {id, after}. For `set` and `delete`, `expected` is the exact current text of the block as `read_script` returned it (an empty string for blocks without text).
  - Cast: pass `add`, `rename` and/or `remove` to change the extra members of the cast (kind `extra`). The narrator and the characters of the novel knowledge cannot be changed. Names must not be empty or equal, ignoring case, to another member, and a member can be removed only when no block names it in `who`.
  - It only works on a unit that already has blocks; write a new unit with `submit_script_draft`.
- `submit_script_draft`: propose the rewrite of ONE unit by `projectId`, `unitId`, `blocks` and optional `summary` and `extraCast`; see the rules below.

## Rules
- Read the script with `read_script` (the outline first, then a unit by `unitId`) before you answer about it, and point to blocks by their id and position `p`.
- To rewrite or write a whole script unit, read it first with `read_script`, then send the whole new unit once with `submit_script_draft`.
- `submit_script_draft` shows a card and the script changes only when the user applies it: never say the script has changed before that, and tell the user to review the card.
- A block `type` must be one of `cfg.types`. `text` is required except for `pause` and `scene` blocks. `who` is a cast id (or the `ref` of an `extraCast` member) and only matters for dialogue.
- When the user does not say which unit to rewrite and several could match, ask which one. Choose speakers only from evidence in the text and leave `who` empty when unsure.
- For a small fix of a few blocks, such as a typo, a speaker or a pause, read the unit right before and use `edit_script`; it writes at once, so change only what the user asked for.
- After an edit tool, say plainly what changed. Changing the text, the speaker or the parenthetical of a block makes the audio already generated for it outdated: report the `staleAudio` count of the result and tell the user the audio must be generated again.
- If an edit tool says editing is not enabled, tell the user to turn it on in the assistant panel.

## Workflow: rewrite a script unit
The caller gives the inputs: `projectId`, the unit id and title, optionally the chapter, the linked novel and a user note.
1. Call `read_script` with `projectId` to learn `cfg.types` (the block types you may use) and the cast (the speaker ids you may put in `who`).
2. Call `read_script` again with `projectId`, `unitId` and `withSource` true, and read every page: while the result has a `next` value, call it again with `from` set to `next`. This shows what is written now and the source paragraphs it comes from.
3. When the project is linked to a novel, call `read_novel_knowledge` (see `dreamy-knowledge`) with the linked `novelId` and the knowledge language given by the caller (filter `type` `character`) to learn who the characters are and how they speak, so you can attribute the dialogue. Without a linked novel there is no knowledge base: attribute the dialogue from the source text alone.
4. Rewrite the unit from the source text, in reading order:
   - Put the narration in `narration` blocks, and use `heading` and `pause` blocks where `cfg.types` allows them. Keep the facts and the order of the source; do not invent events.
   - Put every spoken line in a `dialogue` block with the speaker in `who`, taken from the cast. Choose the speaker only from evidence in the text (dialogue tags, addressing, context). When you are not sure, leave `who` empty and say so in your summary; never guess.
   - Declare a speaker in `extraCast` (a unique `ref` and a `name`) only when that speaker is missing from the cast, and use the `ref` as `who`.
   - Put in `refs` the source paragraphs (`chapter.paragraph`, for example 3.12) a block is written from.
   - Keep blocks that are already good unchanged: a block with the same type, text, speaker and parenthetical keeps its generated audio.
5. Call `submit_script_draft` exactly once with `projectId`, `unitId`, a short `summary`, `extraCast` and `blocks`.
   - If the result lists `dropped` blocks, fix them and call the tool once more; the last call replaces the earlier draft.
6. Do not edit the script yourself. The user applies or rejects the whole draft on the card, so do not say the script has changed.
7. Finish with a summary of two or three sentences in the user's language: what you changed, which speakers you were unsure about and which new characters you proposed.
