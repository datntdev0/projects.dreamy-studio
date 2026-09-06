import type { MixField } from '../pages/audiobook.ts';
// prettier-ignore
import { addPause, assignVoice, castVoices, DEFAULT_MIX, exportSize, exportsOf, NARRATOR_VOICE, openAudiobookOf, openDraftedProject, regenerateSegment, reopenAudiobook, savedMix, showInspector, showMode, srtCueCount, startGeneration } from '../scripts/audiobook.ts';
import { expect, test } from '../scripts/backend.ts';
import type { Ui } from '../scripts/fixtures.ts';
// prettier-ignore
import { AUDIO_PROJECT, NARRATOR, NARRATOR_ID, openAudiobook } from '../scripts/scripting.ts';

const MIX_FIELDS: readonly MixField[] = ['gap', 'intro', 'outro', 'sentence', 'vol'];
const MIX_INPUTS: readonly (readonly [MixField, string, string])[] = [
  ['gap', '7', '5'],
  ['gap', '-1', '0'],
  ['gap', '1.2', '1.2'],
  ['intro', '12', '10'],
  ['intro', '2', '2'],
  ['outro', '11', '10'],
  ['outro', '0.5', '0.5'],
  ['sentence', '3', '2'],
  ['sentence', '0.4', '0.4'],
  ['vol', '9', '6'],
  ['vol', '-20', '-12'],
  ['vol', '-3', '-3'],
];
const CHANGED_MIX: Readonly<Record<MixField, number>> = {
  gap: 1.2,
  intro: 2,
  outro: 0.5,
  sentence: 0.4,
  vol: -3,
};
const EXPORT_TIMEOUT = { timeout: 90_000 };

async function expectMix(ui: Ui, mix: Readonly<Record<MixField, number>>): Promise<void> {
  for (const field of MIX_FIELDS) {
    await expect(ui.main.audiobook.chapter.mix(field)).toHaveValue(String(mix[field]));
  }
}

async function expectExported(ui: Ui, folder: string, count: number): Promise<[string, string]> {
  await expect.poll(() => exportsOf(folder, 'wav'), EXPORT_TIMEOUT).toHaveLength(count);
  await expect.poll(() => exportsOf(folder, 'srt'), EXPORT_TIMEOUT).toHaveLength(count);
  const wavs = await exportsOf(folder, 'wav');
  const srts = await exportsOf(folder, 'srt');
  const wav = wavs.at(-1) ?? '';
  const srt = srts.at(-1) ?? '';
  const toast = ui.main.toasts.filter({ hasText: 'Exported' }).last();
  await expect(toast).toContainText(wav);
  await expect(toast).toContainText(srt);
  expect(await exportSize(folder, wav)).toBeGreaterThan(44);
  return [wav, srt];
}

test.describe('CAP-08 Production Workflow', () => {
  test.describe('FEAT-61 Audiobook Chapter Assembly and Export', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo'] } });

    test('US-0170 adjusts the silences, the pause between sentences and the volume of the project', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox, [1, 2]);
      let book = ui.main.audiobook;
      let chapter = book.chapter;
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
      await regenerateSegment(ui, 0);
      await showInspector(ui);

      await test.step('shows the assembly settings without chapter details or export buttons', async () => {
        await expect(chapter.root).toBeVisible();
        await expect(chapter.details).toHaveCount(0);
        await expect(chapter.assembly).toBeVisible();
        await expect(book.root.getByTestId(/^ab-export-/)).toHaveCount(0);
      });

      await test.step('uses 0.6 seconds between segments, 0.8 at the start, 1.5 at the end, 0.3 between sentences and 0 dB by default', async () => {
        await expectMix(ui, DEFAULT_MIX);
      });

      await test.step('keeps every value in its range and saves the settings once for the whole project', async () => {
        for (const [field, typed, shown] of MIX_INPUTS) {
          await chapter.mix(field).fill(typed);
          await chapter.mix(field).blur();
          await expect(chapter.mix(field)).toHaveValue(shown);
        }
        await expect.poll(() => savedMix(folder)).toEqual(CHANGED_MIX);
        book = await reopenAudiobook(ui, app, picker, folder);
        chapter = book.chapter;
        await showInspector(ui);
        await book.unit(1).click();
        await expectMix(ui, CHANGED_MIX);
        await book.unit(2).click();
        await expectMix(ui, CHANGED_MIX);
      });

      await test.step('lists the problems of the chapter that need attention', async () => {
        await assignVoice(ui, NARRATOR_ID, null);
        await showMode(ui, 'prod');
        await showInspector(ui);
        await expect(chapter.blockers).toHaveText([`${NARRATOR} has no voice yet.`]);
      });
    });

    test('US-0171 exports the audio and the subtitles of the chosen chapters from the generate dialog', async ({
      ui,
      picker,
      sandbox,
    }) => {
      test.setTimeout(240_000);
      const { folder, voices } = await openDraftedProject(ui, picker, sandbox, [1, 2]);
      const book = ui.main.audiobook;
      const dialog = book.generateDialog;
      await addPause(ui, 0, '0.8');
      await openAudiobook(ui, AUDIO_PROJECT);
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });

      await test.step('generates the chapter then writes one WAV and one SRT with a cue per sentence into the project and tells their paths', async () => {
        await startGeneration(ui, true);
        const [, srt] = await expectExported(ui, folder, 1);
        expect(await srtCueCount(folder, srt)).toBeGreaterThanOrEqual(4);
      });

      await test.step('exports every selected chapter combined into one WAV and one SRT once they are generated', async () => {
        await book.generateAll.click();
        await dialog.selectAll.check();
        await expect(dialog.chapters).toHaveCount(2);
        await expect(dialog.go).toHaveText(/Generate \d+ segments/);
        await dialog.exportAfter.check();
        await dialog.go.click();
        await expect(dialog.panel).toBeHidden();
        const [, srt] = await expectExported(ui, folder, 2);
        expect(await srtCueCount(folder, srt)).toBeGreaterThanOrEqual(8);
      });

      await test.step('offers export alone when every segment of the chosen chapters is already generated', async () => {
        await book.generateAll.click();
        await expect(dialog.nothing).toBeVisible();
        await expect(dialog.go).toBeDisabled();
        await dialog.exportAfter.check();
        await expect(dialog.go).toHaveText('Export');
        await dialog.go.click();
        await expect(dialog.panel).toBeHidden();
        await expect.poll(() => exportsOf(folder, 'wav'), EXPORT_TIMEOUT).toHaveLength(2);
      });
    });
  });
});
