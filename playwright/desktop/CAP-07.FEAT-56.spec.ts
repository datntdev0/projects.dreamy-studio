import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { assignSpeaker, AUDIO_PROJECT, CAST_DUPLICATE, CAST_HINT_KB, castId, castIdOf, changeType, DELETE_FREE, DELETE_KB, DELETE_NARRATOR, DELETE_USED, dotClasses, generateDefault, HEALER, HERO, MASTER, NARRATOR, NARRATOR_ID, NESTED, openAudiobook, openScripting, openScriptingOf, PROJECT_IDS, showCast, TYPE_DIALOGUE, VI_HERO, VIET_PROJECT } from '../scripts/scripting.ts';

const KB_CAST = [HERO, MASTER, HEALER];
const FISHER = 'Old Fisher';
const TEA_WOMAN = 'Tea Woman';
const AUDIO_ID = PROJECT_IDS[AUDIO_PROJECT] ?? 1;

test.describe('CAP-07 Pre-Production', () => {
  test.describe('FEAT-56 Script Cast Management', () => {
    test('US-0153 takes the cast from the knowledge of the novel in the project language', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingOf(ui, picker, sandbox);
      const cast = ui.main.scripting.cast;
      await generateDefault(ui, 1);
      await showCast(ui);

      await test.step('lists the narrator and the knowledge characters, each with its own colour', async () => {
        await expect(cast.heading).toHaveText(`Characters · ${KB_CAST.length + 1}`);
        await expect(cast.rows).toHaveCount(KB_CAST.length + 1);
        await expect(cast.row(NARRATOR_ID).name).toHaveValue(NARRATOR);
        for (const name of KB_CAST) {
          await expect(cast.row(castId(name)).name).toHaveValue(name);
        }
        const classes = await dotClasses(ui);
        expect(new Set(classes).size).toBe(KB_CAST.length + 1);
      });

      await test.step('shows how many dialogue lines use each character', async () => {
        await expect(cast.row(castId(HERO)).used).toHaveText('0');
        await changeType(ui, ui.main.scripting.block(0), TYPE_DIALOGUE);
        await expect(ui.main.scripting.block(0).who).toHaveText(HERO);
        await expect(cast.row(castId(HERO)).used).toHaveText('1');
      });

      await test.step('keeps only the longer name when one character name is contained in another', async () => {
        await expect(cast.row(castId(NESTED)).root).toHaveCount(0);
        await expect(cast.row(castId(MASTER)).root).toHaveCount(1);
      });

      await test.step('marks knowledge characters KB and the narrator NARR, keeps them read-only and points to the knowledge to edit them', async () => {
        for (const name of KB_CAST) {
          const row = cast.row(castId(name));
          await expect(row.kb).toHaveText('KB');
          await expect(row.name).toBeDisabled();
          await expect(row.remove).toBeDisabled();
          await expect(row.remove).toHaveAttribute('title', DELETE_KB);
        }
        const narrator = cast.row(NARRATOR_ID);
        await expect(narrator.narrator).toHaveText('NARR');
        await expect(narrator.name).toBeDisabled();
        await expect(narrator.remove).toBeDisabled();
        await expect(narrator.remove).toHaveAttribute('title', DELETE_NARRATOR);
        await expect(cast.hint).toHaveText(CAST_HINT_KB);
      });

      await test.step('uses the knowledge of the translated text for a project bound to the translation', async () => {
        await openScripting(ui, VIET_PROJECT);
        await showCast(ui);
        await expect(cast.rows).toHaveCount(2);
        await expect(cast.row(castId(VI_HERO)).name).toHaveValue(VI_HERO);
        await expect(cast.row(castId(HERO)).root).toHaveCount(0);
      });
    });

    test('US-0154 adds, renames and deletes characters that are not in the knowledge', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const cast = scripting.cast;
      const audiobook = ui.main.audiobook;
      await generateDefault(ui, 1);
      await showCast(ui);

      await test.step('adds a trimmed character name from the add button or Enter', async () => {
        await cast.newName.fill(`  ${FISHER}  `);
        await cast.add.click();
        await expect(cast.rows).toHaveCount(KB_CAST.length + 2);
        await expect(cast.rowAt(KB_CAST.length + 1).name).toHaveValue(FISHER);
        await expect(cast.newName).toHaveValue('');
        await cast.newName.fill(TEA_WOMAN);
        await cast.newName.press('Enter');
        await expect(cast.rows).toHaveCount(KB_CAST.length + 3);
        await expect(cast.rowAt(KB_CAST.length + 2).name).toHaveValue(TEA_WOMAN);
      });

      await test.step('refuses a name that already exists regardless of case', async () => {
        await cast.newName.fill(FISHER.toLowerCase());
        await cast.add.click();
        await expect(ui.main.toast(CAST_DUPLICATE)).toBeVisible();
        await cast.newName.fill(HERO.toUpperCase());
        await cast.newName.press('Enter');
        await expect(cast.rows).toHaveCount(KB_CAST.length + 3);
      });

      await test.step('keeps the previous name when the new name is empty', async () => {
        const fisher = cast.rowAt(KB_CAST.length + 1);
        await fisher.name.fill('');
        await fisher.name.press('Tab');
        await expect(fisher.name).toHaveValue(FISHER);
      });

      await test.step('locks the delete button of a character used in a dialogue and tells it is in use', async () => {
        const fisher = cast.row(await castIdOf(ui, FISHER));
        await changeType(ui, scripting.block(0), TYPE_DIALOGUE);
        await assignSpeaker(ui, scripting.block(0), FISHER);
        await expect(fisher.used).toHaveText('1');
        await expect(fisher.remove).toBeDisabled();
        await expect(fisher.remove).toHaveAttribute('title', DELETE_USED);
      });

      await test.step('deletes an unused character from both Scripting and Audiobook', async () => {
        const teaId = await castIdOf(ui, TEA_WOMAN);
        await openAudiobook(ui, AUDIO_PROJECT);
        await audiobook.voicesView.click();
        await expect(audiobook.speakerName(teaId)).toHaveValue(TEA_WOMAN);
        await ui.main.project.moduleTab(AUDIO_ID, 'scripting').click();
        await showCast(ui);
        const tea = cast.row(teaId);
        await expect(tea.remove).toBeEnabled();
        await expect(tea.remove).toHaveAttribute('title', DELETE_FREE);
        await tea.remove.click();
        await expect(tea.root).toHaveCount(0);
        await expect(cast.rows).toHaveCount(KB_CAST.length + 2);
        await ui.main.project.moduleTab(AUDIO_ID, 'audiobook').click();
        await expect(audiobook.speakerName(teaId)).toHaveCount(0);
        await expect(audiobook.speakerName(await castIdOf(ui, FISHER))).toHaveCount(1);
      });
    });
  });
});
