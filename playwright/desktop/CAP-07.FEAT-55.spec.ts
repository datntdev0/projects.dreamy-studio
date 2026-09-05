import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { addBlock, assignSpeaker, BLANK_PAGE, BLOCK_TYPES, changeType, generateDefault, MANAGE_CAST, NARRATOR, openScriptingOf, paragraphsOf, reopenScripting, showCast, startWriting, textContent, trackSaves, TYPE_DIALOGUE, TYPE_HEADING, TYPE_NARRATION, TYPE_NOTE, TYPE_PAUSE, waitForSaves } from '../scripts/scripting.ts';

const NOTE_HINT = 'Internal note, not included in production.';
const EDITED = 'Lin Feng waited at the gate.';
const TONE = 'whispering';
const PAUSE_INPUTS: readonly (readonly [string, string])[] = [
  ['1.26', '1.3'],
  ['45', '30.0'],
  ['-2', '0.0'],
  ['2', '2.0'],
  ['', '0.0'],
];

test.describe('CAP-07 Pre-Production', () => {
  test.describe('FEAT-55 Script Block Editing', () => {
    test('US-0148 adds and retypes blocks and saves the changes automatically', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const folder = await openScriptingOf(ui, picker, sandbox);
      let scripting = ui.main.scripting;
      const spy = await trackSaves(app);
      await generateDefault(ui, 1);

      await test.step('offers title, narration, dialogue, pause and note and inserts the selected new block after the selected block or at the end', async () => {
        await scripting.block(1).text.click();
        await scripting.addButton.click();
        await expect(scripting.menuItems).toHaveText(BLOCK_TYPES);
        await scripting.menuItem(TYPE_NOTE).click();
        await expect(scripting.blocks).toHaveCount(5);
        await expect(scripting.block(2).type).toHaveText(TYPE_NOTE);
        await expect(scripting.block(2).root).toHaveClass(/is-sel/);
        await scripting.unit(2).click();
        await scripting.unit(1).click();
        await addBlock(ui, TYPE_PAUSE);
        await expect(scripting.blocks).toHaveCount(6);
        await expect(scripting.block(5).type).toHaveText(TYPE_PAUSE);
        await expect(scripting.block(5).root).toHaveClass(/is-sel/);
      });

      await test.step('changes the block type from its type button with the current type locked', async () => {
        await scripting.block(0).type.click();
        await expect(scripting.menuItem(TYPE_NARRATION)).toBeDisabled();
        await expect(scripting.menuItem(TYPE_HEADING)).toBeEnabled();
        await scripting.menuItem(TYPE_HEADING).click();
        await expect(scripting.block(0).type).toHaveText(TYPE_HEADING);
      });

      await test.step('saves the content changes automatically', async () => {
        await scripting.block(1).text.fill(EDITED);
        await waitForSaves(app.page, spy);
        scripting = await reopenScripting(ui, app, picker, folder);
        await expect(scripting.blocks).toHaveCount(6);
        await expect(scripting.block(0).type).toHaveText(TYPE_HEADING);
        await expect(scripting.block(1).text).toHaveText(EDITED);
        await expect(scripting.block(2).type).toHaveText(TYPE_NOTE);
      });
    });

    test('US-0148 explains that a note block is internal only and not produced', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      await generateDefault(ui, 1);

      await test.step('shows the internal only hint on a note block', async () => {
        await expect(scripting.block(0).hint).toBeHidden();
        await changeType(ui, scripting.block(0), TYPE_NOTE);
        await expect(scripting.block(0).hint).toHaveText(NOTE_HINT);
      });
    });

    test('US-0149 assigns a character and a tone to dialogue lines', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const folder = await openScriptingOf(ui, picker, sandbox);
      let scripting = ui.main.scripting;
      const spy = await trackSaves(app);
      await generateDefault(ui, 1);
      await showCast(ui);
      const firstName = await scripting.cast.rowAt(1).name.inputValue();
      const secondName = await scripting.cast.rowAt(2).name.inputValue();

      await test.step('assigns the first character that is not the narrator to a block turned into dialogue', async () => {
        await changeType(ui, scripting.block(0), TYPE_DIALOGUE);
        await expect(scripting.block(0).who).toHaveText(firstName);
      });

      await test.step('lists the characters with the current one locked and opens the character panel from manage characters', async () => {
        await app.page.getByTestId('inspector-collapse').click();
        await expect(scripting.cast.root).toBeHidden();
        await scripting.block(0).who.click();
        await expect(scripting.menuItem(NARRATOR)).toBeEnabled();
        await expect(scripting.menuItem(firstName)).toBeDisabled();
        await expect(scripting.menuItem(secondName)).toBeEnabled();
        await scripting.menuItem(MANAGE_CAST).click();
        await expect(scripting.cast.root).toBeVisible();
      });

      await test.step('saves the tone with the dialogue line', async () => {
        await scripting.block(0).tone.fill(TONE);
        await scripting.block(0).tone.press('Tab');
        await waitForSaves(app.page, spy);
        scripting = await reopenScripting(ui, app, picker, folder);
        await expect(scripting.block(0).tone).toHaveValue(TONE);
        await expect(scripting.block(0).who).toHaveText(firstName);
      });

      await test.step('gives a new dialogue the speaker of the latest dialogue in the chapter, or else the first character', async () => {
        await assignSpeaker(ui, scripting.block(0), secondName);
        await scripting.block(3).text.click();
        await addBlock(ui, TYPE_DIALOGUE);
        await expect(scripting.block(4).who).toHaveText(secondName);
        await startWriting(ui, 2);
        await addBlock(ui, TYPE_DIALOGUE);
        await expect(scripting.block(1).who).toHaveText(firstName);
      });
    });

    test('US-0150 sets the pause length in tenths of a second between 0 and 30 seconds', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const pause = scripting.block(1).pause;
      await generateDefault(ui, 1);

      await test.step('uses 0.8 seconds for a block turned into a pause', async () => {
        await changeType(ui, scripting.block(1), TYPE_PAUSE);
        await expect(pause).toHaveValue('0.8');
      });

      await test.step('rounds to 0.1 seconds, clamps between 0 and 30 and turns an invalid value into 0', async () => {
        for (const [typed, shown] of PAUSE_INPUTS) {
          await pause.fill(typed);
          await expect(pause).toHaveValue(typed);
          await pause.blur();
          await expect(pause).toHaveValue(shown);
        }
      });
    });

    test('US-0151 moves, duplicates and deletes blocks', async ({ ui, picker, sandbox }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const [p1 = '', p2 = '', p3 = '', p4 = ''] = paragraphsOf(1);
      await generateDefault(ui, 1);

      await test.step('swaps a block with its neighbour and keeps the first and last blocks in place', async () => {
        await scripting.block(1).use('up');
        await expect(scripting.texts).toHaveText([p2, p1, p3, p4]);
        await scripting.block(0).use('up');
        await scripting.block(3).use('down');
        await expect(scripting.texts).toHaveText([p2, p1, p3, p4]);
        await scripting.block(2).use('down');
        await expect(scripting.texts).toHaveText([p2, p1, p4, p3]);
      });

      await test.step('inserts a selected copy right below the duplicated block', async () => {
        await scripting.block(1).use('duplicate');
        await expect(scripting.texts).toHaveText([p2, p1, p1, p4, p3]);
        await expect(scripting.block(2).root).toHaveClass(/is-sel/);
      });

      await test.step('deletes a block without confirmation and selects the block before it', async () => {
        await scripting.block(2).use('remove');
        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(scripting.texts).toHaveText([p2, p1, p4, p3]);
        await expect(scripting.block(1).root).toHaveClass(/is-sel/);
      });

      await test.step('asks to choose a block type in the bar above once the chapter has no block', async () => {
        for (let left = 4; left > 0; left -= 1) {
          await scripting.block(0).use('remove');
          await expect(scripting.blocks).toHaveCount(left - 1);
        }
        await expect(scripting.blank).toHaveText(BLANK_PAGE);
      });
    });

    test('US-0152 writes the script with the keyboard', async ({ ui, app, picker, sandbox }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const keyboard = app.page.keyboard;
      await startWriting(ui, 2);
      await expect(scripting.block(0).text).toBeFocused();

      await test.step('creates a narration block after a title, narration, dialogue and note on Enter', async () => {
        await keyboard.type('The Trial');
        await keyboard.press('Enter');
        await expect(scripting.block(1).type).toHaveText(TYPE_NARRATION);
        await expect(scripting.block(1).text).toBeFocused();
        await keyboard.type('Narration line');
        await keyboard.press('Enter');
        await expect(scripting.block(2).type).toHaveText(TYPE_NARRATION);
        await keyboard.press('Tab');
        await expect(scripting.block(2).type).toHaveText(TYPE_DIALOGUE);
        await keyboard.type('Hello');
        await keyboard.press('Enter');
        await expect(scripting.block(3).type).toHaveText(TYPE_NARRATION);
        await keyboard.press('Tab');
        await keyboard.press('Tab');
        await expect(scripting.block(3).type).toHaveText(TYPE_NOTE);
        await keyboard.type('Remember the bell');
        await keyboard.press('Enter');
        await expect(scripting.blocks).toHaveCount(5);
        await expect(scripting.block(4).type).toHaveText(TYPE_NARRATION);
      });

      await test.step('cycles title, narration, dialogue and note with Tab and Shift+Tab', async () => {
        for (const type of [TYPE_DIALOGUE, TYPE_NOTE, TYPE_HEADING, TYPE_NARRATION]) {
          await keyboard.press('Tab');
          await expect(scripting.block(4).type).toHaveText(type);
        }
        for (const type of [TYPE_HEADING, TYPE_NOTE]) {
          await keyboard.press('Shift+Tab');
          await expect(scripting.block(4).type).toHaveText(type);
        }
      });

      await test.step('deletes an empty block on Backspace', async () => {
        await keyboard.press('Backspace');
        await expect(scripting.blocks).toHaveCount(4);
      });

      await test.step('breaks the line inside the same block on Shift+Enter', async () => {
        await scripting.block(1).text.click();
        await keyboard.press('Control+End');
        await keyboard.press('Shift+Enter');
        await keyboard.type('second line');
        await expect(scripting.blocks).toHaveCount(4);
        await expect
          .poll(() => textContent(scripting.block(1).text))
          .toMatch(/^Narration line\nsecond line\n?$/);
      });

      await test.step('moves the caret to the previous or next block with the arrows at the start or end of the content', async () => {
        await keyboard.press('Control+Home');
        await keyboard.press('ArrowUp');
        await expect(scripting.block(0).text).toBeFocused();
        await keyboard.press('Control+End');
        await keyboard.press('ArrowDown');
        await expect(scripting.block(1).text).toBeFocused();
      });
    });
  });
});
