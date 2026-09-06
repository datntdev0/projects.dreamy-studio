// prettier-ignore
import { assignVoice, BACKEND_REASON, castVoices, COMPLETED_TOAST, EDGE_GROUP_TEXT, EDGE_VOICE, expectEveryState, HERO_VOICE, LOCAL_GROUP_TEXT, NARRATOR_VOICE, NO_COST, openAudiobookOf, paragraph, readUnitAudio, regenerateSegment, savedFlags, SEGMENT_FAILED, setPipelineLimits, showMode, speakAs, STARTED_TOAST, startGeneration, STATE_DONE, STATE_GENERATING, STATE_NONE, STATE_QUEUED, switchModule } from '../scripts/audiobook.ts';
import { expect, test } from '../scripts/backend.ts';
import type { Ui } from '../scripts/fixtures.ts';
// prettier-ignore
import { expectStatusRunning, readPipelines, showBottomPanel, waitForPipeline } from '../scripts/pipeline.ts';
// prettier-ignore
import { AUDIO_PROJECT, castId, changeType, HERO, NARRATOR, NARRATOR_ID, TYPE_DIALOGUE } from '../scripts/scripting.ts';
import { PIPELINE_STATUS_QUEUED, PIPELINE_STATUS_RUNNING } from '../scripts/translation.ts';

const EDITED = 'Lin Feng waited at the gate.';
const GENERATION_TIMEOUT = { timeout: 90_000 };
const HERO_ID = castId(HERO);

async function flagSegment(ui: Ui, index: number): Promise<void> {
  const dialog = ui.main.audiobook.flagDialog;
  await ui.main.audiobook.segment(index).flag.click();
  await dialog.save.click();
  await expect(dialog.panel).toBeHidden();
}

