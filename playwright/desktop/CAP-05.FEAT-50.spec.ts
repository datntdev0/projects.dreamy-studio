import { expect, test } from '../scripts/backend.ts';
import type { Ui } from '../scripts/fixtures.ts';
import { queuePick, sampleSoundBytes, stageRealAsset } from '../scripts/library.ts';
import { IpcSpy } from '../scripts/settings.ts';
// prettier-ignore
import { FAILED_TOAST, hasReference, MIC_DENIED, openVoices, readVoices, useMicrophone } from '../scripts/voices.ts';

const CREATE_COMMAND = 'library_voice_create';

async function openDialog(ui: Ui): Promise<void> {
  await ui.main.library.voices.create.click();
  await expect(ui.main.library.voiceDialog.root).toBeVisible();
}

async function chooseClone(ui: Ui, way: string): Promise<void> {
  const dialog = ui.main.library.voiceDialog;
  await dialog.sourceOption('Clone').click();
  await dialog.referenceOption(way).click();
}

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-50 Voice Creation', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo', 'omnivoice'] } });

    test('US-0134 creates a voice from a preset voice of the selected engine', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      const { folder } = await openVoices(ui, picker, sandbox);
      const dialog = ui.main.library.voiceDialog;
      await openDialog(ui);

      await test.step('shows name, engine, description and source with preset and the first ready engine by default, hiding language and gender for presets', async () => {
        for (const field of [dialog.name, dialog.engine, dialog.description, dialog.source]) {
          await expect(field).toBeVisible();
        }
        await expect(dialog.language).toBeHidden();
        await expect(dialog.gender).toBeHidden();
        await expect(dialog.engine).toHaveValue('vieneu-turbo');
        await expect(dialog.sourceOption('Preset')).toHaveAttribute('aria-pressed', 'true');
        await expect(dialog.presetPick('Kim Thanh')).toHaveAttribute('aria-checked', 'true');
      });

      await test.step('offers the preset voices of the engine with their gender, region and style', async () => {
        await expect(dialog.presetOptions).toHaveCount(25);
        await expect(dialog.presetMeta('Mai Anh')).toHaveText('Female · Northern · News');
        await expect(dialog.presetPlay('Mai Anh')).toHaveAttribute(
          'aria-label',
          'Listen to Mai Anh',
        );
        await dialog.presetPick('Hải Đăng').click();
        await dialog.engine.selectOption('omnivoice');
        await expect(dialog.presetOptions).toHaveCount(7);
        await dialog.engine.selectOption('vieneu-turbo');
      });

      await test.step('locks the create button while the name is empty or only spaces', async () => {
        await expect(dialog.submit).toBeDisabled();
        await dialog.name.fill('   ');
        await expect(dialog.submit).toBeDisabled();
      });

      await test.step('keeps the dialog and the entered values when creating fails', async () => {
        const spy = new IpcSpy(() => app.page);
        await spy.install();
        await spy.mode(CREATE_COMMAND, 'fail');
        await dialog.name.fill('Narrator An');
        await dialog.submit.click();
        await expect(ui.main.toast(FAILED_TOAST)).toBeVisible();
        await expect(dialog.root).toBeVisible();
        await expect(dialog.name).toHaveValue('Narrator An');
        await spy.mode(CREATE_COMMAND, 'pass');
      });

      await test.step('adds the new voice at the top of the list, selects it and closes the dialog', async () => {
        await dialog.submit.click();
        await expect(dialog.root).toBeHidden();
        await expect(ui.main.library.voices.names.first()).toHaveText('Narrator An');
        await expect(ui.main.library.voicePanel.name).toHaveText('Narrator An');
        expect(readVoices(folder)).toMatchObject([
          {
            name: 'Narrator An',
            engine: 'vieneu-turbo',
            source: 'preset',
            preset: 'Hải Đăng',
            gender: 'male',
            language: 'vi',
          },
        ]);
      });
    });

    test('US-0135 chooses a local or cloud engine and locks sources the engine cannot use', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openVoices(ui, picker, sandbox);
      const dialog = ui.main.library.voiceDialog;
      await openDialog(ui);

      await test.step('groups engines into local and cloud and locks engines that are not installed or connected', async () => {
        const groups = dialog.engine.locator('optgroup');
        await expect(groups).toHaveCount(2);
        await expect(groups.nth(0)).toHaveAttribute('label', 'Local');
        await expect(groups.nth(1)).toHaveAttribute('label', 'Cloud');
        const nano = dialog.engine.locator('option[value="vieneu-nano"]');
        await expect(nano).toBeDisabled();
        await expect(nano).toHaveText('VieNeu-TTS v3 Nano (not installed)');
        await expect(dialog.engine.locator('option[value="elevenlabs"]')).toHaveText(
          'ElevenLabs (not connected)',
        );
      });

      await test.step('locks clone and design for a preset-only engine and restores the source for another engine', async () => {
        await dialog.engine.selectOption('omnivoice');
        await dialog.sourceOption('Design').click();
        await dialog.engine.selectOption('edge-read-aloud');
        await expect(dialog.sourceOption('Clone')).toBeDisabled();
        await expect(dialog.sourceOption('Design')).toBeDisabled();
        await expect(dialog.sourceOption('Preset')).toHaveAttribute('aria-pressed', 'true');
        await expect(dialog.presetOptions).toHaveCount(2);
        await expect(dialog.presetMeta('Hoài My')).toHaveText('Female · Northern · Natural');
        await expect(dialog.presetMeta('Nam Minh')).toHaveText('Male · Northern · Natural');
        await dialog.engine.selectOption('omnivoice');
        await expect(dialog.sourceOption('Design')).toHaveAttribute('aria-pressed', 'true');
        await expect(dialog.prompt).toBeVisible();
      });
    });

    test('US-0136 clones a voice from library audio or an uploaded file after confirming the right to use it', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const bytes = await sampleSoundBytes(sandbox, 'seed.wav', 6);
      const { folder, ids } = await openVoices(ui, picker, sandbox, [], {
        sounds: [{ name: 'Grandma story', ext: 'wav', bytes, durationMs: 6_000 }],
      });
      const dialog = ui.main.library.voiceDialog;
      await openDialog(ui);
      await dialog.name.fill('Grandma');

      await test.step('offers library audio, upload and recording with guidance to use 5 to 30 seconds of one speaker', async () => {
        await dialog.sourceOption('Clone').click();
        await expect(dialog.reference.getByRole('button')).toHaveText([
          'From library',
          'Upload file',
          'Record',
        ]);
        await expect(dialog.root).toContainText(
          'Use 5–30 seconds of clean speech from one speaker.',
        );
      });

      await test.step('lists library audio with its duration', async () => {
        await chooseClone(ui, 'From library');
        await expect(dialog.sound.locator('option[value]:not([value=""])')).toHaveText([
          'Grandma story · 0:06',
        ]);
      });

      await test.step('locks creation until the right to use the voice is confirmed', async () => {
        await dialog.sound.selectOption(String(ids.sounds['Grandma story']));
        await expect(dialog.submit).toBeDisabled();
        await dialog.consent.check();
        await expect(dialog.submit).toBeEnabled();
      });

      await test.step('creates the cloned voice and records its reference audio', async () => {
        await dialog.submit.click();
        await expect(dialog.root).toBeHidden();
        const [voice] = readVoices(folder);
        expect(voice).toMatchObject({
          name: 'Grandma',
          source: 'clone',
          referenceKind: 'sound',
          referenceSoundId: ids.sounds['Grandma story'],
          referenceName: 'Grandma story',
        });
        expect(hasReference(folder, voice.id)).toBe(true);
      });

      await test.step('shows an uploaded file with its name, size and remove button without adding it to the sound library', async () => {
        const path = await stageRealAsset(sandbox, 'sound', 'my take.wav');
        await openDialog(ui);
        await dialog.name.fill('Upload');
        await chooseClone(ui, 'Upload file');
        await queuePick(picker, 'sound', [path]);
        await dialog.chooseFile.click();
        await expect(dialog.fileName).toHaveText('my take.wav');
        await expect(dialog.root.getByTestId('library-voice-dialog-file-size')).toBeVisible();
        await expect(dialog.root.getByTestId('library-voice-dialog-file-remove')).toBeVisible();
        await dialog.consent.check();
        await dialog.submit.click();
        await expect(dialog.root).toBeHidden();
        expect(readVoices(folder).map((voice) => voice.referenceKind)).toEqual(['sound', 'file']);
        await ui.main.library.explorer.row('sound').click();
        await expect(ui.main.library.sounds.cards).toHaveCount(1);
      });
    });

    test('US-0137 records a reference with the microphone for up to 30 seconds', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      const { folder } = await openVoices(ui, picker, sandbox);
      const dialog = ui.main.library.voiceDialog;
      const recorder = dialog.root.getByTestId('library-voice-dialog-recorder');

      await test.step('reports a denied or missing microphone', async () => {
        for (const mode of ['denied', 'missing'] as const) {
          await useMicrophone(app.page, mode);
          await openDialog(ui);
          await chooseClone(ui, 'Record');
          await recorder.getByTestId('library-voice-dialog-record-start').click();
          await expect(dialog.root.getByTestId('library-voice-dialog-record-error')).toHaveText(
            MIC_DENIED,
          );
          await dialog.cancel.click();
        }
      });

      await test.step('shows recording state with elapsed time of 30 seconds and a stop button, then stops by itself at 30 seconds', async () => {
        await useMicrophone(app.page, 'ok');
        await openDialog(ui);
        await dialog.name.fill('Recorded');
        await chooseClone(ui, 'Record');
        await recorder.getByTestId('library-voice-dialog-record-start').click();
        await expect(recorder.getByTestId('library-voice-dialog-record-live')).toBeVisible();
        await expect(recorder.getByTestId('library-voice-dialog-record-limit')).toContainText(
          '0:30',
        );
        await expect(recorder.getByTestId('library-voice-dialog-record-stop')).toBeVisible();
        await expect(recorder.getByTestId('library-voice-dialog-record-duration')).toBeVisible({
          timeout: 40_000,
        });
      });

      await test.step('plays back the recording with its duration and offers to record again or discard', async () => {
        await expect(recorder.getByTestId('library-voice-dialog-record-duration')).toContainText(
          '0:30',
        );
        await expect(recorder.getByTestId('library-voice-dialog-record-play')).toBeVisible();
        await expect(recorder.getByTestId('library-voice-dialog-record-again')).toBeVisible();
        await expect(recorder.getByTestId('library-voice-dialog-record-discard')).toBeVisible();
      });

      await test.step('creates the voice from the recording', async () => {
        await dialog.consent.check();
        await dialog.submit.click();
        await expect(dialog.root).toBeHidden();
        const [voice] = readVoices(folder);
        expect(voice).toMatchObject({ name: 'Recorded', referenceKind: 'recording' });
        expect(hasReference(folder, voice.id)).toBe(true);
      });

      await test.step('drops an unsaved recording when the source changes or the dialog closes', async () => {
        await openDialog(ui);
        await chooseClone(ui, 'Record');
        await recorder.getByTestId('library-voice-dialog-record-start').click();
        await recorder.getByTestId('library-voice-dialog-record-stop').click();
        await expect(recorder.getByTestId('library-voice-dialog-record-duration')).toBeVisible();
        await dialog.sourceOption('Preset').click();
        await chooseClone(ui, 'Record');
        await expect(recorder.getByTestId('library-voice-dialog-record-duration')).toHaveCount(0);
        await expect(recorder.getByTestId('library-voice-dialog-record-start')).toBeVisible();
        await dialog.cancel.click();
      });
    });

    test('US-0138 designs a voice from a description of its traits', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder } = await openVoices(ui, picker, sandbox);
      const dialog = ui.main.library.voiceDialog;
      await openDialog(ui);
      await dialog.engine.selectOption('omnivoice');
      await dialog.sourceOption('Design').click();

      await test.step('shows the voice description field with an example', async () => {
        await expect(dialog.prompt).toHaveAttribute(
          'placeholder',
          'female, middle-aged, low pitch',
        );
        await expect(dialog.promptHint).toBeVisible();
      });

      await test.step('locks creation while the description is empty', async () => {
        await dialog.name.fill('Old sage');
        await expect(dialog.submit).toBeDisabled();
        await dialog.prompt.fill('   ');
        await expect(dialog.submit).toBeDisabled();
      });

      await test.step('creates the designed voice and stores the description', async () => {
        await dialog.prompt.fill('male, elderly, low pitch');
        await dialog.submit.click();
        await expect(dialog.root).toBeHidden();
        expect(readVoices(folder)).toMatchObject([
          {
            name: 'Old sage',
            engine: 'omnivoice',
            source: 'design',
            prompt: 'male, elderly, low pitch',
          },
        ]);
      });
    });
  });
});
