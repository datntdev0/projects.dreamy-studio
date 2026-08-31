import { expect, test } from "../scripts/provider.ts";
import { MonitoringPage } from "../pages/pipeline.ts";
import { switchWorkspace } from "../scripts/flows.ts";
import { AZURE, EMBER, HARBOR, KIND_TEXT, NEWEST_FIRST, expectStatusIdle, expectStatusRunning, showBottomPanel, showPipelineHistory, startedStamps, readPipelines, waitForPipeline } from "../scripts/pipeline.ts";
import { historySeed, openHistory, quietSeed, PIPELINE_BOTTOM_EMPTY, PIPELINE_EMPTY_TITLE, PIPELINE_FAILED_COUNT, PIPELINE_LOG_STARTED, PIPELINE_LOG_TASK_CANCELLED, PIPELINE_LOG_TASK_FAILED, PIPELINE_LOG_TASK_STARTED, PIPELINE_NO_MATCH_TITLE, PIPELINE_PROGRESS, PIPELINE_QUEUED_COUNT, PIPELINE_STATUS_CANCELLED, PIPELINE_STATUS_COMPLETED, PIPELINE_STATUS_FAILED, PIPELINE_STATUS_RUNNING, STATUSBAR_IDLE, STATUSBAR_RUNNING, sampleNovel, openTranslation, translateChapters } from "../scripts/translation.ts";

const STATUS_TEXT = { completed: PIPELINE_STATUS_COMPLETED, failed: PIPELINE_STATUS_FAILED, cancelled: PIPELINE_STATUS_CANCELLED } as const;
const TASK_PROGRESS = /Ch\.\d+\s+\d+%/;
const FAILURE = "stub provider failed for the log";