test.describe('CAP-08 Production Workflow', () => {
  test.describe('FEAT-59 Audiobook Generation', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo'] } });

    test('US-0165 generates a whole chapter after showing the cost and where it runs', async ({
      ui,
      picker,
      sandbox,
      backend,
    }) => {
      const { voices } = await openAudiobookOf(ui, picker, sandbox);
      const book = ui.main.audiobook;
      const dialog = book.generateDialog;
      const scripting = ui.main.scripting;
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
      for (const index of [0, 1, 2]) {
        await regenerateSegment(ui, index);
      }
      await flagSegment(ui, 1);
      await switchModule(ui, 'scripting');
      await scripting.block(2).text.fill(EDITED);
      await changeType(ui, scripting.block(3), TYPE_DIALOGUE);
      await speakAs(ui, scripting.block(3), HERO);
      await switchModule(ui, 'audiobook');
      await castVoices(ui, { [HERO_ID]: voices[EDGE_VOICE] ?? 0 });
      const localCharacters = paragraph(1, 1).length + EDITED.length;

      await test.step('counts the segments to generate including not generated, changed and failed ones and keeps the unchanged ones', async () => {
        await book.generateAll.click();
        await expect(dialog.panel).toBeVisible();
        await expect(dialog.intro).toHaveText(
          'Will generate 3 segments, of which 2 segments are regenerated because the script or voice changed. Segments that passed and have not changed are kept.',
        );
        await expect(dialog.go).toHaveText('Generate 3 segments');
      });

      await test.step('groups the segments by Local TTS running on this machine and by cloud provider with the warning that the text is sent, with their characters', async () => {
        await expect(dialog.groups).toHaveCount(2);
        await expect(dialog.group('local')).toContainText(LOCAL_GROUP_TEXT);
        await expect(dialog.group('local')).toContainText(`${localCharacters} characters`);
        await expect(dialog.group('edge-read-aloud')).toContainText(EDGE_GROUP_TEXT);
        await expect(dialog.group('edge-read-aloud')).toContainText(
          `${paragraph(1, 3).length} characters`,
        );
      });

      await test.step('shows no direct cost without a paid provider and notes that progress is followed in Pipelines', async () => {
        await expect(dialog.estimate).toHaveText(NO_COST);
        await dialog.cancel.click();
        await expect(dialog.panel).toBeHidden();
        await castVoices(ui, { [HERO_ID]: voices[HERO_VOICE] ?? 0 });
      });

      await test.step('locks generate all while segments are being generated, skips generated segments once every segment is done and offers to overwrite them', async () => {
        await backend.holdSynthesis(EDITED);
        await startGeneration(ui);
        await expect(book.segment(2).state).toHaveText(STATE_GENERATING);
        await expect(book.generateAll).toBeDisabled();
        await backend.releaseSynthesis();
        await expectEveryState(ui, STATE_DONE, GENERATION_TIMEOUT.timeout);
        await book.generateAll.click();
        await expect(dialog.nothing).toBeVisible();
        await expect(dialog.go).toBeDisabled();
        await expect(dialog.overwrite).not.toBeChecked();
        await expect(dialog.overwriteWarning).toBeHidden();
        await dialog.overwrite.check();
        await expect(dialog.nothing).toBeHidden();
        await expect(dialog.overwriteWarning).toBeVisible();
        await expect(dialog.go).toBeEnabled();
        await dialog.overwrite.uncheck();
        await expect(dialog.go).toBeDisabled();
        await dialog.cancel.click();
      });
    });

    test.fixme('US-0165 estimates the cost of the characters sent to a paid cloud provider (needs FEAT-48 cloud providers)', async () => {});

    test('US-0166 runs the generation as a pipeline that can be followed and cancelled', async ({
      ui,
      picker,
      sandbox,
      backend,
    }) => {
      test.setTimeout(240_000);
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox, [1, 2]);
      const book = ui.main.audiobook;
      const pipelines = ui.main.pipelines;
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
      await book.unit(2).click();
      await regenerateSegment(ui, 0);
      await flagSegment(ui, 0);
      await book.unit(1).click();
      await setPipelineLimits(ui, 1, 1);
      await backend.holdSynthesis(paragraph(1, 2), paragraph(1, 3));

      await test.step('creates an audiobook pipeline with one task per segment, announces it and marks the segments as generating', async () => {
        await startGeneration(ui);
        await expect(ui.main.toast(STARTED_TOAST)).toBeVisible();
        await expect(book.segment(2).state).toHaveText(STATE_GENERATING);
        await expect(book.segment(3).state).toHaveText(STATE_QUEUED);
        const pipeline = await waitForPipeline(folder, { states: ['running'] });
        expect(pipeline.kind).toBe('audio');
        expect(pipeline.tasks).toHaveLength(4);
        expect(new Set(pipeline.tasks.map((task) => task.segmentId)).size).toBe(4);
      });

      await test.step('lists the running pipeline in Pipelines with the progress of its tasks, its log and a cancel button and a running status bar', async () => {
        await showBottomPanel(ui);
        const item = pipelines.item(pipelines.list.item(AUDIO_PROJECT));
        await expect(item.status).toHaveText(PIPELINE_STATUS_RUNNING);
        await expect(item.tasks.first()).toBeVisible();
        await expect(item.cancel).toBeVisible();
        await expectStatusRunning(ui);
        await item.open.click();
        await expect(pipelines.log.root).toBeVisible();
        await showBottomPanel(ui);
      });

      await test.step('queues a new pipeline while the pipeline limit is reached', async () => {
        await book.unit(2).click();
        await startGeneration(ui);
        await waitForPipeline(folder, { count: 2, states: ['queued'] });
        await expect(pipelines.list.withStatus(PIPELINE_STATUS_QUEUED)).toHaveCount(1);
      });

      await test.step('keeps the pipeline running after switching to another chapter', async () => {
        expect(readPipelines(folder).map((pipeline) => pipeline.status)).toEqual([
          'running',
          'queued',
        ]);
        await book.unit(1).click();
        await expect(book.segment(2).state).toHaveText(STATE_GENERATING);
        await expect(book.segment(1).state).toHaveText(STATE_DONE, GENERATION_TIMEOUT);
      });

      await test.step('stops the unfinished tasks on cancel, keeps the finished segments and returns the others to their previous state', async () => {
        const [first] = readPipelines(folder);
        await pipelines.item(pipelines.list.withStatus(PIPELINE_STATUS_RUNNING)).cancel.click();
        await backend.releaseSynthesis();
        await waitForPipeline(folder, { id: first?.id, states: ['cancelled'] });
        await expect(book.states).toHaveText([STATE_DONE, STATE_DONE, STATE_NONE, STATE_NONE]);
        expect(Object.keys((await readUnitAudio(folder, 1))?.audio ?? {})).toHaveLength(2);
      });

      await test.step('announces the completion once every task succeeds, marks the segments as generated and clears the flags', async () => {
        const second = readPipelines(folder)[1];
        const finished = await waitForPipeline(folder, { id: second?.id, timeoutMs: 90_000 });
        expect(finished.status).toBe('completed');
        await expect(ui.main.toast(COMPLETED_TOAST)).toBeVisible();
        await book.unit(2).click();
        await expectEveryState(ui, STATE_DONE);
        expect(await savedFlags(folder, 2)).toEqual(['', '', '', '']);
      });
    });

    test('US-0167 reports the error returned by the backend while generating audio', async ({
      ui,
      picker,
      sandbox,
      backend,
    }) => {
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox);
      const book = ui.main.audiobook;
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
      await backend.holdSynthesis(paragraph(1, 1));
      await backend.failSynthesis(BACKEND_REASON, paragraph(1, 1));

      await test.step('calls the backend directly to generate audio with a local voice without checking it first', async () => {
        await startGeneration(ui);
        await expect(ui.main.toast(STARTED_TOAST)).toBeVisible();
        for (const index of [0, 2, 3]) {
          await expect(book.segment(index).state).toHaveText(STATE_DONE, GENERATION_TIMEOUT);
        }
      });

      await test.step('shows a toast with the reason from the backend, fails the task in the pipeline and keeps the previous state of the segment', async () => {
        await backend.releaseSynthesis();
        await expect(ui.main.toast(SEGMENT_FAILED)).toContainText(BACKEND_REASON);
        const pipeline = await waitForPipeline(folder);
        const failed = pipeline.tasks.filter((task) => task.status === 'failed');
        expect(failed).toHaveLength(1);
        expect(failed[0]?.error).toContain(BACKEND_REASON);
        await expect(book.segment(1).state).toHaveText(STATE_NONE);
      });

      await test.step('warns that not every segment could be generated with the number of failed segments', async () => {
        await expect(ui.main.toast('Could not generate 1 segments for')).toBeVisible();
        await backend.recoverSynthesis();
      });
    });

    test('US-0168 regenerates a single segment', async ({ ui, picker, sandbox, backend }) => {
      const { folder, voices } = await openAudiobookOf(ui, picker, sandbox);
      const book = ui.main.audiobook;
      const segment = book.segment(0);
      await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });

      await test.step('marks the segment as generating and then generated', async () => {
        await backend.holdSynthesis(paragraph(1, 0));
        await segment.regenerate.click();
        await expect(segment.state).toHaveText(STATE_GENERATING);
        await expect(segment.regenerate).toBeDisabled();
        await backend.releaseSynthesis();
        await expect(segment.state).toHaveText(STATE_DONE, GENERATION_TIMEOUT);
        expect(readPipelines(folder)).toHaveLength(0);
      });

      await test.step('warns about the first blocking problem and does not generate', async () => {
        await assignVoice(ui, NARRATOR_ID, null);
        await showMode(ui, 'prod');
        await book.segment(1).regenerate.click();
        await expect(ui.main.toast(`${NARRATOR} has no voice yet.`)).toBeVisible();
        await expect(book.segment(1).state).toHaveText(STATE_NONE);
        await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
      });

      await test.step('shows a toast with the reason when the backend fails and keeps the previous state of the segment', async () => {
        await backend.failSynthesis(BACKEND_REASON);
        await segment.regenerate.click();
        await expect(ui.main.toasts.filter({ hasText: BACKEND_REASON })).toBeVisible();
        await expect(segment.state).toHaveText(STATE_DONE);
        await book.segment(1).regenerate.click();
        await expect(ui.main.toasts.filter({ hasText: BACKEND_REASON }).last()).toBeVisible();
        await expect(book.segment(1).state).toHaveText(STATE_NONE);
        await backend.recoverSynthesis();
      });
    });
  });
});
