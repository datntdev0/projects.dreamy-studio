---
name: solo-verify-interfaces
description: Verify that the real application matches a reference interface (the prototype) with Playwright screenshot and aria-snapshot comparison, then report the differences ranked by severity. Use when the user asks to verify, compare, or check UI parity between the app and the prototype/mockup. Produces a report only, never code changes.
argument-hint: "[page, screen, or panel] [e.g. library-images | layout | all]"
---

# Solo Verify Interfaces

Compare the running application against a reference interface, per screen and per panel, and report what differs, most severe first. The comparison is mechanical (Playwright visual comparison plus aria snapshot); agents then explain the differences against the application's current code. This skill only verifies and reports. Do not fix the application and do not edit the baseline unless the user asks.

The workflow lives in `verify/` (read `verify/README.md` first: commands, fixture, baseline layout, known gaps). The baseline is `verify/baseline/<screen>/<state>/<panel>.png` plus `<panel>.aria.yml`, generated from the prototype in `_proto`. Actual and diff images, and `error-context.md`, land under `_output/verify/results/<test>/`; the ranking lands in `_output/verify/diff-summary.json`.

## When this works

It is only reliable when all of these hold. Step 1 checks them.

- A screenshot of the interface the app must match exists (the baseline).
- The application and the reference show the same data (same fixture).
- The reference can also produce an aria snapshot (`.aria.yml`). Without it the result is less precise: pixel diffs alone cannot say which element differs.

## Responsibilities

**Human**
- Prepares the data for the reference and the real application.
- Confirms the baseline screenshots and snapshots match the expectation.
- Reviews the diff report this workflow produces.

**Agents**
- Check that the preconditions are met.
- Run the workflow until the checklist below is complete.

