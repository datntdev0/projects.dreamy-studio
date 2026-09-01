import { ExtractionDialog, ExtractionKnowledge } from '../pages/knowledge.ts';
// prettier-ignore
import { ANALYZE_MODE_MISSING_NONE, ANALYZED_COUNT, analyzeStarted, analyzeWarnNoSource, analyzeWarnOverwrite, CHAPTER_COUNT, EMPTY_NOVEL, expectSummary, EXTRACTION_ANALYSIS, EXTRACTION_NOVEL, FAST_BEHAVIOR, KNOWLEDGE_EMPTY_CHAPTERS, KNOWLEDGE_EMPTY_TITLE, listAnalysisIds, openAnalyzeDialog, openKnowledge, partialSeed, plainSeed, PROVIDER_UNREADY, PROVIDER_UNSET,range, readKnowledgeState, reopenKnowledge, selectLang, showKnowledge, SLOW_BEHAVIOR, SMALL_COUNT, smallSeed, TRANSLATED_COUNT } from '../scripts/knowledge.ts';
import { fraction } from '../scripts/novels.ts';
// prettier-ignore
import { expectStatusRunning, readPipelines, showBottomPanel, showPipelineHistory, waitForPipeline } from '../scripts/pipeline.ts';
import { expect, test, writeProviderSettings } from '../scripts/provider.ts';
import { PIPELINE_STATUS_RUNNING } from '../scripts/translation.ts';

const ANALYZED = range(1, ANALYZED_COUNT);
const NOT_ANALYZED = range(ANALYZED_COUNT + 1, CHAPTER_COUNT);
const ALL = range(1, CHAPTER_COUNT);

