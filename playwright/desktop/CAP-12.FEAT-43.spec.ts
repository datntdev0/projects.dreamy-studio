import type { LlmFeatureId } from '../pages/settings.ts';
import { waitForPipeline } from '../scripts/pipeline.ts';
import { providerExecutable } from '../scripts/provider.ts';
// prettier-ignore
import { CLAUDE_MODELS, closeSettings, expect, FEATURE_HINTS, FEATURE_NAMES, FEATURE_NO_CLI, FEATURE_UNSET, openLlmTab, readSettingsJson, removeCliPath, selectLlmTab, test, useCliPath } from '../scripts/settings.ts';
import { openTranslation, runSeed, translateChapters } from '../scripts/translation.ts';

const FEATURES: readonly LlmFeatureId[] = ['translation', 'knowledge', 'assistant'];
const DEFAULT_FLAGS = ['--model', '--effort', '--max-turns'];

test.describe('CAP-12 Configuration', () => {
  test.describe('FEAT-43 LLM Feature Configuration', () => {
    test('US-0117 lists the features and chooses a provider for each', async ({
      ui,
      picker,
      sandbox,
      provider,
    }) => {
      await provider.clearSelection();
      await removeCliPath(sandbox, 'claude');
      const opened = await openTranslation(ui, picker, sandbox, runSeed([]), 'trans');
      await openLlmTab(ui, 'features');
      const llm = ui.main.settings.llm;

      await test.step('lists the translation, knowledge and assistant features, each with a short description', async () => {
        await expect(llm.featureCards).toHaveCount(FEATURES.length);
        for (const [index, id] of FEATURES.entries()) {
          await expect(llm.feature(id).name).toHaveText(FEATURE_NAMES[index] ?? '');
          await expect(llm.feature(id).hint).toHaveText(FEATURE_HINTS[index] ?? '');
        }
      });

      await test.step('shows the provider as not selected for a feature that has none', async () => {
        for (const id of FEATURES) {
          await expect(llm.feature(id).provider).toHaveValue('');
          await expect(llm.feature(id).providerSelected).toHaveText(FEATURE_UNSET);
        }
      });

      await test.step('tells that no installed CLI supports the feature when none is installed', async () => {
        for (const id of FEATURES) {
          await expect(llm.feature(id).providerEmpty).toHaveText(FEATURE_NO_CLI);
          await expect(llm.feature(id).providerOptions).toHaveCount(1);
        }
      });

      await test.step('saves the chosen provider and uses it for the next run of the feature', async () => {
        await selectLlmTab(ui, 'cli');
        await useCliPath(ui, 'claude', providerExecutable(sandbox));
        await selectLlmTab(ui, 'features');
        const translation = llm.feature('translation');
        await expect(translation.providerEmpty).toHaveCount(0);
        await translation.provider.selectOption('claude');
        await expect(translation.provider).toHaveValue('claude');
        await expect
          .poll(
            async () => (await readSettingsJson(sandbox)).llm?.features?.['translation']?.provider,
          )
          .toBe('claude');
        await closeSettings(ui);
        expect(await provider.runs('translation')).toHaveLength(0);
        await translateChapters(ui, [1]);
        const calls = await provider.waitForRuns(1, 'translation');
        expect(calls[0]?.args).toContain('-p');
        const finished = await waitForPipeline(opened.folder, { count: 1 });
        expect(finished.status).toBe('completed');
      });
    });

    test('US-0118 sets the model, effort and extra arguments of a feature', async ({
      ui,
      picker,
      sandbox,
      provider,
    }) => {
      await openTranslation(ui, picker, sandbox, runSeed([]), 'trans');
      await openLlmTab(ui, 'features');
      const translation = ui.main.settings.llm.feature('translation');

      await test.step('saves the model, effort and extra arguments and shows them again when the dialog is reopened', async () => {
        await translation.model.fill('sonnet');
        await translation.model.blur();
        await translation.effort.selectOption('high');
        await translation.args.fill('--max-turns 5');
        await translation.args.blur();
        await expect
          .poll(async () => (await readSettingsJson(sandbox)).llm?.features?.['translation'])
          .toEqual({ provider: 'claude', model: 'sonnet', effort: 'high', args: '--max-turns 5' });
        await closeSettings(ui);
        await openLlmTab(ui, 'features');
        await expect(translation.model).toHaveValue('sonnet');
        await expect(translation.effort).toHaveValue('high');
        await expect(translation.args).toHaveValue('--max-turns 5');
      });

      await test.step('runs the feature with the CLI defaults for every field left empty', async () => {
        await translation.model.fill('');
        await translation.model.blur();
        await translation.effort.selectOption('');
        await translation.args.fill('');
        await translation.args.blur();
        await expect
          .poll(async () => (await readSettingsJson(sandbox)).llm?.features?.['translation'])
          .toEqual({ provider: 'claude' });
        await closeSettings(ui);
        await translateChapters(ui, [1]);
        const calls = await provider.waitForRuns(1, 'translation');
        expect(calls[0]?.args).toContain('-p');
        expect(calls[0]?.args.filter((value) => DEFAULT_FLAGS.includes(value))).toEqual([]);
      });

      await test.step('suggests the opus, sonnet and haiku models for the Claude provider', async () => {
        await openLlmTab(ui, 'features');
        await expect(translation.provider).toHaveValue('claude');
        await expect(translation.model).toHaveAttribute(
          'list',
          'settings-llm-feature-translation-models',
        );
        await expect(translation.modelSuggestions).toHaveCount(CLAUDE_MODELS.length);
        for (const [index, model] of CLAUDE_MODELS.entries()) {
          await expect(translation.modelSuggestions.nth(index)).toHaveAttribute('value', model);
        }
      });
    });
  });
});
