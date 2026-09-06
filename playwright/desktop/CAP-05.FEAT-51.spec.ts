import { expect, test } from '../scripts/backend.ts';
import { IpcSpy } from '../scripts/settings.ts';
// prettier-ignore
import { DUPLICATED_TOAST, FAILED_TOAST, hasReference, openVoices, readVoices, type SeedVoice, UPDATED_TOAST, VOICE_SAMPLE_VI } from '../scripts/voices.ts';

const UPDATE_COMMAND = 'library_voice_update';

const VOICES: readonly SeedVoice[] = [
  {
    name: 'Narrator An',
    description: 'Warm bedtime narrator',
    preset: 'Mai Anh',
    createdAt: '2026-03-01T08:00:00Z',
  },
  {
    name: 'Old sage',
    engine: 'omnivoice',
    source: 'design',
    gender: 'male',
    prompt: 'male, elderly, low pitch',
    createdAt: '2026-02-01T08:00:00Z',
  },
  {
    name: 'Grandma',
    source: 'clone',
    referenceKind: 'sound',
    referenceName: 'Grandma story',
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    name: 'My take',
    source: 'clone',
    referenceKind: 'file',
    referenceName: 'take.wav',
    createdAt: '2026-01-01T08:00:00Z',
  },
];

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-51 Voice Information Management', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo', 'omnivoice'] } });

    test('US-0139 shows the voice details and saves edits of the sample text and description', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      const { folder } = await openVoices(ui, picker, sandbox, VOICES);
      const list = ui.main.library.voices;
      const panel = ui.main.library.voicePanel;

      await test.step('asks to choose a voice while none is selected', async () => {
        await expect(app.page.getByTestId('inspector-voices-empty')).toHaveText(
          'Choose a voice to see its properties.',
        );
      });

      await test.step('shows engine, source with its detail, language, gender, dates and sample text without a play button', async () => {
        await list.row('Narrator An').name.click();
        await expect(panel.name).toHaveValue('Narrator An');
        await expect(panel.engine).toHaveText('VieNeu-TTS v3 Turbo');
        await expect(panel.sourceName).toHaveText('Preset');
        await expect(panel.sourceDetail).toHaveText('Mai Anh');
        await expect(panel.language).toHaveText('Vietnamese');
        await expect(panel.gender).toHaveText('Female');
        await expect(panel.root.getByTestId('library-voice-panel-created')).toHaveText(
          '2026-03-01 08:00',
        );
        await expect(panel.root.getByTestId('library-voice-panel-updated')).toHaveText(
          '2026-03-01 08:00',
        );
        await expect(panel.sampleText).toHaveValue(VOICE_SAMPLE_VI);
        await expect(panel.playButtons).toHaveCount(0);
        await list.row('Old sage').name.click();
        await expect(panel.sourceDetail).toHaveText('male, elderly, low pitch');
        await list.row('Grandma').name.click();
        await expect(panel.sourceDetail).toHaveText('Grandma story');
      });

      await test.step('saves the sample text and description when leaving the field and confirms the update', async () => {
        await list.row('Narrator An').name.click();
        await panel.sampleText.fill('Ngày xửa ngày xưa có một cô bé.');
        await panel.description.click();
        await expect(ui.main.toast(UPDATED_TOAST)).toBeVisible();
        await panel.description.fill('Calm narrator');
        await panel.sampleText.click();
        await expect
          .poll(() => readVoices(folder)[0])
          .toMatchObject({
            sampleText: 'Ngày xửa ngày xưa có một cô bé.',
            description: 'Calm narrator',
          });
        await expect(list.row('Narrator An').description).toHaveText('Calm narrator');
      });

      await test.step('tags the voice and changes its usage rights like other library resources', async () => {
        await panel.tagInput.fill('warm');
        await panel.tagInput.press('Enter');
        await expect(panel.tags).toHaveText(['warm']);
        await panel.rights.selectOption('licensed');
        await expect.poll(() => readVoices(folder)[0].rights).toBe('licensed');
        await expect(panel.collection).toHaveValue('');
      });

      await test.step('reports a failed save', async () => {
        const spy = new IpcSpy(() => app.page);
        await spy.install();
        await spy.mode(UPDATE_COMMAND, 'fail');
        await panel.description.fill('Will not save');
        await panel.sampleText.click();
        await expect(ui.main.toast(FAILED_TOAST)).toBeVisible();
        expect(readVoices(folder)[0].description).toBe('Calm narrator');
        await spy.mode(UPDATE_COMMAND, 'pass');
      });

      await test.step('renames the voice from the name field and keeps an empty name unchanged', async () => {
        await list.row('Narrator An').name.click();
        await panel.name.fill('Narrator Bình');
        await panel.name.press('Enter');
        await expect(list.row('Narrator Bình').name).toBeVisible();
        await expect.poll(() => readVoices(folder)[0].name).toBe('Narrator Bình');
        await panel.name.fill('  ');
        await panel.name.press('Enter');
        await expect(panel.name).toHaveValue('Narrator Bình');
      });

      await test.step('keeps engine, source, language and gender read-only and suggests creating a new voice instead', async () => {
        for (const field of [panel.engine, panel.sourceName, panel.language, panel.gender]) {
          await expect(field.locator('input, select, textarea')).toHaveCount(0);
        }
        await expect(panel.immutableHint).toHaveText(
          "A voice's engine and source cannot be changed after it is created. Create a new voice to use different settings.",
        );
      });
    });

    test('US-0140 duplicates a voice with a copy suffix and keeps only library reference audio', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, voices } = await openVoices(ui, picker, sandbox, VOICES);
      const list = ui.main.library.voices;
      const panel = ui.main.library.voicePanel;

      await test.step('creates a selected copy with the copy suffix and the same settings and confirms it', async () => {
        await list.row('Old sage').name.click();
        await panel.duplicate.click();
        await expect(ui.main.toast(DUPLICATED_TOAST)).toBeVisible();
        await expect(panel.name).toHaveValue('Old sage copy');
        await expect(list.row('Old sage copy').root).toHaveCount(1);
        const copy = readVoices(folder).find((voice) => voice.name === 'Old sage copy');
        expect(copy).toMatchObject({
          engine: 'omnivoice',
          source: 'design',
          gender: 'male',
          prompt: 'male, elderly, low pitch',
        });
      });

      await test.step('drops the reference of a voice cloned from an uploaded file and keeps a library reference', async () => {
        await list.row('My take').name.click();
        await panel.duplicate.click();
        await expect(panel.name).toHaveValue('My take copy');
        await list.row('Grandma').name.click();
        await panel.duplicate.click();
        await expect(panel.name).toHaveValue('Grandma copy');
        const rows = readVoices(folder);
        const takeCopy = rows.find((voice) => voice.name === 'My take copy');
        const grandmaCopy = rows.find((voice) => voice.name === 'Grandma copy');
        expect(takeCopy).toMatchObject({ referenceKind: null, referenceName: '' });
        expect(hasReference(folder, takeCopy?.id ?? 0)).toBe(false);
        expect(grandmaCopy).toMatchObject({
          referenceKind: 'sound',
          referenceName: 'Grandma story',
        });
        expect(hasReference(folder, grandmaCopy?.id ?? 0)).toBe(true);
        expect(hasReference(folder, voices['My take'])).toBe(true);
      });
    });
  });
});
