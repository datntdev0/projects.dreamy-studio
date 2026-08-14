# verify

Visual verification of the desktop app against the prototype, using Playwright.

The prototype in `_proto/1.library` rendered with its mock data is the **baseline**. The real app, started with a fixture built from the same mock data, is compared against it **per layout panel** (titlebar, railbar, explorer, tabbar, crumbs, toolbar, content, inspector, statusbar). A failing panel names the component that differs, and the reporter ranks them.

## How it works

- The app takes `--data-dir <path>`. Everything it stores (application database, logs) goes there instead of `%LOCALAPPDATA%\DreamyStudio`.
- `src/fixture` starts the app on a scratch data dir and loads `_proto/1.library/js/library-data.js` through the app's own commands: 4 collections, 17 images, 8 sounds, 8 videos and 8 prompts, with the prototype's tags, rights and dates. The result is cached in `_output/verify/fixture`.
- Each run copies the fixture to `_output/verify/run`, starts the app on `_output/verify/run/data`, and attaches Playwright to the WebView2 over CDP.
- Two Playwright projects run the same spec: `prototype` (Edge, `file://`) and `app` (the desktop app).

## Prerequisites

- Windows with the WebView2 runtime and Microsoft Edge.
- `backend/.venv` set up, because opening a workspace starts the Python backend.
- Network access: the UI loads the Geist font from Google Fonts. The run fails early if it did not load.
- A debug app build with the frontend embedded: `pnpm build:app`. Set `DREAMY_EXE` to use another executable.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` (repo root) | Installs Playwright (no browser download is needed). |
| `pnpm build:app` | Builds `_output/desktop/target/debug/dreamy-studio.exe`. |
| `pnpm fixture` | Rebuilds the fixture. Run it after a schema or prototype data change. |
| `pnpm baseline` | Renders the prototype and writes `baseline/` (only changed images). |
| `pnpm test` | Compares the app with `baseline/` and prints the ranking. |
| `pnpm test:prototype` | Compares the prototype with its own baseline, to prove the baseline is stable. |
| `pnpm start:proto` (repo root) | Runs the app in dev mode on a persistent data dir seeded with the prototype data (`_output/verify/proto`). Add `--reset` to reseed. |
| `pnpm report` | Opens the HTML report with expected, actual and diff images. |

`baseline/<screen>/<state>/<panel>.png` is committed. `_output/verify/diff-summary.json` holds the ranking of the last run.

`start:proto` seeds with the embedded debug build, so run `pnpm build:app` first if `tauri dev` was the last thing to write the executable. It starts the Angular dev server on port 1420, so stop any other `pnpm start` first. Open the "Library prototype" entry in the recent list.

## Known gaps

- The prototype videos are fragmented MP4 files with no `mehd` box, so `video_probe.rs` cannot read their duration. The fixture patches the `mvhd` duration of its staged copies and sets `fps` from the prototype data.
- The status bar shows the workspace path, which differs per machine. It is masked.
