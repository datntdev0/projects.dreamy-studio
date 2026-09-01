import { expect, test } from '../scripts/provider.ts';
// prettier-ignore
import { FIRST_CHAPTER, NOTE_SEED, openResult, openTranslation, reopenResult, RESULT_EMPTY, RESULT_NONE_ACTION, RESULT_NONE_TITLE, RESULT_SAVED, RESULT_UNCHANGED,REVIEW_SEED, SECOND_CHAPTER, SOURCE_FIRST, SOURCE_SECOND, storedParagraphs } from '../scripts/translation.ts';

const EDITED = 'Lam Phong den cong Thanh Lam luc rang sang.';
const NOTE_ORIGINAL = 'Check the sect title';
const NOTE_ADDED = 'Confirm the city name';
const NOTE_EDITED = 'Sect title is final';

test.describe('CAP-03 Content Translation', () => {
  test.describe('FEAT-24 Translation Review', () => {
    test('US-0062 compares source and translated paragraphs side by side across chapters and filters the ones to review', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      await openTranslation(ui, picker, sandbox, REVIEW_SEED);
      const result = await openResult(ui, app);

      await test.step('shows each source paragraph next to its translated paragraph', async () => {
        await expect(result.pairs).toHaveCount(SOURCE_FIRST.length);
        for (const [index, source] of SOURCE_FIRST.entries()) {
          await expect(result.source(index + 1)).toContainText(source);
          await expect(result.text(index + 1)).toHaveText(FIRST_CHAPTER[index] ?? '');
        }
      });

      await test.step('shows the selected chapter when moving to the next chapter, the previous chapter or jumping to a chapter', async () => {
        await expect(result.prev).toBeDisabled();
        await result.next.click();
        await expect(result.jump).toHaveValue('2');
        await expect(result.source(1)).toContainText(SOURCE_SECOND[0] ?? '');
        await expect(result.text(1)).toHaveText(SECOND_CHAPTER[0] ?? '');

        await result.prev.click();
        await expect(result.jump).toHaveValue('1');
        await expect(result.source(1)).toContainText(SOURCE_FIRST[0] ?? '');

        await result.jump.selectOption('3');
        await expect(result.jump).toHaveValue('3');
        await expect(result.next).toBeDisabled();
        await expect(result.none).toBeVisible();
        await expect(result.pairs).toHaveCount(0);

        await result.jump.selectOption('2');
        await expect(result.jump).toHaveValue('2');
        await expect(result.text(4)).toHaveText(SECOND_CHAPTER[3] ?? '');
        await result.jump.selectOption('1');
        await expect(result.jump).toHaveValue('1');
      });

      await test.step('shows only the paragraphs to review when the filter is on', async () => {
        await expect(result.pairs).toHaveCount(4);
        await result.only.check();

        await expect(result.pairs).toHaveCount(2);
        await expect(result.source(1)).toContainText(SOURCE_FIRST[1] ?? '');
        await expect(result.source(2)).toContainText(SOURCE_FIRST[2] ?? '');
        await expect(result.state(1)).toBeVisible();
        await expect(result.state(2)).toBeVisible();

        await result.only.uncheck();
        await expect(result.pairs).toHaveCount(4);
      });
    });

    test('US-0063 edits a translated paragraph and keeps it saved, rejects an empty paragraph and reports no changes', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      const opened = await openTranslation(ui, picker, sandbox, REVIEW_SEED);
      const result = await openResult(ui, app);

      await test.step('updates the paragraph, shows the saved notice and keeps the new text when reopened', async () => {
        await result.text(1).click();
        await expect(result.textarea).toHaveValue(FIRST_CHAPTER[0]);
        await result.textarea.fill(EDITED);
        await result.save(1).click();

        await expect(ui.main.toast(RESULT_SAVED)).toBeVisible();
        await expect(result.textarea).toBeHidden();
        await expect(result.text(1)).toHaveText(EDITED);
        expect((await storedParagraphs(opened, 1))[0]?.text).toBe(EDITED);

        const reopened = await reopenResult(ui, app);
        await expect(reopened.text(1)).toHaveText(EDITED);
      });

      await test.step('rejects the empty paragraph, says it cannot be empty and keeps the editor open', async () => {
        await result.text(2).click();
        await result.textarea.fill('');
        await result.save(2).click();

        await expect(ui.main.toast(RESULT_EMPTY)).toBeVisible();
        await expect(result.textarea).toBeVisible();
        expect((await storedParagraphs(opened, 1))[1]?.text).toBe(FIRST_CHAPTER[1]);
      });

      await test.step('reports no changes when saving without changing the text', async () => {
        await result.text(3).click();
        await expect(result.textarea).toHaveValue(FIRST_CHAPTER[2]);
        await result.save(3).click();

        await expect(ui.main.toast(RESULT_UNCHANGED)).toBeVisible();
        expect((await storedParagraphs(opened, 1))[2]?.text).toBe(FIRST_CHAPTER[2]);
      });
    });

    test('US-0064 adds, edits and clears a paragraph note that stays after reopening', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      const opened = await openTranslation(ui, picker, sandbox, NOTE_SEED);
      const result = await openResult(ui, app);

      await test.step('shows the note on its paragraph and keeps it when reopened', async () => {
        await expect(result.note(2)).toContainText(NOTE_ORIGINAL);
        await result.noteOpen(1).click();
        await result.noteInput.fill(NOTE_ADDED);
        await result.noteSave(1).click();

        await expect(result.noteInput).toBeHidden();
        await expect(result.note(1)).toContainText(NOTE_ADDED);
        expect((await storedParagraphs(opened, 1))[0]?.note).toBe(NOTE_ADDED);

        const reopened = await reopenResult(ui, app);
        await expect(reopened.note(1)).toContainText(NOTE_ADDED);
      });

      await test.step('updates the note when edited and removes it from the paragraph when cleared', async () => {
        await result.note(2).click();
        await expect(result.noteInput).toHaveValue(NOTE_ORIGINAL);
        await result.noteInput.fill(NOTE_EDITED);
        await result.noteSave(2).click();

        await expect(result.note(2)).toContainText(NOTE_EDITED);
        expect((await storedParagraphs(opened, 1))[1]?.note).toBe(NOTE_EDITED);

        await result.note(2).click();
        await result.noteInput.fill('');
        await result.noteSave(2).click();

        await expect(result.note(2)).toHaveCount(0);
        await expect(result.noteOpen(2)).toBeVisible();
        expect((await storedParagraphs(opened, 1))[1]?.note).toBe('');

        const reopened = await reopenResult(ui, app);
        await expect(reopened.note(2)).toHaveCount(0);
        await expect(reopened.note(1)).toContainText(NOTE_ADDED);
      });
    });

    test('US-0065 offers to translate a chapter that has no translation and opens the translate dialog on it', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      await openTranslation(ui, picker, sandbox, REVIEW_SEED);
      const result = await openResult(ui, app);
      await result.jump.selectOption('3');

      await test.step('shows the notice that the chapter has no translation with a translate this chapter button', async () => {
        await expect(result.none).toBeVisible();
        await expect(result.noneTitle).toHaveText(RESULT_NONE_TITLE);
        await expect(result.noneTitle).toContainText('3');
        await expect(result.translateThis).toHaveText(RESULT_NONE_ACTION);
        await expect(result.pairs).toHaveCount(0);
      });

      await test.step('opens the translate dialog planned on that chapter', async () => {
        const dialog = ui.main.translation.runDialog;
        await result.translateThis.click();

        await expect(dialog.panel).toBeVisible();
        await expect(dialog.mode('range')).toHaveClass(/is-on/);
        await expect(dialog.from).toHaveValue('3');
        await expect(dialog.to).toHaveValue('3');
        await expect(dialog.run).toContainText('Ch.3');
        await expect(dialog.start).toContainText('(1)');
      });
    });
  });
});
