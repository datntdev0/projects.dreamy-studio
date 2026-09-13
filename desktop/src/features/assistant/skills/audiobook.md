# Dreamy audiobook

Read the audiobook of a project, assign voices, change the mix and flag audio through the `dreamy` MCP server.

## Tools
- `read_audiobook`: read the audiobook of one project by `projectId`.
  - Without `unitId`: the voice and speed of each speaker id, the mix settings (gap, intro, outro, vol, sentence) and, for every script unit, how many voiced blocks have up-to-date audio (`done`), outdated or flagged audio (`stale`) or none (`missing`), the duration in seconds and a unit `state` of none, doing, stale or done.
  - With `unitId`: the voiced blocks of that unit: block id, position `p`, speaker, text, the voice and speed that would be used, `state` (none, done, stale or flag), duration and flag note. Optional `from` and `to` bound the block positions. While the result has a `next` value, call again with `from` set to `next`.
- `list_voice`: list the voices of the library with id, name, gender, language, engine, engine kind (local or cloud) and source. It does not tell whether the engine is installed on this computer.
- `edit_audiobook`: change the audiobook of one project by `projectId`; make one kind of change per call. If anything is invalid nothing is written.
  - Voices: pass `voices`, one entry per speaker with `speaker` (cast id from `read_script`) and `voice` (id from `list_voice`, null removes it) and/or `speed` (0.5 to 2, 1 is natural). What you leave out is kept.
  - Mix: pass any of `gap` (seconds between segments, 0 to 5), `intro` and `outro` (seconds of silence, 0 to 10), `vol` (dB, -12 to 6) and `sentence` (pause between sentences in seconds, 0 to 2). Only the fields you pass change; values outside the range are clamped and listed in `adjusted`.
- `flag_audio_segment`: flag the generated audio of one block for review by `projectId`, `unitId`, `blockId` and a short `flag` note, or clear the flag with an empty `flag`. A flagged segment is treated as needing regeneration. The block must already have generated audio (see `read_audiobook`).

## Rules
- Read before you edit, and edit only when the user asks for a change.
- To assign voices, read `read_audiobook` and the cast with `read_script` (see `dreamy-script`), read `read_novel_knowledge` (see `dreamy-knowledge`) for the traits of the characters, then `list_voice`, and set them with `edit_audiobook`. Use only voice ids from `list_voice`, never invent one, and say which voice each speaker got and why.
- After an edit tool, say plainly what changed. Changing the voice or speed of a speaker makes the audio already generated for them outdated: report the `outdatedAudio` count of the result and tell the user the audio must be generated again.
- Generating audio is a run: use `start_run` with `kind` `synthesis` (see `dreamy-pipeline`). It fails when a speaker has no voice, so assign voices first.
- If an edit tool says editing is not enabled, tell the user to turn it on in the assistant panel.
