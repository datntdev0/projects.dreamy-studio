import { expect, test } from '../scripts/fixtures.ts';
import { waitForFrames } from '../scripts/frames.ts';
// prettier-ignore
import { audioState, clipboardText, closePreview, expectAudio, normalizeLines, openLibraryView, openPreview, ORIGIN_APP, ORIGIN_LABEL, ORIGIN_UPLOAD,PAUSE_LABEL, PLAY_LABEL, previewPages, PROMPT_COPIED_TOAST, RIGHTS_LICENSED, RIGHTS_OWN, sampleSoundBytes, sampleVideoBytes, squash, variableText, videoState, watchAudio, withoutBraces } from '../scripts/library.ts';

const PROMPT_TEXT =
  'Write a {{tone}} story about {{hero}} in {{place}}.\nKeep the {{tone}} voice until the end.';

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-15 Asset Preview', () => {
    test('US-0038 enlarges an image with its details and steps through adjacent images', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openLibraryView(
        ui,
        picker,
        sandbox,
        {
          collections: [{ name: 'Harbor' }],
          images: [
            { name: 'Alpha', ext: 'png', rights: 'own', createdAt: '2026-03-01T08:00:00.000Z' },
            {
              name: 'Bravo',
              ext: 'png',
              rights: 'licensed',
              origin: 'app',
              width: 640,
              height: 480,
              size: 2_621_440,
              collection: 'Harbor',
              tags: ['dock'],
              createdAt: '2026-03-05T09:30:00.000Z',
            },
            { name: 'Charlie', ext: 'png', rights: 'free', createdAt: '2026-03-10T10:00:00.000Z' },
          ],
        },
        'images',
      );
      const images = ui.main.library.images;
      const preview = previewPages(ui);
      await expect(images.cards).toHaveCount(3);
      const names = (await images.cardNames.allTextContents()).map((name) => name.trim());
      const middle = names.indexOf('Bravo');
      expect(middle).toBeGreaterThan(0);
      expect(middle).toBeLessThan(names.length - 1);
      const cardWidth = (await images.card('Bravo').boundingBox())?.width ?? 0;

      await test.step('shows the enlarged image with size, file size, rights, origin and added date', async () => {
        await openPreview(ui, 'image', 'Bravo');

        await expect(preview.image.panel).toBeVisible();
        await expect(preview.image.panel).toContainText('Bravo');
        await expect(preview.image.image).toBeVisible();
        await expect
          .poll(() =>
            preview.image.image.evaluate((element: HTMLImageElement) => element.naturalWidth),
          )
          .toBeGreaterThan(0);
        expect((await preview.image.image.boundingBox())?.width ?? 0).toBeGreaterThan(cardWidth);
        await expect(preview.image.specs).toHaveText('640×480');
        await expect(preview.image.size).toHaveText('2.5 MB');
        await expect(preview.image.rights).toHaveText(RIGHTS_LICENSED);
        await expect(preview.image.added).toHaveText('2026-03-05 09:30');
        await expect(preview.image.originLabel).toHaveText(ORIGIN_LABEL);
        await expect(preview.image.origin).toHaveText(ORIGIN_APP);
      });

      await test.step('moves to the adjacent images and disables previous on the first and next on the last', async () => {
        await expect(preview.image.panel).toContainText(`${middle + 1} / 3`);
        await expect(preview.image.previous).toBeEnabled();
        await expect(preview.image.next).toBeEnabled();

        await preview.image.next.click();
        await expect(preview.image.panel).toContainText(names[middle + 1] as string);
        await expect(preview.image.panel).toContainText('3 / 3');
        await expect(preview.image.origin).toHaveText(ORIGIN_UPLOAD);
        await expect(preview.image.next).toBeDisabled();
        await expect(preview.image.previous).toBeEnabled();

        await preview.image.previous.click();
        await preview.image.previous.click();
        await expect(preview.image.panel).toContainText(names[0] as string);
        await expect(preview.image.panel).toContainText('1 / 3');
        await expect(preview.image.previous).toBeDisabled();
        await expect(preview.image.next).toBeEnabled();
      });
    });

    test('US-0039 shows the waveform and duration of a sound and toggles playback', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const bytes = await sampleSoundBytes(sandbox, 'tone.wav', 3);
      await openLibraryView(
        ui,
        picker,
        sandbox,
        {
          sounds: [
            {
              name: 'Tone',
              ext: 'wav',
              durationMs: 3000,
              sampleRate: 44100,
              channels: 1,
              bytes,
              peakLevel: 0.6,
              rights: 'free',
            },
          ],
        },
        'sounds',
      );
      const preview = previewPages(ui);
      const page = ui.main.library.page;

      await test.step('shows the waveform and duration when the preview opens', async () => {
        await openPreview(ui, 'sound', 'Tone');

        await expect(preview.sound.panel).toBeVisible();
        await expect(preview.sound.wave).toBeVisible();
        await expect(preview.sound.waveCanvas).toBeVisible();
        expect((await preview.sound.waveCanvas.boundingBox())?.width ?? 0).toBeGreaterThan(100);
        await expect(preview.sound.specs).toHaveText('0:03');
        await expect(preview.sound.time).toContainText('0:03');
      });

      await test.step('plays on press and stops on the next press', async () => {
        await watchAudio(page);
        await expect(preview.sound.play).toHaveAttribute('aria-label', PLAY_LABEL);

        await preview.sound.play.click();
        await expectAudio(page, false);
        await expect(preview.sound.play).toHaveAttribute('aria-label', PAUSE_LABEL);
        await expect
          .poll(async () => (await audioState(page))?.currentTime ?? 0)
          .toBeGreaterThan(0);

        await preview.sound.play.click();
        await expectAudio(page, true);
        await expect(preview.sound.play).toHaveAttribute('aria-label', PLAY_LABEL);
        const stopped = (await audioState(page))?.currentTime ?? 0;
        await waitForFrames(page);
        expect((await audioState(page))?.currentTime).toBe(stopped);
      });
    });

    test('US-0040 shows a poster and duration per video and toggles playback in the preview', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const first = await sampleVideoBytes(sandbox, 'first.mp4', 2);
      const second = await sampleVideoBytes(sandbox, 'second.mp4', 3);
      await openLibraryView(
        ui,
        picker,
        sandbox,
        {
          videos: [
            {
              name: 'First',
              ext: 'mp4',
              durationMs: 2000,
              width: 320,
              height: 180,
              bytes: first,
              poster: true,
            },
            {
              name: 'Second',
              ext: 'mp4',
              durationMs: 3000,
              width: 320,
              height: 180,
              bytes: second,
              poster: true,
            },
          ],
        },
        'videos',
      );
      const videos = ui.main.library.videos;
      const preview = previewPages(ui);
      const page = ui.main.library.page;

      await test.step('lists every video with its poster and duration', async () => {
        await expect(videos.cards).toHaveCount(2);
        for (const card of await videos.cards.all()) {
          await expect(card.getByTestId('library-video-media-content')).toHaveCSS(
            'background-image',
            /^url\(/,
          );
          await expect(card.getByTestId('library-video-media-placeholder')).toHaveCount(0);
        }
        await expect(
          videos.card('First').getByTestId('library-video-media-duration-text'),
        ).toHaveText('0:02');
        await expect(
          videos.card('Second').getByTestId('library-video-media-duration-text'),
        ).toHaveText('0:03');
      });

      await test.step('plays on press and stops on the next press', async () => {
        await openPreview(ui, 'video', 'First');
        await expect(preview.video.panel).toBeVisible();
        await expect(preview.video.player).toBeVisible();
        await expect
          .poll(() =>
            preview.video.player.evaluate((element: HTMLVideoElement) => element.readyState),
          )
          .toBeGreaterThan(0);
        expect((await videoState(page))?.paused).toBe(true);

        await preview.video.player.click();
        await expect.poll(async () => (await videoState(page))?.paused).toBe(false);
        await expect
          .poll(async () => (await videoState(page))?.currentTime ?? 0)
          .toBeGreaterThan(0);

        await preview.video.player.click();
        await expect.poll(async () => (await videoState(page))?.paused).toBe(true);
        const stopped = (await videoState(page))?.currentTime ?? 0;
        await waitForFrames(page);
        expect((await videoState(page))?.currentTime).toBe(stopped);
      });
    });

    test('US-0041 shows a prompt with highlighted variables and copies the whole content', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openLibraryView(
        ui,
        picker,
        sandbox,
        { prompts: [{ name: 'Story', kind: 'general', text: PROMPT_TEXT, rights: 'own' }] },
        'prompts',
      );
      const preview = previewPages(ui);
      const page = ui.main.library.page;

      await test.step('shows the full content with variables highlighted and listed separately', async () => {
        await openPreview(ui, 'prompt', 'Story');

        await expect(preview.prompt.panel).toBeVisible();
        const shown = (await preview.prompt.text.textContent()) ?? '';
        expect(squash(withoutBraces(shown))).toBe(squash(withoutBraces(PROMPT_TEXT)));
        await expect(preview.prompt.variables).toHaveCount(4);
        await expect(preview.prompt.variables.nth(0)).toHaveText(variableText('tone'));
        await expect(preview.prompt.variables.nth(1)).toHaveText(variableText('hero'));
        await expect(preview.prompt.variables.nth(2)).toHaveText(variableText('place'));
        await expect(preview.prompt.variables.nth(3)).toHaveText(variableText('tone'));
        await expect(preview.promptInspector.variables).toHaveText([
          '{{tone}}',
          '{{hero}}',
          '{{place}}',
        ]);
        await expect(preview.prompt.rights).toHaveText(RIGHTS_OWN);
      });

      await test.step('puts the whole prompt in the clipboard and reports the result', async () => {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

        await preview.prompt.copy.click();

        await expect(ui.main.toast(PROMPT_COPIED_TOAST)).toBeVisible();
        expect(normalizeLines(await clipboardText(page))).toBe(PROMPT_TEXT);
        await closePreview(ui);
        await expect(preview.prompt.panel).toBeHidden();
      });
    });
  });
});
