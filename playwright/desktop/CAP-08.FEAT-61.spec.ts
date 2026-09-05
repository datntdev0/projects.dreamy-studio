import type { MixField } from '../pages/audiobook.ts';
// prettier-ignore
import { addPause, assignVoice, castVoices, DEFAULT_MIX, EXPORT_HINT, exportSize, exportsOf, generateChapter, NARRATOR_VOICE, openAudiobookOf, openDraftedProject, readUnitAudio, recordedSeconds, regenerateSegment, reopenAudiobook, savedMix, showInspector, showMode, srtCueCount, switchModule } from '../scripts/audiobook.ts';
import { expect, test } from '../scripts/backend.ts';
import type { Ui } from '../scripts/fixtures.ts';
// prettier-ignore
import { AUDIO_PROJECT, durationText, NARRATOR, NARRATOR_ID, openAudiobook } from '../scripts/scripting.ts';

const MIX_FIELDS: readonly MixField[] = ['gap', 'intro', 'outro', 'vol'];
const MIX_INPUTS: readonly (readonly [MixField, string, string])[] = [
  ['gap', '7', '5'],
  ['gap', '-1', '0'],
  ['gap', '1.2', '1.2'],
  ['intro', '12', '10'],
  ['intro', '2', '2'],
  ['outro', '11', '10'],
  ['outro', '0.5', '0.5'],
  ['vol', '9', '6'],
  ['vol', '-20', '-12'],
  ['vol', '-3', '-3'],
];
const CHANGED_MIX: Readonly<Record<MixField, number>> = { gap: 1.2, intro: 2, outro: 0.5, vol: -3 };

async function expectMix(ui: Ui, mix: Readonly<Record<MixField, number>>): Promise<void> {
  for (const field of MIX_FIELDS) {
    await expect(ui.main.audiobook.chapter.mix(field)).toHaveValue(String(mix[field]));
  }
}

async function exportFile(ui: Ui, folder: string, format: 'wav' | 'srt'): Promise<string> {
  await ui.main.audiobook.chapter.exportAs(format).click();
  await expect.poll(() => exportsOf(folder, format)).toHaveLength(1);
  const [name = ''] = await exportsOf(folder, format);
  await expect(ui.main.toasts.filter({ hasText: 'Exported to' }).last()).toContainText(name);
  expect(await exportSize(folder, name)).toBeGreaterThan(0);
  return name;
}

test.describe('CAP-08 Production Workflow', () => {
  test.describe('FEAT-61 Audiobook Chapter Assembly and Export', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo'] } });

    test('US-0170 adjusts the silences and the volume of a chapter', async ({
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

      await test.step('shows the chapter, segments, generated, needing attention, audio duration and the assembly settings', async () => {
        const seconds = recordedSeconds(await readUnitAudio(folder, 1));
        await expect(chapter.name).toHaveText('Chapter 1 · The Arrival');
        await expect(chapter.total).toHaveText('4');
        await expect(chapter.generated).toHaveText('1/4');
        await expect(chapter.attention).toHaveText('3');
        await expect(chapter.duration).toHaveText(`≈ ${durationText(seconds)}`);
        await expect(chapter.assembly).toBeVisible();
      });

      await test.step('keeps the pause between segments from 0 to 5 seconds, the start and end silences from 0 to 10 seconds and the volume from -12 to +6 dB and saves them for the chapter', async () => {
        for (const [field, typed, shown] of MIX_INPUTS) {
          await chapter.mix(field).fill(typed);
          await chapter.mix(field).blur();
          await expect(chapter.mix(field)).toHaveValue(shown);
        }
        await expect.poll(() => savedMix(folder, 1)).toEqual(CHANGED_MIX);
        book = await reopenAudiobook(ui, app, picker, folder);
        chapter = book.chapter;
        await showInspector(ui);
        await book.unit(1).click();
        await expectMix(ui, CHANGED_MIX);
      });

      await test.step('uses 0.6 seconds between segments, 0.8 at the start, 1.5 at the end and 0 dB for a chapter not adjusted yet', async () => {
        await book.unit(2).click();
        await expectMix(ui, DEFAULT_MIX);
      });

      await test.step('lists the problems of the chapter that need attention', async () => {
        await assignVoice(ui, NARRATOR_ID, null);
        await showMode(ui, 'prod');
        await showInspector(ui);
        await expect(chapter.blockers).toHaveText([`${NARRATOR} has no voice yet.`]);
      });
    });

    test('US-0171 exports the audio and the subtitles of a chapter', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, voices } = await openDraftedProject(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const chapter = ui.main.audiobook.chapter;
      await addPause(ui, 0, '0.8');
      await openAudiobook(ui, AUDIO_PROJECT);
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
      await generateChapter(ui);
      await showInspector(ui);

      await test.step('exports the WAV or SRT file of a chapter whose segments are all generated and tells the exported path', async () => {
        await expect(chapter.exportHint).toBeHidden();
        const wav = await exportFile(ui, folder, 'wav');
        expect(await exportSize(folder, wav)).toBeGreaterThan(44);
        const srt = await exportFile(ui, folder, 'srt');
        expect(await srtCueCount(folder, srt)).toBe(4);
      });

      await test.step('locks the export with a reminder to generate every segment while a segment is not generated, changed or failed', async () => {
        await switchModule(ui, 'scripting');
        await scripting.block(2).text.fill('Lin Feng waited at the gate.');
        await switchModule(ui, 'audiobook');
        await showInspector(ui);
        await expect(chapter.exportAs('wav')).toBeDisabled();
        await expect(chapter.exportAs('srt')).toBeDisabled();
        await expect(chapter.exportHint).toHaveText(EXPORT_HINT);
      });
    });
  });
});
