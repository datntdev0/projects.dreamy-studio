// prettier-ignore
import { assignVoice, BACKEND_REASON, castVoices, CLOUD_ISSUE, CLOUD_VOICE, DELETE_IN_USE, DELETE_KB, DELETE_NARRATOR, EDGE_VOICE, expectEveryState, generateChapter, GROUP_CLOUD, GROUP_LOCAL, HERO_VOICE, MODEL_ISSUE, NANO_VOICE, NARRATOR_VOICE, openAudiobookOf, orphanDialogues, PREVIEW_FAILED, PREVIEW_FALLBACK, QUIET_VOICE, readAudiobook, REASON_SPEED, REASON_VOICE, reopenAudiobook, savedVoiceOf, setSpeed, showInspector, showMode, SPEAKER_DUPLICATE, speakerIdOf, STATE_STALE, STATUS_MODEL_REQUIRED, STATUS_NO_VOICE, STATUS_NOT_CONNECTED, STATUS_READY, STATUS_UNUSED, stopBackend, switchModule } from '../scripts/audiobook.ts';
import { expect, test } from '../scripts/backend.ts';
import type { Ui } from '../scripts/fixtures.ts';
// prettier-ignore
import { assignSpeaker, castId, castIdOf, changeType, HEALER, HERO, NARRATOR, NARRATOR_ID, showCast, trackSaves, TYPE_DIALOGUE, waitForSaves } from '../scripts/scripting.ts';
import { closeSettings, IpcSpy } from '../scripts/settings.ts';
import { VOICE_SAMPLE_VI } from '../scripts/voices.ts';

const PREVIEW_COMMAND = 'audiobook_voice_preview';
const OLD_WANG = 'Old Wang';
const LITTLE_MEI = 'Little Mei';
const LOST_TEXT = '1 dialogues in the project have no character assigned in Scripting.';
const SPEED_INPUTS: readonly (readonly [string, string])[] = [
  ['2', '1.5'],
  ['0.3', '0.6'],
  ['0', '1'],
  ['', '1'],
  ['1.23', '1.25'],
  ['0.8', '0.8'],
];

const HERO_ID = castId(HERO);
const HEALER_ID = castId(HEALER);

function previewCalls(spy: IpcSpy): Promise<unknown[]> {
  return spy.calls(PREVIEW_COMMAND);
}

async function addSpeaker(ui: Ui, name: string, key: 'click' | 'Enter'): Promise<void> {
  const voices = ui.main.audiobook.voices;
  await voices.newName.fill(name);
  if (key === 'click') {
    await voices.add.click();
  } else {
    await voices.newName.press('Enter');
  }
}