**Checklist** (the run is done only when every item is done; an item counts as done only when its evidence exists, a file on disk or the report; state each in the final report).
1. Expected screenshot and snapshot exist.
2. Actual screenshot and snapshot are generated.
3. Diff map image is generated.
4. `error-context.md` is generated.
5. Diff items with severity are reported.
6. The draft report was reviewed by a new reviewer session against the current application state, and its findings are applied (evidence: the reviewer's verdicts and the **Review** section of the report).

## Steps

1. **Check the preconditions.** Read `$ARGUMENTS` (a screen id, a spec file, `layout`, or `all`; default `all`) and map it to spec files in `verify/tests/`. Then verify, and stop and tell the human exactly what is missing if any check fails:
   - **Data parity**: `verify/src/fixture` loads the prototype data (`_proto/**/js/*-data.js`, novel packages). If the prototype data or the app schema changed since `_output/verify/fixture` was built, the fixture is stale: ask before running `pnpm fixture`.
   - **Screen, state and size**: the target screens and states (`overview`, `selected`, `list-*`, `preview`, ...) are defined in `verify/src/screens.ts`. Confirm the requested screen exists there. The viewport size is fixed by the workflow; do not change it for one run.
   - **Expected exists**: each requested panel has both `.png` and `.aria.yml` under `verify/baseline/`. If not, stop. Offer `pnpm baseline` (it renders the prototype and writes the baseline), but do not treat the result as trusted: the human must confirm it before the comparison counts.
   - **Environment**: Windows with WebView2 and Edge, `backend/.venv`, network for the Geist font, and a debug app build that embeds the frontend (`pnpm build:app`, run from `verify/`). If the app build is older than the frontend source, or a dev build overwrote it ("localhost refused to connect"), rebuild it.
2. **Prove the baseline is stable** (only on the first run for an area, or when a diff looks like noise): `pnpm test:prototype` must pass against its own baseline. If it fails, the baseline or the machine is flaky; report that instead of app differences.
3. **Run the comparison.** From `verify/`, run `pnpm test` (or `pnpm test tests/<spec>.spec.ts` for one screen). The app project captures the actual screenshot and aria snapshot per panel, runs the visual comparison, and writes the diff images and `error-context.md` for each failed panel. Failing tests are expected output here, not an error of the run. Do not edit specs to make them pass.
4. **Confirm the artifacts.** For the panels that differ, check that these exist under `_output/verify/results/<test>/`: actual image, expected image, diff image (`*-diff.png`), and `error-context.md`; and that `_output/verify/diff-summary.json` was written. If something is missing, find out why (crash before the comparison, missing baseline, size mismatch) and report it.
5. **Analyse with agents.** Split the differing panels by screen into groups and launch read-only agents (one per group, in parallel) with the `Explore` or `general-purpose` agent type. Each agent prompt must be self-contained:
   - the group's `error-context.md` paths, the diff image paths, and the baseline and actual `.aria.yml` paths;
   - the task: read `error-context.md` (pixel count, ratio, size change, aria diff `@@` hunks), look at the expected, actual and diff images, and compare the baseline aria snapshot with the actual one;
   - the task: locate the code responsible in the current application (`angular/` components and styles, using `data-testid` and the selectors in `verify/src/screens.ts`) and in the prototype (`_proto`), and state the likely cause;
   - "read only: no edits, no commits, no subagents";
   - the output shape: one item per difference with panel, severity, evidence, expected, actual, likely cause with `file:line`.
6. **Rank and draft the report.** Merge the agents' items, remove duplicates (one root cause in a shared component such as `explorer` or `tabbar` shows up on many screens: report it once with the list of affected screens), assign severity, and write the draft report to `_output/verify/severity-report.md` (see **Report**). The draft is not final and must not be sent to the human yet.
7. **Review the draft with a new reviewer session.** Before the report goes to the human, launch a **new** read-only reviewer agent (`general-purpose` type, fresh context: never a fork and never one of the analysis agents from step 5, so it does not inherit their assumptions). It checks the draft against the current implementation state of the application, the intentional context of implementation, especially the severity of issues is analyzed correctly, not against the analysis agents' notes. The prompt must be self-contained:
   - the path of the draft report, `verify/README.md`, `verify/src/screens.ts`, and the paths of the expected, actual and diff images, `error-context.md` files and `_output/verify/diff-summary.json`;
   - the task: for every reported item, open the cited `file:line` in the current `angular/` code and the prototype source in `_proto` and confirm the code is really there and really causes the difference (a stale line number, a renamed component, or a cause already fixed counts as wrong); confirm the evidence (pixel count, ratio, size change, aria hunks, image paths) against the artifacts on disk; confirm the severity follows the **Severity** table; confirm affected screens and states are complete and duplicates are merged;
   - the task: look for what the draft missed: failed panels with no item, and differences visible in the diff images or aria hunks that no item explains;
   - the task: flag claims that are not supported by evidence, and environment noise reported as an application difference or the other way around;
   - "read only: no edits, no commits, no subagents";
   - the output shape: a verdict per item (`confirmed`, `corrected` with the fix, or `rejected` with the reason), then a list of missed differences, then a list of unsupported claims.

   Then the leader checks the reviewer's evidence, applies the corrections to the report (fix, re-rank, or remove rejected items; add missed items), and records the outcome in the **Review** section. If the reviewer rejected or added more than a few items, or changed a Critical or High item, run one more fresh reviewer on the corrected report; stop after two review rounds and put what is still disputed under **Needs a human**. If the reviewer cannot be launched, stop and tell the human: do not send an unreviewed report as final, and do not mark checklist item 6 done.
8. **Finish.** Check that the report file exists and that every checklist item is done, then send the reviewed report to the human.

## Severity

Use the aria diff first, then the pixel diff. Take the highest level that applies.

| Severity | Meaning | Typical evidence |
|---|---|---|
| **Critical** | The interface is structurally different or data is wrong/missing. | Aria diff adds, removes or reorders elements, roles or items (a missing button, tab, tree or table column); different text or counts; panel size differs a lot; baseline-expected content absent. |
| **High** | Same structure but visibly different layout or large visual difference. | Size change of a panel (`size WxH -> WxH`), elements shifted or wrapped, pixel ratio above about 5%, wrong icon, missing state (hover, selected, active). |
| **Medium** | Styling difference a person notices on comparison. | Spacing, font size or weight, colour, border or radius; pixel ratio about 1% to 5%. |
| **Low** | Minor or probably noise. | Pixel ratio below the 1% tolerance in `playwright.config.ts`, anti-aliasing, sub-pixel offsets, font rendering. |

Call out anything that is an environment artefact (missing font, status bar workspace path, animation) as noise, not as an application difference.

## Report

Save the report to `_output/verify/severity-report.md` and also give its summary in the reply, only after the review in step 7. Keep it short and specific; no restating of the workflow.

1. **Run summary**: command(s) run, projects, number of panels compared and failed, and the **checklist** with the status of each item (done or not, and why).
2. **Differences by severity**: Critical, then High, Medium, Low. Each item:
   - `panel` and affected screens/states (for example `explorer` in `images/overview`, `collections/overview`);
   - evidence: pixel count and ratio or size change, the key aria diff lines, and the paths of the expected, actual and diff images;
   - expected vs actual in one sentence each;
   - likely cause with `file:line` in the application, and the matching prototype source.
3. **Review**: the number of review rounds, per round how many items were confirmed, corrected, rejected, and how many missed differences were added, and what changed in the report because of it.
4. **Needs a human**: baseline doubts, data differences between the reference and the app, differences that might be intentional, and anything the reviewer and the leader still disagree on.

## Rules

- This skill never changes application code, specs, baseline, or fixture data on its own. Regenerating the fixture or baseline needs the user's go-ahead, and a regenerated baseline still needs the human's confirmation.
- Do not commit. `_output` and `baseline` are generated; the report is not a deliverable of the repo.
- Never loosen the thresholds in `verify/playwright.config.ts`, mask panels, or skip specs to reduce the diff count. If a tolerance looks wrong, say so in the report.
- Never claim parity without the actual run: a missing artifact means its checklist item stays open, say so plainly. Never mark an item done without its evidence.
- Sub-agents, including the reviewer, are read-only. The leader reads their reports, checks the cited evidence, and owns the final ranking.
- Never send the report to the human before the reviewer session has checked it against the current application state. The reviewer is always a new session, not a reused analysis agent.
- If the precondition checks fail, stop and report what is missing instead of running a partial comparison.
