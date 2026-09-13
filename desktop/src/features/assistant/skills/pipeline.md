# Dreamy pipeline

Prepare, check and cancel runs of translation, knowledge analysis and audio generation through the `dreamy` MCP server.

## Tools
- `start_run`: prepare a run by `kind`. Nothing starts: the app shows a confirmation card and the user decides.
  - `translation`: translate the `chapters` (chapter numbers from `read_novel`, at most 100) of `novelId` into `target` (`VI` or `EN`). Chapters that already have a translation are skipped unless `overwrite` is true; chapters without paragraphs are skipped.
  - `analysis`: analyze the `chapters` of `novelId` for the knowledge `lang` (`src`, `VI` or `EN`). Analyzed chapters are skipped unless `overwrite` is true, an out-of-date analysis is always replaced, and `VI` or `EN` needs a translation of the chapter.
  - `synthesis` (only in a project scope): generate the audio of the voiced blocks of the `units` (unit ids) of `projectId`. `mode` `missing` (default) takes every block without up-to-date audio, `all` generates every voiced block again. It fails when a speaker has no voice: tell the user to assign voices in the audiobook module first (see `dreamy-audiobook`).
  - The result lists what will run and what was skipped, with the reason.
- `read_pipeline`: without `pipelineId` list the latest runs of translation, analysis and audio generation, newest first (kind, target, status, progress counts), optionally of one `novelId` or `projectId`; `limit` sets how many (default 20). With `pipelineId` read one run with the status, progress and error of each task.
- `cancel_pipeline`: cancel a queued or running run by `pipelineId` (from `read_pipeline`). `cancelled` is false when the run already finished.

## Rules
- `start_run` never starts a job: it shows a confirmation card and the job starts only when the user presses Run on it. Never say that a job has started or finished before the user confirmed it, and tell the user to confirm on the card.
- Queue only the chapters or units the user asked for. When `start_run` reports that nothing is left to run or that a voice is missing, tell the user and ask before you use `overwrite` or another `mode`.
- Use `read_pipeline` only when the user asks about the status of a run, and `cancel_pipeline` only when the user asks to stop one.
