// prettier-ignore
import { addPause, assignVoice, castVoices, chapterEstimate, CLOUD_VOICE, EMPTY_BLANK, EMPTY_SCRIPT, FLAG_DEFAULT, FLAG_PLACEHOLDER, FLAG_TOAST, generateChapter, HERO_VOICE, NANO_VOICE, NARRATOR_VOICE, openAudiobookOf, openDraftedProject, orphanDialogues, paragraph, QUIET_VOICE, readUnitAudio, REASON_SPEAKER, REASON_SPEED, REASON_TEXT, REASON_TONE, REASON_VOICE, regenerateSegment, reopenAudiobook, savedFlags, setSpeed, showMode, speakAs, STATE_DONE, STATE_FLAG, STATE_NONE, STATE_RUNNING, STATE_STALE, stopBackend, switchModule, UNIT_DOING, UNIT_DONE, UNIT_NONE, UNIT_STALE } from '../scripts/audiobook.ts';
import { expect, test } from '../scripts/backend.ts';
// prettier-ignore
import { addBlock, assignSpeaker, AUDIO_PROJECT, castId, changeType, HERO, MASTER, NARRATOR, NARRATOR_ID, openAudiobook, paragraphsOf, startWriting, trackSaves, TYPE_DIALOGUE, TYPE_HEADING, TYPE_NARRATION, TYPE_NOTE, waitForSaves } from '../scripts/scripting.ts';

const HERO_ID = castId(HERO);
const MASTER_ID = castId(MASTER);
const TONE = 'whispering';
const NOTE = 'Remember the bell';
const EDITED = 'Lin Feng arrived late at the gates.';
const FLAG_NOTE = 'Wrong stress on Lin Feng';
const DURATION = /^\s*\d+:\d{2}\s*$/;

