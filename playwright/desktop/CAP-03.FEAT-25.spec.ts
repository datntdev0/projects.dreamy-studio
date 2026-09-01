import { expect, test } from '../scripts/provider.ts';
// prettier-ignore
import { addDictionaryEntry, deleteFirstDictionaryEntry, DICTIONARY_SEED, editTranslatedParagraph, expectedLabels, expectedWarnings, FILTER_SEED, filterText, flaggedToast, goToStep, HERO_TEXT, openTranslation, shownLabels, WARN_EMPTY, WARN_KIND_DICT, WARN_REASON_DICT,WARNINGS_NOVEL, WARNINGS_TARGET, warningsView } from '../scripts/translation.ts';

test.describe('CAP-03 Content Translation', () => {
  test.describe('FEAT-25 Translation Warnings', () => {
    test('US-0066 warns when a translation does not use the dictionary', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder } = await openTranslation(ui, picker, sandbox, DICTIONARY_SEED, 'warn', {
        target: WARNINGS_TARGET,
      });
      const view = warningsView(ui);

      await test.step('shows the passage with a dictionary warning in the Warnings step', async () => {
        await expect(view.cards).toHaveCount(1);
        await expect(view.badge(1, 3)).toHaveText(WARN_KIND_DICT);
        await expect(view.passageChip(1, 3)).toBeVisible();
        await expect(view.reason(1, 3)).toHaveText(WARN_REASON_DICT);
        await expect(view.reason(1, 3)).toContainText('Lin Feng');
        await expect(view.reason(1, 3)).toContainText('Lâm Phong');
        expect(await shownLabels(view)).toEqual(
          expectedLabels(await expectedWarnings(folder, WARNINGS_NOVEL, WARNINGS_TARGET)),
        );
        expect(
          expectedLabels(await expectedWarnings(folder, WARNINGS_NOVEL, WARNINGS_TARGET)),
        ).toEqual(['dict|Ch.1 ¶3']);
      });

      await test.step('tells how many passages need review when a new entry no longer matches translated passages', async () => {
        await addDictionaryEntry(ui, 'Master Chen', 'Thầy Chen');

        await expect(ui.main.toast(flaggedToast(1))).toBeVisible();
        expect(await expectedWarnings(folder, WARNINGS_NOVEL, WARNINGS_TARGET)).toHaveLength(2);
      });

      await test.step('clears the warning of a passage once the translation contains the dictionary translation', async () => {
        await goToStep(ui, 'warn');
        await expect(view.cards).toHaveCount(2);

        await editTranslatedParagraph(ui, 1, 3, HERO_TEXT);
        await goToStep(ui, 'warn');

        await expect(view.cards).toHaveCount(1);
        await expect(view.card(1, 3)).toHaveCount(0);
        await expect(view.card(1, 2)).toBeVisible();
        expect(await shownLabels(view)).toEqual(
          expectedLabels(await expectedWarnings(folder, WARNINGS_NOVEL, WARNINGS_TARGET)),
        );
        expect(
          expectedLabels(await expectedWarnings(folder, WARNINGS_NOVEL, WARNINGS_TARGET)),
        ).toEqual(['dict|Ch.1 ¶2']);
      });
    });

    test('US-0068 filters dictionary warnings and acts on them until none is left', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openTranslation(ui, picker, sandbox, FILTER_SEED, 'warn', { target: WARNINGS_TARGET });
      const view = warningsView(ui);

      await test.step('lists the dictionary warnings and shows a count on every filter', async () => {
        await expect(view.filter('all')).toHaveText(filterText('all', 3));
        await expect(view.filter('dict')).toHaveText(filterText('dict', 3));
        await expect(view.cards).toHaveCount(3);

        await view.filter('dict').click();
        await expect(view.filter('dict')).toHaveAttribute('aria-pressed', 'true');
        await expect(view.cards).toHaveCount(3);
        expect(await shownLabels(view)).toEqual(['dict|Ch.1 ¶3', 'dict|Ch.2 ¶2', 'dict|Ch.2 ¶4']);

        await view.filter('all').click();
        await expect(view.filter('all')).toHaveAttribute('aria-pressed', 'true');
        await expect(view.cards).toHaveCount(3);
      });

      await test.step('moves to the translated passage or to the dictionary step from a warning', async () => {
        await view.view(2, 2).click();
        await expect(ui.main.translation.step('result')).toHaveAttribute('aria-current', 'true');
        await expect(view.resultJump).toHaveValue('2');
        await expect(view.resultPair(2)).toHaveClass(/is-flash/);

        await goToStep(ui, 'warn');
        await view.openDictionary(2, 4).click();
        await expect(ui.main.translation.step('dict')).toHaveAttribute('aria-current', 'true');
        await expect(ui.main.translation.stepRoot('dict')).toBeVisible();
      });

      await test.step('shows the no warnings state once nothing needs review', async () => {
        await deleteFirstDictionaryEntry(ui);
        await goToStep(ui, 'warn');

        await expect(view.empty).toBeVisible();
        await expect(view.empty).toContainText(WARN_EMPTY);
        await expect(view.cards).toHaveCount(0);
      });
    });
  });
});
