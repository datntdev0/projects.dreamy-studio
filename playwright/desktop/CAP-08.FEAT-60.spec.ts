// prettier-ignore
import { addPause, assignVoice, NARRATOR_VOICE, NO_AUDIO, openDraftedProject, PAUSE, PLAY, readUnitAudio, recordedSeconds, regenerateSegment, setSpeed, showMode } from '../scripts/audiobook.ts';
import { expect, test } from '../scripts/backend.ts';
// prettier-ignore
import { AUDIO_PROJECT, durationText, NARRATOR_ID, openAudiobook } from '../scripts/scripting.ts';

const LONG_FIRST =
  'Lin Feng arrived at the gates of Azure City at dawn, tired from the long road, and waited in the cold wind while the guards argued about whether a stranger with a sword could enter.';
const LONG_SECOND =
  'Master Chen watched him from the tower of the Sky Sword Sect, counting the scars on his hands and wondering which of the old masters had trained a blacksmith to hold a blade so well.';
const PAUSE_SECONDS = 0.8;
const TIME = /^\d+:\d{2} \/ \d+:\d{2}$/;

test.describe('CAP-08 Production Workflow', () => {
  test.describe('FEAT-60 Audiobook Playback', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo'] } });

    test('US-0169 listens to a segment or the whole chapter', async ({ ui, picker, sandbox }) => {
      test.setTimeout(240_000);
      const { folder, voices } = await openDraftedProject(ui, picker, sandbox);
      const scripting = ui.main.scripting;
      const book = ui.main.audiobook;
      const player = book.player;
      await scripting.block(0).text.fill(LONG_FIRST);
      await scripting.block(1).text.fill(LONG_SECOND);
      await addPause(ui, 0, String(PAUSE_SECONDS));
      await openAudiobook(ui, AUDIO_PROJECT);
      await assignVoice(ui, NARRATOR_ID, voices[NARRATOR_VOICE] ?? 0);
      await setSpeed(ui, NARRATOR_ID, '0.6');
      await showMode(ui, 'prod');

      await test.step('tells that the chapter has no audio to listen to yet', async () => {
        await book.playAll.click();
        await expect(ui.main.toast(NO_AUDIO)).toBeVisible();
        await expect(player.root).toBeHidden();
      });

      await test.step('locks the play button of a segment without audio', async () => {
        await expect(book.segment(0).play).toBeDisabled();
        for (const index of [0, 1, 2]) {
          await regenerateSegment(ui, index);
        }
        await expect(book.segment(0).play).toBeEnabled();
        await expect(book.segment(3).play).toBeDisabled();
      });

      await test.step('plays a segment with its progress, pauses or resumes on a second press and switches to another segment', async () => {
        const first = book.segment(0);
        const second = book.segment(1);
        await first.play.click();
        await expect(player.toggle).toHaveAttribute('aria-label', PAUSE);
        await expect(first.root).toHaveClass(/is-playing/);
        await expect(player.time).not.toHaveText(/^0:00 /);
        await first.play.click();
        await expect(player.toggle).toHaveAttribute('aria-label', PLAY);
        await expect(player.title).toContainText(LONG_FIRST.slice(0, 30));
        await first.play.click();
        await expect(player.toggle).toHaveAttribute('aria-label', PAUSE);
        await second.play.click();
        await expect(second.root).toHaveClass(/is-playing/);
        await expect(first.root).not.toHaveClass(/is-playing/);
        await expect(player.title).toContainText(LONG_SECOND.slice(0, 30));
        await player.stop.click();
      });

      await test.step('plays the segments with audio in order with the pauses of the script in between', async () => {
        const total = recordedSeconds(await readUnitAudio(folder, 1)) + PAUSE_SECONDS;
        await book.playAll.click();
        await expect(player.title).toContainText(LONG_FIRST.slice(0, 30));
        await expect(player.time).toHaveText(new RegExp(` / ${durationText(total)}$`));
      });

      await test.step('shows play or pause, the segment title, progress, elapsed over total time and stop, and hides the player when stopped or finished', async () => {
        await expect(player.toggle).toHaveAttribute('aria-label', PAUSE);
        await expect(player.title).toBeVisible();
        await expect(player.progress).toBeVisible();
        await expect(player.time).toHaveText(TIME);
        await player.stop.click();
        await expect(player.root).toBeHidden();
        await book.playAll.click();
        await expect(player.root).toBeVisible();
        await expect(player.root).toBeHidden({ timeout: 120_000 });
      });
    });
  });
});
