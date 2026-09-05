import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { AUDIO_PROJECT, BLANK_PROJECT, CHAPTERS, DEFAULT_CREATED, dragBy, generateDefault, LOOSE_PROJECT, NO_SCRIPT, NOT_DRAFTED, openAudiobook, openScripting, openScriptingOf, paragraphsOf, PICK_TITLE, PRESET_AUDIOBOOK, PRESET_BADGE, PRESET_FILM, RAIL_MAX, RAIL_MIN, railMeta, railWidth, RESET_ALL, RESET_INTRO, RESET_WARNING, SCRATCH_ONLY, SINGLE_PROJECT, startWriting, statsFor, TYPE_HEADING, TYPE_NARRATION, UNNAMED, VI_SECOND_TITLE, VI_TITLE, VIET_PROJECT } from '../scripts/scripting.ts';

const EDITED = 'Lin Feng waited at the gate.';

test.describe('CAP-07 Pre-Production', () => {
  test.describe('FEAT-54 Audiobook Script Drafting', () => {
    test('US-0144 splits the script by the chapters of the novel or asks for the product type of a blank project', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;

      await test.step('shows the back button, the Scripting title and the AUDIOBOOK label in the top bar', async () => {
        await expect(scripting.back).toHaveText(AUDIO_PROJECT);
        await expect(scripting.title).toContainText('Scripting');
        await expect(scripting.preset).toHaveText(PRESET_BADGE);
      });

      await test.step('creates one entry per chapter in the range with its number and its original title', async () => {
        await expect(scripting.units).toHaveCount(CHAPTERS.length);
        for (const [index, chapter] of CHAPTERS.entries()) {
          const unit = scripting.unit(index + 1);
          await expect(unit).toContainText(String(index + 1).padStart(2, '0'));
          await expect(unit).toContainText(chapter.title);
        }
      });

      await test.step('takes the chapter titles from the translation of a project bound to the translated text', async () => {
        await openScripting(ui, VIET_PROJECT);
        await expect(scripting.units).toHaveCount(2);
        await expect(scripting.unit(1)).toContainText(VI_TITLE);
        await expect(scripting.unit(2)).toContainText(VI_SECOND_TITLE);
      });

      await test.step('creates one unnamed chapter for an audiobook project without a novel', async () => {
        await openScripting(ui, LOOSE_PROJECT);
        await expect(scripting.units).toHaveCount(1);
        await scripting.start.click();
        await expect(scripting.sheetTitle).toHaveText(UNNAMED);
      });

      await test.step('asks a blank project which product to script and offers an audiobook or a film script', async () => {
        await openScripting(ui, BLANK_PROJECT);
        await expect(scripting.picker).toContainText(PICK_TITLE);
        await expect(scripting.presets).toHaveCount(2);
        await expect(scripting.presetOption('audiobook')).toContainText(PRESET_AUDIOBOOK);
        await expect(scripting.presetOption('film')).toContainText(PRESET_FILM);
        await scripting.presetOption('audiobook').click();
        await expect(scripting.picker).toBeHidden();
        await expect(scripting.preset).toHaveText(PRESET_BADGE);
      });
    });

    test('US-0145 lists the chapters with their progress and opens the chosen chapter', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const first = paragraphsOf(1);

      await test.step('shows the scripted chapters over all chapters with a progress bar and each chapter with number, title and blocks, words or not drafted', async () => {
        await expect(scripting.railCount).toHaveText('0/4 done');
        await expect(scripting.railProgress).toHaveAttribute('style', /width: 0%/);
        await generateDefault(ui, 1);
        await expect(scripting.railCount).toHaveText('1/4 done');
        await expect(scripting.railProgress).toHaveAttribute('style', /width: 25%/);
        await expect(scripting.unit(1)).toContainText('01');
        await expect(scripting.unit(1)).toContainText(CHAPTERS[0]?.title ?? '');
        await expect(scripting.unit(1)).toContainText(railMeta(first));
        await expect(scripting.unit(2)).toContainText(NOT_DRAFTED);
      });

      await test.step('shows the block count, word count and estimated reading time of the open chapter', async () => {
        await expect(scripting.stats).toHaveText(statsFor(first));
      });

      await test.step('opens a chapter on click, Enter or Space', async () => {
        await scripting.unit(2).click();
        await expect(scripting.unit(2)).toHaveAttribute('aria-selected', 'true');
        await expect(scripting.unitTitle).toHaveText(CHAPTERS[1]?.title ?? '');
        await scripting.unit(3).focus();
        await scripting.unit(3).press('Enter');
        await expect(scripting.unitTitle).toHaveText(CHAPTERS[2]?.title ?? '');
        await scripting.unit(1).focus();
        await scripting.unit(1).press('Space');
        await expect(scripting.unit(1)).toHaveAttribute('aria-selected', 'true');
        await expect(scripting.unitTitle).toHaveText(CHAPTERS[0]?.title ?? '');
      });

      await test.step('resizes the chapter list between 180 and 420 px and shares the width with Audiobook', async () => {
        await dragBy(ui.main.scripting.rail.page(), scripting.railResizer, 600);
        await expect.poll(() => railWidth(scripting.rail)).toBe(RAIL_MAX);
        await dragBy(ui.main.scripting.rail.page(), scripting.railResizer, -600);
        await expect.poll(() => railWidth(scripting.rail)).toBe(RAIL_MIN);
        await openAudiobook(ui, AUDIO_PROJECT);
        await expect.poll(() => railWidth(ui.main.audiobook.rail)).toBe(RAIL_MIN);
      });
    });

    test('US-0146 creates the default script from the source paragraphs or starts from scratch', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const first = paragraphsOf(1);

      await test.step('tells that a chapter with source text has no script and offers to generate it or start writing', async () => {
        await expect(scripting.empty).toContainText(NO_SCRIPT);
        await expect(scripting.generate).toBeVisible();
        await expect(scripting.start).toBeVisible();
      });

      await test.step('turns each source paragraph into exactly one narration block and confirms the default script', async () => {
        await scripting.generate.click();
        await expect(ui.main.toast(DEFAULT_CREATED)).toBeVisible();
        await expect(scripting.texts).toHaveText([...first]);
        await expect(scripting.types).toHaveText(first.map(() => TYPE_NARRATION));
      });

      await test.step('starts writing with one selected title block', async () => {
        await startWriting(ui, 2);
        await expect(scripting.block(0).type).toHaveText(TYPE_HEADING);
        await expect(scripting.block(0).root).toHaveClass(/is-sel/);
        await expect(scripting.block(0).text).toBeFocused();
      });

      await test.step('only offers to start writing for a chapter without source text', async () => {
        await scripting.unit(4).click();
        await expect(scripting.empty).toContainText(SCRATCH_ONLY);
        await expect(scripting.generate).toHaveCount(0);
        await expect(scripting.start).toBeVisible();
      });
    });

    test('US-0147 resets the open chapter or every chapter with a source to the default script', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingOf(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const dialog = scripting.reset;
      const first = paragraphsOf(1);
      await generateDefault(ui, 1);
      await scripting.unit(2).click();
      await scripting.unit(3).click();
      await scripting.unit(1).click();
      await scripting.block(0).text.fill(EDITED);

      await test.step('explains the default and offers the open chapter or every chapter with source text', async () => {
        await scripting.resetButton.click();
        await expect(dialog.panel).toBeVisible();
        await expect(dialog.intro).toHaveText(RESET_INTRO);
        await expect(dialog.unitLabel).toContainText('Chapter 1 is open');
        await expect(dialog.unitLabel).toContainText(`${first.length} blocks currently`);
        await expect(dialog.allLabel).toContainText(RESET_ALL);
        await expect(dialog.allLabel).toContainText('3 chapters');
        await expect(dialog.allScope).toBeEnabled();
      });

      await test.step('warns that every edit in the scope is lost and audio of unchanged blocks is kept', async () => {
        await expect(dialog.warning).toHaveText(RESET_WARNING);
      });

      await test.step('keeps the script when cancelled', async () => {
        await dialog.cancel.click();
        await expect(dialog.panel).toBeHidden();
        await expect(scripting.block(0).text).toHaveText(EDITED);
      });

      await test.step('regenerates every chapter in the scope and reports how many were reset', async () => {
        await scripting.resetButton.click();
        await dialog.allScope.check();
        await dialog.confirm.click();
        await expect(dialog.panel).toBeHidden();
        await expect(ui.main.toast('Reset 3 chapters to default.')).toBeVisible();
        await expect(scripting.texts).toHaveText([...first]);
        await expect(scripting.railCount).toHaveText('3/4 done');
      });

      await test.step('locks the every chapter option when fewer than two chapters can be reset', async () => {
        await openScripting(ui, SINGLE_PROJECT);
        await scripting.unit(2).click();
        await scripting.unit(1).click();
        await scripting.generate.click();
        await expect(scripting.blocks).toHaveCount(paragraphsOf(3).length);
        await scripting.resetButton.click();
        await expect(dialog.allScope).toBeDisabled();
        await expect(dialog.unitScope).toBeChecked();
        await dialog.confirm.click();
        await expect(ui.main.toast('Reset 1 chapter to default.')).toBeVisible();
      });
    });
  });
});