test.describe('CAP-08 Production Workflow', () => {
  test.describe('FEAT-57 Audiobook Voice Casting', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo'] } });

    test('US-0155 assigns a library voice to the narrator and every character', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox);
      const table = ui.main.audiobook.voices;
      const narrator = table.row(NARRATOR_ID);
      const hero = table.row(HERO_ID);
      await showMode(ui, 'voices');

      await test.step('shows a row with the name, voice, speed, block count and status for the narrator and every character', async () => {
        await expect(narrator.name).toHaveValue(NARRATOR);
        await expect(narrator.voice).toHaveValue('');
        await expect(narrator.speed).toHaveValue('1');
        await expect(narrator.uses).toHaveText('4');
        await expect(narrator.status).toHaveText(STATUS_NO_VOICE);
        await expect(hero.name).toHaveValue(HERO);
        await expect(hero.uses).toHaveText('0');
        await expect(hero.status).toBeVisible();
      });

      await test.step('groups the voices into Local TTS and Cloud speech with language and gender and keeps unusable voices selectable with the reason', async () => {
        await expect(narrator.groups).toHaveCount(2);
        await expect(narrator.groups.nth(0)).toHaveAttribute('label', GROUP_LOCAL);
        await expect(narrator.groups.nth(1)).toHaveAttribute('label', GROUP_CLOUD);
        await expect(narrator.option(NARRATOR_VOICE)).toHaveText(
          `${NARRATOR_VOICE} · Vietnamese · Female`,
        );
        await expect(narrator.option(HERO_VOICE)).toHaveText(`${HERO_VOICE} · Vietnamese · Male`);
        await expect(narrator.groups.nth(0).locator('option')).toHaveCount(4);
        await expect(narrator.option(NANO_VOICE)).toHaveText(
          `${NANO_VOICE} · Vietnamese · Male — ${MODEL_ISSUE}`,
        );
        await expect(narrator.groups.nth(1).locator('option')).toHaveText([
          `${CLOUD_VOICE} · Vietnamese · Female — ${CLOUD_ISSUE}`,
          `${EDGE_VOICE} · Vietnamese · Female`,
        ]);
        await expect(narrator.option(NANO_VOICE)).toBeEnabled();
        await assignVoice(ui, HERO_ID, voices[NANO_VOICE] ?? 0);
        await expect(hero.status).toHaveText(STATUS_MODEL_REQUIRED);
      });

      await test.step('saves the chosen voice at once and marks the generated segments of the speaker as voice changed', async () => {
        await assignVoice(ui, NARRATOR_ID, voices[NARRATOR_VOICE] ?? 0);
        await expect.poll(() => savedVoiceOf(folder, NARRATOR_ID)).toBe(voices[NARRATOR_VOICE]);
        await showMode(ui, 'prod');
        await generateChapter(ui);
        await assignVoice(ui, NARRATOR_ID, voices[QUIET_VOICE] ?? 0);
        await expect.poll(() => savedVoiceOf(folder, NARRATOR_ID)).toBe(voices[QUIET_VOICE]);
        await showMode(ui, 'prod');
        await expectEveryState(ui, STATE_STALE);
        await expect(ui.main.audiobook.segment(0).reason('voice')).toHaveText(REASON_VOICE);
      });

      await test.step('shows no voice for a speaker used without a voice and unused for a speaker without blocks', async () => {
        await assignVoice(ui, NARRATOR_ID, null);
        await expect(narrator.status).toHaveText(STATUS_NO_VOICE);
        await expect(table.row(HEALER_ID).status).toHaveText(STATUS_UNUSED);
      });
    });

    test('US-0156 sets the reading speed of each speaker', async ({ ui, picker, sandbox }) => {
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox);
      const speed = ui.main.audiobook.voices.row(NARRATOR_ID).speed;
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });

      await test.step('keeps the speed between 0.6 and 1.5 in steps of 0.05 and turns 0 or an invalid value into 1', async () => {
        await showMode(ui, 'voices');
        for (const [typed, shown] of SPEED_INPUTS) {
          await setSpeed(ui, NARRATOR_ID, typed);
          await expect(speed).toHaveValue(shown);
        }
        await expect
          .poll(async () => (await readAudiobook(folder))?.voices[NARRATOR_ID]?.speed)
          .toBe(0.8);
      });

      await test.step('marks the generated segments of the speaker as voice settings changed when the speed changes', async () => {
        await showMode(ui, 'prod');
        await generateChapter(ui);
        await showMode(ui, 'voices');
        await setSpeed(ui, NARRATOR_ID, '1.2');
        await showMode(ui, 'prod');
        await expectEveryState(ui, STATE_STALE);
        await expect(ui.main.audiobook.segment(0).reason('speed')).toHaveText(REASON_SPEED);
      });
    });

    test('US-0157 previews the assigned voice before generating audio', async ({
      ui,
      app,
      picker,
      sandbox,
      backend,
    }) => {
      const { voices } = await openAudiobookOf(ui, picker, sandbox);
      const narrator = ui.main.audiobook.voices.row(NARRATOR_ID);
      const hero = ui.main.audiobook.voices.row(HERO_ID);
      const spy = new IpcSpy(() => app.page);
      await spy.install();
      await spy.mode(PREVIEW_COMMAND, 'pass');

      await test.step('plays the sample sentence of a usable voice or the default sentence when the voice has none', async () => {
        await assignVoice(ui, NARRATOR_ID, voices[NARRATOR_VOICE] ?? 0);
        await narrator.preview.click();
        await expect.poll(() => spy.done(PREVIEW_COMMAND), { timeout: 30_000 }).toBe(1);
        expect((await previewCalls(spy))[0]).toMatchObject({
          voiceId: voices[NARRATOR_VOICE],
          text: VOICE_SAMPLE_VI,
        });
        await assignVoice(ui, NARRATOR_ID, voices[QUIET_VOICE] ?? 0);
        await narrator.preview.click();
        await expect.poll(() => spy.done(PREVIEW_COMMAND), { timeout: 30_000 }).toBe(2);
        expect((await previewCalls(spy))[1]).toMatchObject({
          voiceId: voices[QUIET_VOICE],
          text: PREVIEW_FALLBACK,
        });
        await expect(ui.main.toast(PREVIEW_FAILED)).toHaveCount(0);
      });

      await test.step('locks the preview while the speaker has no voice or an unusable voice', async () => {
        await expect(hero.preview).toBeDisabled();
        await assignVoice(ui, HERO_ID, voices[NANO_VOICE] ?? 0);
        await expect(hero.preview).toBeDisabled();
        await assignVoice(ui, HERO_ID, voices[CLOUD_VOICE] ?? 0);
        await expect(hero.preview).toBeDisabled();
      });

      await test.step('reports that the voice preview could not be played when it fails', async () => {
        await backend.failSynthesis(BACKEND_REASON);
        await assignVoice(ui, NARRATOR_ID, voices[HERO_VOICE] ?? 0);
        await narrator.preview.click();
        await expect(ui.main.toast(PREVIEW_FAILED)).toBeVisible({ timeout: 30_000 });
        await backend.recoverSynthesis();
      });
    });

    test.fixme('US-0157 warns that the preview sends the sample sentence to the cloud provider (needs FEAT-48 cloud providers)', async () => {});

    test('US-0158 shows which speech engines are ready and opens their settings', async ({
      ui,
      picker,
      sandbox,
      backend,
    }) => {
      const { voices } = await openAudiobookOf(ui, picker, sandbox);
      const engines = ui.main.audiobook.engines;
      const table = ui.main.audiobook.voices;
      await showMode(ui, 'voices');
      await showInspector(ui);

      await test.step('shows the installed Local TTS models and the connected cloud providers or that none is ready', async () => {
        await expect(engines.local).toHaveText('1 models');
        await expect(engines.cloud).toHaveText('1 provider');
      });

      await test.step('opens Local backend, Cloud providers or the voice library', async () => {
        const dialog = ui.main.settings.dialog;
        await engines.localTts.click();
        await expect(dialog.pane('backend')).toBeVisible();
        await closeSettings(ui);
        await engines.cloudSpeech.click();
        await expect(dialog.pane('cloud')).toBeVisible();
        await closeSettings(ui);
        await engines.library.click();
        await expect(ui.main.library.voices.root).toBeVisible();
        await switchModule(ui, 'audiobook');
      });

      await test.step('shows not connected for a cloud voice and model required for a local voice without its model, without checking whether the backend runs', async () => {
        await assignVoice(ui, NARRATOR_ID, voices[NANO_VOICE] ?? 0);
        await expect(table.row(NARRATOR_ID).status).toHaveText(STATUS_MODEL_REQUIRED);
        await expect(table.row(NARRATOR_ID).statusBadge).toHaveAttribute('title', MODEL_ISSUE);
        await assignVoice(ui, HERO_ID, voices[CLOUD_VOICE] ?? 0);
        await expect(table.row(HERO_ID).status).toHaveText(STATUS_NOT_CONNECTED);
        await expect(table.row(HERO_ID).statusBadge).toHaveAttribute('title', CLOUD_ISSUE);
        await assignVoice(ui, HEALER_ID, voices[HERO_VOICE] ?? 0);
        await expect(table.row(HEALER_ID).status).toHaveText(STATUS_READY);
        await stopBackend(ui, backend);
        await expect(table.row(HEALER_ID).status).toHaveText(STATUS_READY);
      });
    });

    test('US-0159 adds speakers and points out dialogues without a character', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox);
      const table = ui.main.audiobook.voices;
      const scripting = ui.main.scripting;
      const spy = await trackSaves(app);
      await showMode(ui, 'voices');

      await test.step('adds a speaker with the add button or Enter to the characters shared with Scripting and rejects a duplicate name', async () => {
        await addSpeaker(ui, OLD_WANG, 'click');
        await addSpeaker(ui, LITTLE_MEI, 'Enter');
        await expect.poll(() => speakerIdOf(ui, OLD_WANG)).not.toBe('');
        await expect.poll(() => speakerIdOf(ui, LITTLE_MEI)).not.toBe('');
        await expect(table.newName).toHaveValue('');
        await addSpeaker(ui, HERO, 'click');
        await expect(ui.main.toast(SPEAKER_DUPLICATE)).toBeVisible();
        await switchModule(ui, 'scripting');
        await showCast(ui);
        await expect.poll(() => castIdOf(ui, OLD_WANG)).not.toBe('');
        await expect.poll(() => castIdOf(ui, LITTLE_MEI)).not.toBe('');
      });

      await test.step('locks the delete button of the narrator, a Knowledgebase character and a speaker in use with the reason', async () => {
        await changeType(ui, scripting.block(0), TYPE_DIALOGUE);
        await assignSpeaker(ui, scripting.block(0), OLD_WANG);
        await switchModule(ui, 'audiobook');
        const wang = table.row(await speakerIdOf(ui, OLD_WANG));
        await expect(table.row(NARRATOR_ID).remove).toBeDisabled();
        await expect(table.row(NARRATOR_ID).remove).toHaveAttribute('title', DELETE_NARRATOR);
        await expect(table.row(HERO_ID).remove).toBeDisabled();
        await expect(table.row(HERO_ID).remove).toHaveAttribute('title', DELETE_KB);
        await expect(wang.remove).toBeDisabled();
        await expect(wang.remove).toHaveAttribute('title', DELETE_IN_USE);
      });

      await test.step('deletes an unused speaker together with its voice settings', async () => {
        const meiId = await speakerIdOf(ui, LITTLE_MEI);
        await assignVoice(ui, meiId, voices[NARRATOR_VOICE] ?? 0);
        await expect.poll(() => savedVoiceOf(folder, meiId)).toBe(voices[NARRATOR_VOICE]);
        await table.row(meiId).remove.click();
        await expect(table.row(meiId).root).toHaveCount(0);
        await expect
          .poll(async () => Object.keys((await readAudiobook(folder))?.voices ?? {}))
          .not.toContain(meiId);
        await switchModule(ui, 'scripting');
        await expect.poll(() => castIdOf(ui, LITTLE_MEI)).toBe('');
      });

      await test.step('counts the dialogues without a character and opens Scripting', async () => {
        await waitForSaves(app.page, spy);
        await orphanDialogues(folder, 1);
        const reopened = await reopenAudiobook(ui, app, picker, folder);
        await showMode(ui, 'voices');
        await expect(reopened.voices.lostText).toHaveText(LOST_TEXT);
        await reopened.voices.lostGo.click();
        await expect(ui.main.scripting.root).toBeVisible();
      });
    });
  });
});