test.describe('CAP-08 Production Workflow', () => {
  test.describe('FEAT-58 Audiobook Segment Review', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo'] } });

    test('US-0160 splits the script of each chapter into reading segments', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { voices } = await openDraftedProject(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const book = ui.main.audiobook;
      const [p1 = '', p2 = '', p3 = '', p4 = ''] = paragraphsOf(1);
      await startWriting(ui, 4);
      await scripting.unit(1).click();
      await changeType(ui, scripting.block(0), TYPE_HEADING);
      await changeType(ui, scripting.block(1), TYPE_DIALOGUE);
      await speakAs(ui, scripting.block(1), HERO);
      await scripting.block(1).tone.fill(TONE);
      await scripting.block(1).tone.press('Tab');
      await addPause(ui, 1, '0.8');
      await addBlock(ui, TYPE_NOTE);
      await scripting.block(3).text.fill(NOTE);
      await openAudiobook(ui, AUDIO_PROJECT);
      await assignVoice(ui, NARRATOR_ID, voices[NARRATOR_VOICE] ?? 0);
      await setSpeed(ui, NARRATOR_ID, '1.2');
      await castVoices(ui, { [HERO_ID]: voices[HERO_VOICE] ?? 0 });

      await test.step('turns every title, narration and dialogue with content into a segment, shows pauses in seconds and hides notes', async () => {
        await expect(book.segments).toHaveCount(4);
        await expect(book.segments.getByTestId('audiobook-segment-text')).toHaveText([
          p1,
          p2,
          p3,
          p4,
        ]);
        await expect(book.gaps).toHaveText(['Pause 0.8 seconds']);
        await expect(book.list).not.toContainText(NOTE);
      });

      await test.step('shows number, type, speaker, voice with its speed when not 1, tone, content, duration and state of a segment', async () => {
        const dialogue = book.segment(1);
        await expect(dialogue.number).toHaveText('02');
        await expect(dialogue.type).toHaveText(TYPE_DIALOGUE);
        await expect(dialogue.voice).toHaveText(HERO_VOICE);
        await expect(dialogue.tone).toHaveText(TONE);
        await expect(dialogue.text).toHaveText(p2);
        await expect(dialogue.duration).toHaveText('—');
        await expect(dialogue.state).toHaveText(STATE_NONE);
        await expect(book.segment(0).type).toHaveText(TYPE_HEADING);
        await expect(book.segment(0).voice).toHaveText(`${NARRATOR_VOICE} · 1.2×`);
        await expect(book.segment(2).type).toHaveText(TYPE_NARRATION);
        await regenerateSegment(ui, 1);
        await expect(dialogue.duration).toHaveText(DURATION);
      });

      await test.step('reads titles and narration with the narrator and dialogue with the character assigned in Scripting', async () => {
        await expect(book.segments.getByTestId('audiobook-segment-speaker')).toHaveText([
          NARRATOR,
          HERO,
          NARRATOR,
          NARRATOR,
        ]);
      });

      await test.step('asks to write the script in Scripting first for a chapter without a script', async () => {
        await book.unit(2).click();
        await expect(book.empty).toContainText(EMPTY_SCRIPT);
        await book.openScript.click();
        await expect(scripting.root).toBeVisible();
        await expect(scripting.unit(2)).toHaveAttribute('aria-selected', 'true');
        await switchModule(ui, 'audiobook');
      });

      await test.step('tells that there is no segment to read for a chapter without narration or dialogue', async () => {
        await book.unit(4).click();
        await expect(book.empty).toContainText(EMPTY_BLANK);
      });
    });

    test('US-0161 shows the audio progress of every chapter', async ({
      ui,
      app,
      picker,
      sandbox,
      backend,
    }) => {
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox, [1, 2]);
      let book = ui.main.audiobook;
      const scripting = ui.main.scripting;
      const spy = await trackSaves(app);
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
      await generateChapter(ui);
      await book.unit(2).click();
      await regenerateSegment(ui, 0);

      await test.step('shows the generated chapters over the total with a bar and the segments, duration and state of each chapter', async () => {
        await expect(book.railCount).toHaveText('1/4 generated');
        await expect(book.railProgress).toHaveAttribute('style', /width: 25%/);
        await expect(book.unitMeta(1)).toHaveText(/^4\/4 segments · \d+:\d{2}$/);
        await expect(book.unitMark(1)).toHaveAttribute('title', UNIT_DONE);
        await expect(book.unitMeta(2)).toHaveText(/^1\/4 segments · \d+:\d{2}$/);
        await expect(book.unitMark(2)).toHaveAttribute('title', UNIT_DOING);
        await expect(book.unitMeta(3)).toHaveText(UNIT_NONE);
        await expect(book.unitMark(3)).toHaveAttribute('title', UNIT_NONE);
        await switchModule(ui, 'scripting');
        await scripting.unit(2).click();
        await scripting.block(0).text.fill(EDITED);
        await switchModule(ui, 'audiobook');
        await expect(book.unitMark(2)).toHaveAttribute('title', UNIT_STALE);
      });

      await test.step('opens the first chapter with a script whose audio is not complete', async () => {
        await waitForSaves(app.page, spy);
        book = await reopenAudiobook(ui, app, picker, folder);
        await expect(book.unit(2)).toHaveAttribute('aria-selected', 'true');
      });

      await test.step('shows the segments, generated, to generate or generating counts and the estimated duration with silences', async () => {
        await regenerateSegment(ui, 0);
        await expect(book.stats).toHaveText([
          '4 segments',
          '1 generated',
          '3 to generate',
          chapterEstimate(await readUnitAudio(folder, 2), 4),
        ]);
        await backend.holdSynthesis(paragraph(2, 1));
        await book.segment(1).regenerate.click();
        await expect(book.stats.nth(2)).toHaveText('1 generating');
        await backend.releaseSynthesis();
        await expect(book.segment(1).state).toHaveText(STATE_DONE, { timeout: 60_000 });
      });
    });

    test('US-0162 marks the segments to regenerate after the script or the voice changes', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { voices } = await openDraftedProject(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const book = ui.main.audiobook;
      const [, p2 = ''] = paragraphsOf(1);
      await changeType(ui, scripting.block(1), TYPE_DIALOGUE);
      await speakAs(ui, scripting.block(1), HERO);
      await openAudiobook(ui, AUDIO_PROJECT);
      await castVoices(ui, {
        [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0,
        [HERO_ID]: voices[HERO_VOICE] ?? 0,
        [MASTER_ID]: voices[HERO_VOICE] ?? 0,
      });
      await generateChapter(ui);

      await test.step('needs regeneration because the content, the character or the tone changed in Scripting', async () => {
        await switchModule(ui, 'scripting');
        await scripting.block(0).text.fill(EDITED);
        await assignSpeaker(ui, scripting.block(1), MASTER);
        await scripting.block(1).tone.fill('angrily');
        await scripting.block(1).tone.press('Tab');
        await switchModule(ui, 'audiobook');
        await expect(book.segment(0).state).toHaveText(STATE_STALE);
        await expect(book.segment(0).reasons).toHaveText([REASON_TEXT]);
        await expect(book.segment(1).state).toHaveText(STATE_STALE);
        await expect(book.segment(1).reason('speaker')).toHaveText(REASON_SPEAKER);
        await expect(book.segment(1).reason('tone')).toHaveText(REASON_TONE);
      });

      await test.step('needs regeneration because the voice or the speed of the speaker changed', async () => {
        await assignVoice(ui, NARRATOR_ID, voices[QUIET_VOICE] ?? 0);
        await setSpeed(ui, MASTER_ID, '1.2');
        await showMode(ui, 'prod');
        await expect(book.segment(2).reasons).toHaveText([REASON_VOICE]);
        await expect(book.segment(1).reason('speed')).toHaveText(REASON_SPEED);
      });

      await test.step('tells how many segments changed since their audio was generated', async () => {
        await expect(book.bannerTexts('changed')).toHaveText(
          '4 segments changed since their audio was generated',
        );
      });

      await test.step('drops the segment of a deleted block or a block turned into a pause or a note', async () => {
        await switchModule(ui, 'scripting');
        await changeType(ui, scripting.block(2), TYPE_NOTE);
        await scripting.block(3).use('remove');
        await switchModule(ui, 'audiobook');
        await expect(book.segments.getByTestId('audiobook-segment-text')).toHaveText([EDITED, p2]);
      });

      await test.step('opens Scripting on the chapter with the block of the segment selected', async () => {
        await book.segment(1).edit.click();
        await expect(scripting.root).toBeVisible();
        await expect(scripting.unit(1)).toHaveAttribute('aria-selected', 'true');
        await expect(scripting.block(1).root).toHaveClass(/is-sel/);
      });
    });

    test('US-0163 reports the problems that block audio generation', async ({
      ui,
      app,
      picker,
      sandbox,
      backend,
    }) => {
      const { folder, voices } = await openDraftedProject(ui, picker, sandbox);
      const spy = await trackSaves(app);
      await changeType(ui, ui.main.scripting.block(1), TYPE_DIALOGUE);
      await waitForSaves(app.page, spy);
      await orphanDialogues(folder, 1);
      const book = await reopenAudiobook(ui, app, picker, folder);
      const scripting = ui.main.scripting;

      await test.step('counts the dialogues without a speaker and edits the first one in Scripting', async () => {
        await expect(book.bannerTexts('who')).toHaveText('1 dialogues have no speaker assigned.');
        await book.editWho.click();
        await expect(scripting.root).toBeVisible();
        await expect(scripting.block(1).root).toHaveClass(/is-sel/);
        await assignSpeaker(ui, scripting.block(1), HERO);
        await switchModule(ui, 'audiobook');
        await expect(book.banners('who')).toHaveCount(0);
      });

      await test.step('reports a speaker without a voice and opens Voices to choose one', async () => {
        await expect(book.bannerTexts('voice')).toHaveText([
          `${NARRATOR} has no voice yet.`,
          `${HERO} has no voice yet.`,
        ]);
        await book.chooseVoice.first().click();
        await expect(book.voices.root).toBeVisible();
      });

      await test.step('reports a voice that needs its model installed or its provider connected and offers to change it', async () => {
        await castVoices(ui, {
          [NARRATOR_ID]: voices[NANO_VOICE] ?? 0,
          [HERO_ID]: voices[CLOUD_VOICE] ?? 0,
        });
        await expect(book.bannerTexts('engine')).toHaveText([
          `${NARRATOR}: voice “${NANO_VOICE}” cannot be used yet (requires installing the VieNeu-TTS v3 Nano model).`,
          `${HERO}: voice “${CLOUD_VOICE}” cannot be used yet (requires connecting ElevenLabs).`,
        ]);
        await book.changeVoice.first().click();
        await expect(book.voices.root).toBeVisible();
      });

      await test.step('locks generate all while a blocking problem remains', async () => {
        await showMode(ui, 'prod');
        await expect(book.generateAll).toBeDisabled();
        await castVoices(ui, {
          [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0,
          [HERO_ID]: voices[HERO_VOICE] ?? 0,
        });
        await expect(book.generateAll).toBeEnabled();
      });

      await test.step('reports no blocking problem for an installed local voice while the backend is off', async () => {
        await stopBackend(ui, backend);
        await expect(book.banners('engine')).toHaveCount(0);
        await expect(book.banners('voice')).toHaveCount(0);
        await expect(book.generateAll).toBeEnabled();
      });
    });

    test('US-0164 flags a failed reading with a note', async ({ ui, picker, sandbox, backend }) => {
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox);
      const book = ui.main.audiobook;
      const dialog = book.flagDialog;
      const segment = book.segment(0);
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
      await regenerateSegment(ui, 0);

      await test.step('opens a dialog to note what is wrong for a generated segment', async () => {
        await segment.flag.click();
        await expect(dialog.panel).toBeVisible();
        await expect(dialog.note).toHaveAttribute('placeholder', FLAG_PLACEHOLDER);
      });

      await test.step('flags the segment as failed with the note, uses a default note when empty and confirms it', async () => {
        await dialog.save.click();
        await expect(dialog.panel).toBeHidden();
        await expect(segment.state).toHaveText(STATE_FLAG);
        await expect(segment.flagNote).toHaveText(`Failed: ${FLAG_DEFAULT}`);
        await expect(ui.main.toast(FLAG_TOAST)).toBeVisible();
        await segment.flag.click();
        await expect(segment.state).toHaveText(STATE_DONE);
        await segment.flag.click();
        await dialog.note.fill(FLAG_NOTE);
        await dialog.save.click();
        await expect(segment.flagNote).toHaveText(`Failed: ${FLAG_NOTE}`);
        await expect.poll(() => savedFlags(folder, 1)).toEqual([FLAG_NOTE]);
      });

      await test.step('clears the flag at once', async () => {
        await expect(segment.flag).toHaveAttribute('aria-pressed', 'true');
        await segment.flag.click();
        await expect(dialog.panel).toBeHidden();
        await expect(segment.state).toHaveText(STATE_DONE);
        await expect(segment.flag).toHaveAttribute('aria-pressed', 'false');
        await expect.poll(() => savedFlags(folder, 1)).toEqual(['']);
      });

      await test.step('locks the flag button of a segment without audio or being generated', async () => {
        const next = book.segment(1);
        await expect(next.flag).toBeDisabled();
        await backend.holdSynthesis(paragraph(1, 1));
        await next.regenerate.click();
        await expect(next.state).toHaveText(STATE_RUNNING);
        await expect(next.flag).toBeDisabled();
        await backend.releaseSynthesis();
        await expect(next.state).toHaveText(STATE_DONE, { timeout: 60_000 });
      });
    });
  });
});
