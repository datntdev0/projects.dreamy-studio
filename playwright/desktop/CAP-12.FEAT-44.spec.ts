import { readPipelines, showBottomPanel, waitForPipeline } from '../scripts/pipeline.ts';
// prettier-ignore
import { closeSettings, expect, openGeneralTab, patchGeneral, readSettingsJson, relaunch, saveGeneralRaw, setSlider, test } from '../scripts/settings.ts';
// prettier-ignore
import { goToStep, openTranslation, PIPELINE_STATUS_QUEUED, PIPELINE_STATUS_RUNNING, reopenRunStep, RUN_NOVEL, runPage, runSeed, showTranslation, STATUS_QUEUED, translateChapters } from '../scripts/translation.ts';

const TASK_DELAY_MS = 15000;

test.describe('CAP-12 Configuration', () => {
  test.describe('FEAT-44 Pipeline Concurrency Settings', () => {
    test('US-0119 limits the concurrent pipelines and tasks and queues the pipelines over the limit', async ({
      ui,
      app,
      picker,
      sandbox,
      provider,
    }) => {
      test.setTimeout(240_000);
      await provider.setBehavior({ mode: 'ok', delayMs: TASK_DELAY_MS });
      const { folder } = await openTranslation(ui, picker, sandbox, runSeed([]), 'trans');

      await test.step('saves the concurrent pipelines and parallel tasks at once and keeps them after reopening the app', async () => {
        await openGeneralTab(ui, 'pipelines');
        await setSlider(ui.main.settings.general.maxPipelines, 2);
        await setSlider(ui.main.settings.general.maxTasks, 7);
        await expect(ui.main.settings.general.maxPipelinesValue).toHaveText('2');
        await expect(ui.main.settings.general.maxTasksValue).toHaveText('7');
        await expect
          .poll(async () => (await readSettingsJson(sandbox)).general?.pipelines)
          .toEqual({ maxPipelines: 2, maxTasks: 7 });
        await closeSettings(ui);
        await reopenRunStep(ui, app, picker, folder, RUN_NOVEL);
        await openGeneralTab(ui, 'pipelines');
        await expect(ui.main.settings.general.maxPipelines).toHaveValue('2');
        await expect(ui.main.settings.general.maxPipelinesValue).toHaveText('2');
        await expect(ui.main.settings.general.maxTasks).toHaveValue('7');
        await expect(ui.main.settings.general.maxTasksValue).toHaveText('7');
        await closeSettings(ui);
      });

      await test.step('pulls a pipeline or task count outside its range back to the nearest limit', async () => {
        await relaunch(ui, app, picker, folder, () =>
          patchGeneral(sandbox, { pipelines: { maxPipelines: 9, maxTasks: 0 } }),
        );
        await openGeneralTab(ui, 'pipelines');
        await expect(ui.main.settings.general.maxPipelinesValue).toHaveText('5');
        await expect(ui.main.settings.general.maxTasksValue).toHaveText('1');
        await closeSettings(ui);
        expect(
          await saveGeneralRaw(app.page, { pipelines: { maxPipelines: 0, maxTasks: 99 } }),
        ).toEqual({ pipelines: { maxPipelines: 1, maxTasks: 10 } });
        expect((await readSettingsJson(sandbox)).general?.pipelines).toEqual({
          maxPipelines: 1,
          maxTasks: 10,
        });
      });

      await test.step('makes a pipeline wait in the queue at the limit and runs it by itself when a slot is free', async () => {
        await openGeneralTab(ui, 'pipelines');
        await setSlider(ui.main.settings.general.maxPipelines, 2);
        await expect(ui.main.settings.general.maxPipelinesValue).toHaveText('2');
        await closeSettings(ui);
        await showTranslation(ui, RUN_NOVEL);
        await goToStep(ui, 'trans');
        await showBottomPanel(ui);
        await translateChapters(ui, [1]);
        await translateChapters(ui, [2]);
        await translateChapters(ui, [3]);
        await waitForPipeline(folder, { count: 3, states: ['queued'] });
        expect(readPipelines(folder).map((pipeline) => pipeline.status)).toEqual([
          'running',
          'running',
          'queued',
        ]);
        await expect(runPage(ui).rowAt(2).status).toHaveText(STATUS_QUEUED);
        const statuses = ui.main.pipelines.list.items.getByTestId('pipeline-item-status');
        await expect(statuses.filter({ hasText: PIPELINE_STATUS_RUNNING })).toHaveCount(2);
        await expect(statuses.filter({ hasText: PIPELINE_STATUS_QUEUED })).toHaveCount(1);
        await expect
          .poll(() => readPipelines(folder).map((pipeline) => pipeline.status), { timeout: 60_000 })
          .toEqual(['completed', 'completed', 'completed']);
        const [first, second, third] = readPipelines(folder);
        const earliestFinish = [first?.finishedAt ?? '', second?.finishedAt ?? ''].sort()[0] ?? '';
        expect((third?.startedAt ?? '') >= earliestFinish).toBe(true);
        expect(await provider.runs('translation')).toHaveLength(3);
      });
    });
  });
});