test.describe('CAP-04 Content Intelligence', () => {
  test.describe('FEAT-27 Knowledge Extraction', () => {
    test.describe('with a ready provider', () => {
      test.use({ providerOptions: { behavior: FAST_BEHAVIOR } });

      test('US-0071 chooses the language version and chapter scope before analyzing', async ({
        ui,
        app,
        picker,
        sandbox,
      }) => {
        await openKnowledge(ui, picker, sandbox, partialSeed());
        await openAnalyzeDialog(ui);
        const dialog = ui.main.knowledge.analyzeDialog;
        const extraction = new ExtractionDialog(app.page);

        await test.step('offers the original version and the existing translations to choose from', async () => {
          await expect(extraction.langOptions).toHaveCount(2);
          await expect(extraction.langOptions.nth(0)).toHaveAttribute('value', 'src');
          await expect(extraction.langOptions.nth(0)).toContainText(
            `${CHAPTER_COUNT}/${CHAPTER_COUNT}`,
          );
          await expect(extraction.langOptions.nth(1)).toHaveAttribute('value', 'VI');
          await expect(extraction.langOptions.nth(1)).toContainText(
            `${TRANSLATED_COUNT}/${CHAPTER_COUNT}`,
          );
          await expect(dialog.lang).toHaveValue('src');
          await dialog.lang.selectOption('VI');
          await expect(dialog.lang).toHaveValue('VI');
          await dialog.lang.selectOption('src');
        });

        await test.step('shows the chapters to run, the batches, the kept chapters and the words for each scope', async () => {
          await expect(dialog.mode('missing')).toContainText(`${NOT_ANALYZED.length}`);
          await expectSummary(ui, extraction, NOT_ANALYZED, 1, ANALYZED);

          await dialog.mode('range').click();
          await dialog.from.fill('2');
          await dialog.from.blur();
          await dialog.to.fill('6');
          await dialog.to.blur();
          await expectSummary(ui, extraction, range(3, 6), 1, [2]);

          await dialog.mode('all').click();
          await expectSummary(ui, extraction, NOT_ANALYZED, 1, ANALYZED);

          await dialog.mode('range').click();
          await dialog.from.fill('1');
          await dialog.from.blur();
          await dialog.to.fill(String(CHAPTER_COUNT));
          await dialog.to.blur();
          await dialog.overwrite.check();
          await expectSummary(ui, extraction, ALL, 2, []);
          await dialog.overwrite.uncheck();
          await expectSummary(ui, extraction, NOT_ANALYZED, 1, ANALYZED);
        });

        await test.step('warns how many chapters with results will be overwritten', async () => {
          await expect(dialog.overwriteWarning).toBeHidden();
          await dialog.overwrite.check();
          await expect(dialog.overwriteWarning).toHaveText(analyzeWarnOverwrite(ANALYZED.length));

          await dialog.mode('all').click();
          await expect(dialog.overwriteWarning).toHaveText(analyzeWarnOverwrite(ANALYZED.length));

          await dialog.mode('range').click();
          await dialog.from.fill('3');
          await dialog.from.blur();
          await expect(dialog.overwriteWarning).toBeHidden();

          await dialog.from.fill('1');
          await dialog.from.blur();
          await expect(dialog.overwriteWarning).toBeVisible();
          await dialog.overwrite.uncheck();
          await expect(dialog.overwriteWarning).toBeHidden();

          await dialog.overwrite.check();
          await dialog.mode('missing').click();
          await expect(dialog.overwriteWarning).toBeHidden();
        });

        await test.step('warns about the chapters without text in the chosen version and skips them', async () => {
          await expect(dialog.noSource).toBeHidden();

          await dialog.lang.selectOption('VI');
          await expectSummary(ui, extraction, range(1, TRANSLATED_COUNT), 1, []);
          await expect(dialog.noSource).toHaveText(
            analyzeWarnNoSource(range(TRANSLATED_COUNT + 1, CHAPTER_COUNT)),
          );
          await expect(dialog.mode('missing')).not.toContainText(ANALYZE_MODE_MISSING_NONE);

          await dialog.lang.selectOption('src');
          await expect(dialog.noSource).toBeHidden();
        });
      });
    });

    test.describe('without a usable provider', () => {
      test.use({ providerOptions: { features: [], behavior: FAST_BEHAVIOR } });

      test('US-0072 explains why analysis cannot run and points to the fix', async ({
        ui,
        app,
        picker,
        sandbox,
        provider,
      }) => {
        const { folder } = await openKnowledge(ui, picker, sandbox, plainSeed(), undefined, {
          novel: EXTRACTION_NOVEL,
        });
        let dialog = ui.main.knowledge.analyzeDialog;
        let extraction = new ExtractionDialog(app.page);

        await test.step('reports an unset provider, blocks the start and opens the settings to change it', async () => {
          await openAnalyzeDialog(ui);
          await expect(dialog.provider).toHaveAttribute('data-state', 'unset');
          await expect(dialog.provider).toContainText(PROVIDER_UNSET);
          await expect(extraction.startButton).toBeDisabled();

          await dialog.cancel.click();
          await expect(dialog.panel).toBeHidden();
          await writeProviderSettings(sandbox, { features: ['knowledge'] });
          await provider.setBehavior({ ...FAST_BEHAVIOR, probe: 'signed-out' });
          await app.restart();
          await reopenKnowledge(ui, picker, folder, EXTRACTION_NOVEL);
          dialog = ui.main.knowledge.analyzeDialog;
          extraction = new ExtractionDialog(app.page);

          await openAnalyzeDialog(ui);
          await expect(dialog.provider).toHaveAttribute('data-state', 'unready');
          await expect(dialog.provider.locator('.t-ink')).not.toBeEmpty();
          await expect(dialog.pane).toContainText(PROVIDER_UNREADY);
          await expect(extraction.startButton).toBeDisabled();
          await expect(dialog.run).toContainText(`${CHAPTER_COUNT}`);

          await dialog.settings.click();
          await expect(dialog.panel).toBeHidden();
          await expect(extraction.providerDialog).toBeVisible();
          await expect(extraction.providerPane).toBeVisible();
          expect(await provider.runs()).toHaveLength(0);
        });

        await test.step('shows an empty state and locks the analyze button for a novel without chapters', async () => {
          await app.page.keyboard.press('Escape');
          await expect(extraction.providerDialog).toBeHidden();

          await showKnowledge(ui, EMPTY_NOVEL);
          await expect(ui.main.knowledge.emptyChapters).toBeVisible();
          await expect(ui.main.knowledge.emptyChapters).toContainText(KNOWLEDGE_EMPTY_CHAPTERS);
          await expect(ui.main.knowledge.analyze).toBeDisabled();
          await expect(ui.main.knowledge.emptyAnalyze).toHaveCount(0);
        });

        await test.step('shows the no-knowledge state with a way to start the analysis for a novel with chapters', async () => {
          await showKnowledge(ui, EXTRACTION_NOVEL);
          await expect(ui.main.knowledge.empty).toBeVisible();
          await expect(ui.main.knowledge.empty).toContainText(KNOWLEDGE_EMPTY_TITLE);
          await expect(ui.main.knowledge.analyze).toBeEnabled();

          await ui.main.knowledge.emptyAnalyze.click();
          await expect(dialog.panel).toBeVisible();
          await expect(dialog.run).toContainText(`${CHAPTER_COUNT}`);
        });
      });
    });

    test.describe('running the analysis', () => {
      test.use({ providerOptions: { behavior: SLOW_BEHAVIOR } });

      test('US-0073 runs the analysis and shows the extracted knowledge', async ({
        ui,
        app,
        picker,
        sandbox,
        provider,
      }) => {
        const { folder } = await openKnowledge(ui, picker, sandbox, smallSeed());
        const knowledge = ui.main.knowledge;
        const dialog = knowledge.analyzeDialog;
        const extraction = new ExtractionKnowledge(app.page);
        await selectLang(ui, 'src');

        await test.step('closes the dialog, announces how many chapters started and lists the analysis pipeline as running', async () => {
          await openAnalyzeDialog(ui);
          await expect(dialog.provider).toHaveAttribute('data-state', 'ready');
          await expect(dialog.run).toContainText(`${SMALL_COUNT}`);
          await expect(new ExtractionDialog(app.page).startButton).toBeEnabled();
          await dialog.start.click();

          await expect(dialog.panel).toBeHidden();
          await expect(ui.main.toast(analyzeStarted(SMALL_COUNT))).toBeVisible();
          await expectStatusRunning(ui);
          await showBottomPanel(ui, 'pipelines');
          const item = ui.main.pipelines.list.item(EXTRACTION_NOVEL);
          await expect(item).toHaveCount(1);
          await expect(ui.main.pipelines.item(item).status).toHaveText(PIPELINE_STATUS_RUNNING);
          const running = readPipelines(folder);
          expect(running.at(-1)?.kind).toBe('analysis');
          expect(running.at(-1)?.total).toBe(SMALL_COUNT);
        });

        await test.step('locks the analyze button until the run finishes', async () => {
          await expect(knowledge.analyze).toBeDisabled();
          await provider.waitForRuns(1);
          await expect(knowledge.analyze).toBeDisabled();
        });

        await test.step('shows entities and facts with quotes and the analyzed chapters over the total once it finishes', async () => {
          const pipeline = await waitForPipeline(folder, { timeoutMs: 90_000 });
          expect(pipeline.status).toBe('completed');
          expect(pipeline.tasks).toHaveLength(SMALL_COUNT);
          await expect(knowledge.analyze).toBeEnabled();

          const state = await readKnowledgeState(folder, EXTRACTION_NOVEL, 'src');
          expect(Object.keys(state.files)).toHaveLength(SMALL_COUNT);
          const quoted = state.facts.flatMap((fact) => fact.evidence.map((item) => item.q));
          expect(quoted).toContain('He was twenty years old and worked as a blacksmith.');
          expect(state.facts.every((fact) => fact.evidence.length > 0)).toBe(true);
          const names = state.entities.map((entity) => entity.name);
          for (const entity of EXTRACTION_ANALYSIS.entities ?? []) {
            expect(names).toContain(entity.name);
          }

          await expect(extraction.progress).toContainText(fraction(SMALL_COUNT, SMALL_COUNT));
          await selectLang(ui, 'src');
          await ui.main.knowledge.tabButton('list').click();
          await expect(extraction.listRow('Lin Feng').first()).toBeVisible();
          await expect(extraction.listCount).toContainText(`${state.entities.length}`);
          await extraction.listRow('Lin Feng').first().click();
          await expect(extraction.detail).toContainText(
            'He was twenty years old and worked as a blacksmith.',
          );
        });
      });
    });

    test.describe('with one chapter failing', () => {
      test.use({
        providerOptions: {
          behavior: { ...FAST_BEHAVIOR, chapters: { 'The Trial': 'invalid-json' } },
        },
      });

      test('US-0074 keeps the results of the good chapters when one chapter fails', async ({
        ui,
        picker,
        sandbox,
      }) => {
        const { folder, chapters, novelId } = await openKnowledge(ui, picker, sandbox, smallSeed());
        await selectLang(ui, 'src');
        await openAnalyzeDialog(ui);
        await ui.main.knowledge.analyzeDialog.start.click();
        await expect(ui.main.knowledge.analyzeDialog.panel).toBeHidden();
        const pipeline = await waitForPipeline(folder, { timeoutMs: 90_000 });

        await test.step('reports an error on the failing chapter task with a reason', async () => {
          expect(pipeline.status).toBe('failed');
          const failed = pipeline.tasks.filter((task) => task.status === 'failed');
          expect(failed).toHaveLength(1);
          expect(failed[0]?.chapterId).toBe(chapters[2]);
          expect(failed[0]?.error).toMatch(/\S/);
          expect(pipeline.tasks.filter((task) => task.status === 'completed')).toHaveLength(2);

          await showPipelineHistory(ui);
          const row = ui.main.pipelines.history.rowFor(EXTRACTION_NOVEL);
          await expect(row).toHaveCount(1);
          await row.click();
          await expect(ui.main.pipelines.log.root).toContainText(
            failed[0]?.error.slice(0, 20) ?? '',
          );
        });

        await test.step('keeps the knowledge of the good chapters and leaves no partial result for the failed one', async () => {
          const ids = await listAnalysisIds(folder, novelId, 'src');
          expect(ids).toEqual([chapters[1], chapters[3]].sort());
          const state = await readKnowledgeState(folder, EXTRACTION_NOVEL, 'src');
          expect(Object.keys(state.files).map(Number)).toEqual([1, 3]);
          expect(state.entities.length).toBeGreaterThan(0);
          expect(state.facts.length).toBeGreaterThan(0);
        });
      });
    });
  });
});
