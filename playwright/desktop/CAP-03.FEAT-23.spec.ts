import { waitForPipeline } from '../scripts/pipeline.ts';
import { expect, test } from '../scripts/provider.ts';
// prettier-ignore
import { backToTranslation, chapterRecords, goToStep, hasTranslationFile, openLatestPipelineLog, openRunDialog, openTranslation, PIPELINE_STATUS_CANCELLED, PIPELINE_STATUS_FAILED, PROVIDER_NOT_JSON, PROVIDER_WRONG_COUNT, readNovelPlace, reopenRunStep, RUN_NOVEL, RUN_TARGET, runPage, runSeed, savedChapter, STATUS_DONE, STATUS_NONE, STATUS_RUNNING, taggedCopy,translateChapters } from '../scripts/translation.ts';
import { readParagraphs } from '../scripts/workspaces.ts';

const NOTES = { 1: 'keep the honorific', 3: 'check the blade name' };

test.describe('CAP-03 Content Translation', () => {
  test.describe('FEAT-23 Chapter Translation', () => {
    test('US-0059 lists chapters with their status and plans the chapters to translate', async ({
      ui,
      app,
      picker,
      sandbox,
      provider,
    }) => {
      const { folder } = await openTranslation(
        ui,
        picker,
        sandbox,
        runSeed([{ chapter: 1 }, { chapter: 2 }]),
        'trans',
      );
      const run = runPage(ui);
      const records = await chapterRecords(folder);

      await test.step('shows the sequence number, title, word count and translation status of every chapter', async () => {
        await expect(run.rows).toHaveCount(5);
        for (const record of records) {
          const row = run.rowAt(record.seq - 1);
          await expect(row.number).toHaveText(String(record.seq).padStart(2, '0'));
          await expect(row.title).toHaveText(record.title);
          await expect(row.words).toHaveText(String(record.wordCount));
          await expect(row.status).toHaveText(record.seq <= 2 ? STATUS_DONE : STATUS_NONE);
        }
      });

      await test.step('shows only the chapters that match the chosen status or the searched name', async () => {
        await run.filter.selectOption('none');
        await expect(run.rows).toHaveCount(3);
        await expect(run.rowAt(0).title).toHaveText(records[2]?.title ?? '');
        await run.filter.selectOption('done');
        await expect(run.rows).toHaveCount(2);
        await expect(run.rowAt(1).title).toHaveText(records[1]?.title ?? '');
        await run.filter.selectOption('all');
        await expect(run.rows).toHaveCount(5);
        await run.search.fill('trial');
        await expect(run.rows).toHaveCount(1);
        await expect(run.rowAt(0).title).toHaveText('The Trial');
        await run.search.fill('chapter');
        await expect(run.rows).toHaveCount(2);
        await run.filter.selectOption('done');
        await expect(run.rows).toHaveCount(0);
        await run.filter.selectOption('all');
        await run.search.fill('');
        await expect(run.rows).toHaveCount(5);
      });

      await test.step('opens the translate dialog from the Translate button and plans the untranslated chapters', async () => {
        const dialog = ui.main.translation.runDialog;
        await expect(run.start).toBeEnabled();
        await openRunDialog(ui);
        await expect(dialog.run).toContainText('3 chapters');
        await expect(dialog.run).toContainText('Ch.3–5');
        await expect(dialog.start).toContainText('(3)');
        await dialog.mode('range').click();
        await dialog.from.fill('3');
        await dialog.from.blur();
        await dialog.to.fill('4');
        await dialog.to.blur();
        await expect(dialog.run).toContainText('2 chapters');
        await expect(dialog.start).toContainText('(2)');
        await dialog.cancel.click();
        await expect(dialog.panel).toBeHidden();
      });

      await test.step('keeps Start locked while no provider is selected', async () => {
        await provider.clearSelection(['translation']);
        await reopenRunStep(ui, app, picker, folder, RUN_NOVEL);
        const dialog = ui.main.translation.runDialog;
        await openRunDialog(ui);
        await expect(dialog.provider).toHaveAttribute('data-state', 'unset');
        await expect(dialog.start).toBeDisabled();
        await dialog.cancel.click();
        await expect(dialog.panel).toBeHidden();
      });
    });

    test('US-0060 translates the picked chapters and retranslates keeping the notes', async ({
      ui,
      picker,
      sandbox,
      provider,
    }) => {
      const { folder, novelId, chapters } = await openTranslation(
        ui,
        picker,
        sandbox,
        runSeed([
          { chapter: 1, paragraphs: ['old one', 'old two', 'old three', 'old four'], notes: NOTES },
        ]),
        'trans',
      );
      const run = runPage(ui);
      const first = chapters[1] ?? '';
      const second = chapters[2] ?? '';
      const third = chapters[3] ?? '';
      await provider.setBehavior({ mode: 'ok', delayMs: 1500 });

      await test.step('runs the translation and shows the progress of each picked chapter', async () => {
        await translateChapters(ui, [2, 3]);
        await expect(run.rowAt(1).status).toHaveText(STATUS_RUNNING);
        await expect(run.rowAt(2).status).toHaveText(STATUS_RUNNING);
        await expect(run.rowAt(3).status).toHaveText(STATUS_NONE);
        await provider.waitForRuns(1, 'translation');
      });

      await test.step('marks the chapters translated with every paragraph shown in the Result step', async () => {
        const finished = await waitForPipeline(folder, { count: 1 });
        expect(finished.status).toBe('completed');
        expect(finished.tasks.map((task) => task.status)).toEqual(['completed', 'completed']);
        await expect(run.rowAt(1).status).toHaveText(STATUS_DONE);
        await expect(run.rowAt(2).status).toHaveText(STATUS_DONE);
        await expect(run.rowAt(3).status).toHaveText(STATUS_NONE);
        expect((await provider.runs('translation')).length).toBe(2);
        for (const [seq, id] of [
          [2, second],
          [3, third],
        ] as const) {
          const saved = await savedChapter(folder, novelId, id);
          const source = await readParagraphs(folder, novelId, id);
          expect(saved?.paragraphs.map((paragraph) => paragraph.text)).toEqual(
            source.map((text) => taggedCopy(RUN_TARGET, text)),
          );
          await goToStep(ui, 'result');
          await run.jump.selectOption(String(seq));
          await expect(run.pairs).toHaveCount(source.length);
          await expect(run.texts).toHaveText(source.map((text) => taggedCopy(RUN_TARGET, text)));
        }
        await goToStep(ui, 'trans');
      });

      await test.step('replaces the translated text with the new version and keeps the paragraph notes', async () => {
        const source = await readParagraphs(folder, novelId, first);
        await translateChapters(ui, [1]);
        await waitForPipeline(folder, { count: 2 });
        await expect
          .poll(async () => (await savedChapter(folder, novelId, first))?.paragraphs[0]?.text)
          .toBe(taggedCopy(RUN_TARGET, source[0] ?? ''));
        const saved = await savedChapter(folder, novelId, first);
        expect(saved?.paragraphs.map((paragraph) => paragraph.text)).toEqual(
          source.map((text) => taggedCopy(RUN_TARGET, text)),
        );
        expect(saved?.paragraphs.map((paragraph) => paragraph.note)).toEqual([
          'keep the honorific',
          '',
          'check the blade name',
          '',
        ]);
        await goToStep(ui, 'result');
        await run.jump.selectOption('1');
        await expect(run.texts.first()).toHaveText(taggedCopy(RUN_TARGET, source[0] ?? ''));
        await expect(run.notes).toHaveText(['keep the honorific', 'check the blade name']);
      });
    });

    test('US-0061 cancels a running translation and explains failed ones', async ({
      ui,
      picker,
      sandbox,
      provider,
    }) => {
      const { folder, novelId, chapters } = await openTranslation(
        ui,
        picker,
        sandbox,
        runSeed([]),
        'trans',
      );
      const run = runPage(ui);
      const place = readNovelPlace(folder, RUN_NOVEL);
      await provider.setBehavior({ mode: 'hang' });

      await test.step('stops the run on Cancel, marks unfinished tasks cancelled and leaves no partial translation', async () => {
        await translateChapters(ui, [1, 2, 3]);
        await provider.waitForRuns(1, 'translation');
        await expect(run.cancel).toBeVisible();
        await run.cancel.click();
        const cancelled = await waitForPipeline(folder, { count: 1 });
        expect(cancelled.status).toBe('cancelled');
        expect(cancelled.tasks).toHaveLength(3);
        expect(cancelled.tasks.every((task) => task.status === 'cancelled')).toBe(true);
        await expect(run.cancel).toBeHidden();
        for (const chapter of place.chapters.slice(0, 3)) {
          expect(await hasTranslationFile(folder, novelId, chapter.id)).toBe(false);
          await expect(run.rowAt(chapter.seq - 1).status).toHaveText(STATUS_NONE);
        }
        await openLatestPipelineLog(ui);
        await expect(ui.main.pipelines.log.status).toHaveText(PIPELINE_STATUS_CANCELLED);
        await backToTranslation(ui);
      });

      await test.step('shows the reason of each failed task and keeps the chapter untranslated', async () => {
        const scenarios = [
          { behavior: { mode: 'wrong-count' as const }, reason: PROVIDER_WRONG_COUNT },
          { behavior: { mode: 'invalid-json' as const }, reason: PROVIDER_NOT_JSON },
        ];
        for (const [index, scenario] of scenarios.entries()) {
          const seq = index + 1;
          const id = chapters[seq] ?? '';
          await provider.setBehavior(scenario.behavior);
          await translateChapters(ui, [seq]);
          const failed = await waitForPipeline(folder, { count: index + 2 });
          expect(failed.status).toBe('failed');
          expect(failed.tasks[0]?.status).toBe('failed');
          expect(failed.tasks[0]?.error).toMatch(scenario.reason);
          expect(await hasTranslationFile(folder, novelId, id)).toBe(false);
          await openLatestPipelineLog(ui);
          await expect(ui.main.pipelines.log.status).toHaveText(PIPELINE_STATUS_FAILED);
          await expect(
            ui.main.pipelines.log.messages.filter({ hasText: scenario.reason }),
          ).toHaveCount(1);
          await backToTranslation(ui);
          await goToStep(ui, 'trans');
          await expect(run.rowAt(seq - 1).status).toHaveText(STATUS_NONE);
        }
      });
    });
  });
});