test.describe("CAP-03 Content Translation", () => {
  test.describe("FEAT-26 Pipeline Monitoring", () => {
    test("US-0069 browses the pipeline history with search, status filter and empty states", async ({ ui, picker, sandbox }) => {
      const folder = await openHistory(ui, picker, sandbox, historySeed());
      const history = ui.main.pipelines.history;
      const monitor = new MonitoringPage(history.root.page());

      await test.step("lists each pipeline with its novel, kind, start time, status and progress, newest first", async () => {
        await expect(history.rows).toHaveCount(NEWEST_FIRST.length);
        const stamps = startedStamps(folder);
        for (const [index, expected] of NEWEST_FIRST.entries()) {
          const row = ui.main.pipelines.row(history.row(index));
          await expect(row.novel).toContainText(expected.novel);
          await expect(row.novel).toContainText(KIND_TEXT[expected.kind]);
          await expect(row.started).toHaveText(stamps[index] ?? "");
          await expect(row.status).toHaveText(STATUS_TEXT[expected.status]);
          await expect(row.done).toHaveText(expected.done);
          if (expected.failed > 0) {
            await expect(row.failed).toHaveText(PIPELINE_FAILED_COUNT);
          } else {
            await expect(row.failed).toHaveCount(0);
          }
        }
        await expect(history.count).toContainText(String(NEWEST_FIRST.length));
      });

      await test.step("shows only the pipelines that match the novel name search or the status filter", async () => {
        await history.search.fill("harbor");
        await expect(history.rows).toHaveCount(2);
        await expect(monitor.historyNovels().filter({ hasText: HARBOR })).toHaveCount(2);
        await expect(history.count).toContainText("2");

        await history.search.fill("");
        await history.filter.selectOption("completed");
        await expect(history.rows).toHaveCount(3);
        for (const index of [0, 1, 2]) {
          await expect(ui.main.pipelines.row(history.row(index)).status).toHaveText(PIPELINE_STATUS_COMPLETED);
        }

        await history.search.fill("azure");
        await expect(history.rows).toHaveCount(2);
        await expect(monitor.historyNovels().filter({ hasText: AZURE })).toHaveCount(2);

        await history.filter.selectOption("failed");
        await expect(history.noMatch).toBeVisible();
        await history.search.fill("");
        await expect(history.rows).toHaveCount(1);
        await expect(history.row(0)).toContainText(HARBOR);
        await expect(ui.main.pipelines.row(history.row(0)).status).toHaveText(PIPELINE_STATUS_FAILED);
      });

      await test.step("reports no results and lets the user clear the filters when nothing matches", async () => {
        await history.filter.selectOption("all");
        await history.search.fill(EMBER);
        await history.filter.selectOption("completed");

        await expect(history.rows).toHaveCount(0);
        await expect(history.noMatch).toBeVisible();
        await expect(history.noMatch).toContainText(PIPELINE_NO_MATCH_TITLE);
        await expect(history.empty).toHaveCount(0);

        await history.noMatchClear.click();

        await expect(history.noMatch).toBeHidden();
        await expect(history.search).toHaveValue("");
        await expect(history.filter).toHaveValue("all");
        await expect(history.rows).toHaveCount(NEWEST_FIRST.length);
        await expect(history.clear).toHaveCount(0);
      });

      await test.step("shows the empty state for a workspace that has not run any pipeline", async () => {
        await switchWorkspace(ui, picker, sandbox.workspace("quiet"));
        await showPipelineHistory(ui);

        await expect(history.empty).toBeVisible();
        await expect(history.empty).toContainText(PIPELINE_EMPTY_TITLE);
        await expect(history.rows).toHaveCount(0);
        await expect(history.noMatch).toHaveCount(0);
        expect(readPipelines(sandbox.workspace("quiet"))).toEqual([]);
      });
    });

    test.describe("running pipeline", () => {
      test.use({
        providerOptions: {
          maxTasks: 1,
          behavior: { mode: "hang", sequence: [{ mode: "fail-exit", stderr: FAILURE }] },
        },
      });

      test("US-0070 monitors, reads the log of and cancels a running pipeline", async ({ ui, picker, sandbox, provider }) => {
        const opened = await openTranslation(ui, picker, sandbox, { novels: [sampleNovel()] });
        const pipelines = ui.main.pipelines;
        const monitor = new MonitoringPage(pipelines.history.root.page());
        await translateChapters(ui, [1, 2, 3]);
        await provider.waitForRuns(2, "translation");
        await waitForPipeline(opened.folder, { states: ["running"] });

        await test.step("shows the novel name, per-task progress, queued task count and a running status bar in the bottom pipelines panel", async () => {
          await showBottomPanel(ui);

          await expect(pipelines.list.running).toBeVisible();
          await expect(monitor.runningItems).toHaveCount(1);
          const item = pipelines.item(monitor.runningItems.first());
          await expect(item.novel).toHaveText(opened.novel);
          await expect(item.status).toHaveText(PIPELINE_STATUS_RUNNING);
          await expect(item.tasks).toHaveCount(1);
          await expect(item.tasks.first()).toContainText(TASK_PROGRESS);
          await expect(item.count).toHaveText(PIPELINE_PROGRESS);
          await expect(item.queued).toHaveText(PIPELINE_QUEUED_COUNT);
          await expectStatusRunning(ui);
          await expect(pipelines.statusbar.button).toContainText(STATUSBAR_RUNNING);
        });

        await test.step("opens a log that lists the tasks and their errors", async () => {
          await pipelines.item(monitor.runningItems.first()).open.click();

          await expect(pipelines.bottom.tab("output")).toHaveAttribute("aria-pressed", "true");
          await expect(pipelines.log.root).toBeVisible();
          await expect(pipelines.log.novel).toHaveText(opened.novel);
          await expect(monitor.logEntry(PIPELINE_LOG_STARTED)).toHaveCount(1);
          await expect(monitor.logEntry(PIPELINE_LOG_TASK_STARTED).first()).toBeVisible();
          const failure = monitor.logEntry(PIPELINE_LOG_TASK_FAILED);
          await expect(failure).toHaveCount(1);
          await expect(failure).toContainText(FAILURE);
          await expect(pipelines.log.cancel).toBeVisible();
        });

        await test.step("cancels the pipeline and returns the status bar to idle when none remains", async () => {
          await pipelines.log.cancel.click();

          const finished = await waitForPipeline(opened.folder, { states: ["cancelled"] });
          expect(finished.status).toBe("cancelled");
          await expectStatusIdle(ui);
          await expect(pipelines.statusbar.button).toContainText(STATUSBAR_IDLE);
          await showBottomPanel(ui);
          await expect(monitor.runningItems).toHaveCount(0);
          await expect(pipelines.list.emptyTitle).toContainText(PIPELINE_BOTTOM_EMPTY);
          await showPipelineHistory(ui);
          await expect(pipelines.history.rows).toHaveCount(1);
          await expect(pipelines.row(pipelines.history.row(0)).status).toHaveText(PIPELINE_STATUS_CANCELLED);
          await pipelines.history.row(0).click();
          await expect(pipelines.log.status).toHaveText(PIPELINE_STATUS_CANCELLED);
          await expect(monitor.logEntry(PIPELINE_LOG_TASK_CANCELLED).first()).toBeVisible();
        });
      });
    });
  });
});
