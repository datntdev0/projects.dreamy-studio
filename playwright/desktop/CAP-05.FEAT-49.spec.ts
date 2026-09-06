import { expect, test } from '../scripts/backend.ts';
import { expectAudio, watchAudio } from '../scripts/library.ts';
// prettier-ignore
import { openVoices, PLAY_SAMPLE, type SeedVoice, STOP_SAMPLE } from '../scripts/voices.ts';

const VOICES: readonly SeedVoice[] = [
  {
    name: 'Narrator An',
    description: 'Warm bedtime narrator',
    preset: 'Mai Anh',
    createdAt: '2026-03-01T08:00:00Z',
  },
  {
    name: 'Brother Minh',
    description: 'Cheerful older brother',
    engine: 'vieneu-nano',
    gender: 'male',
    preset: 'Minh Quân',
    createdAt: '2026-02-01T08:00:00Z',
  },
  {
    name: 'Cloud Ana',
    description: 'Studio announcer',
    engine: 'elevenlabs',
    engineKind: 'cloud',
    source: 'design',
    prompt: 'female, young adult',
    createdAt: '2026-01-01T08:00:00Z',
  },
];

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-49 Voice Browsing', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo'] } });

    test('US-0130 lists every voice with its details, marks voices whose engine is not ready and shows an empty state', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openVoices(ui, picker, sandbox, VOICES);
      const list = ui.main.library.voices;

      await test.step('shows each voice with avatar, description, engine, language, gender and a trailing preview button', async () => {
        await expect(list.names).toHaveText(['Narrator An', 'Brother Minh', 'Cloud Ana']);
        const row = list.row('Narrator An');
        await expect(row.description).toHaveText('Warm bedtime narrator');
        await expect(row.avatar).toHaveText('NA');
        await expect(row.avatar).toHaveClass(/tone-[0-3]/);
        await expect(row.engine).toHaveText('VieNeu-TTS v3 Turbo');
        await expect(row.language).toHaveText('Vietnamese');
        await expect(row.gender).toHaveText('Female');
        await expect(row.cells.last().getByTestId('library-voice-play-button')).toHaveText(
          'Preview',
        );
        await expect(list.table).not.toContainText('Preset');
        await expect(list.table).not.toContainText('2026-03-01');
      });

      await test.step('dims the engine of a voice whose engine is not ready and explains why', async () => {
        const pill = list.row('Brother Minh').engine.getByTestId('library-voice-engine-pill');
        await expect(pill).toHaveClass(/is-off/);
        await expect(pill).toHaveAttribute('title', 'Engine not ready');
        await expect(
          list.row('Narrator An').engine.getByTestId('library-voice-engine-pill'),
        ).not.toHaveClass(/is-off/);
      });

      await test.step('hides the collection and tag filters because voices do not use them', async () => {
        await expect(ui.main.library.explorer.filtersHead).toBeHidden();
        await expect(ui.main.library.explorer.filterCollection).toBeHidden();
      });

      await test.step('shows an empty state with a create button once the library has no voices', async () => {
        for (const name of ['Narrator An', 'Brother Minh', 'Cloud Ana']) {
          await list.row(name).name.click();
          await ui.main.library.voicePanel.remove.click();
          await ui.main.confirm.accept.click();
          await expect(list.row(name).root).toHaveCount(0);
        }
        await expect(list.empty).toBeVisible();
        await expect(list.empty).toContainText('No voices yet');
        await expect(list.empty).toContainText(
          'Create a voice from a preset, clone one from a sound in your library, or describe the voice you want.',
        );
        await expect(list.emptyCreate).toBeVisible();
      });
    });

    test('US-0131 searches and filters the voices by engine type', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openVoices(ui, picker, sandbox, VOICES);
      const list = ui.main.library.voices;

      await test.step('keeps only voices whose name or description matches, ignoring case', async () => {
        await list.search.fill('BROTHER');
        await expect(list.names).toHaveText(['Brother Minh']);
        await list.search.fill('announcer');
        await expect(list.names).toHaveText(['Cloud Ana']);
        await list.search.fill('');
      });

      await test.step('offers only the new voice button on the right, without an engine type filter', async () => {
        await expect(list.toolbarRight.getByTestId('library-voices-filter')).toHaveCount(0);
        await expect(list.toolbarRight.getByTestId('library-voices-create')).toBeVisible();
      });

      await test.step('clears the keyword filter and lists the newest voices first', async () => {
        await list.search.fill('nobody');
        await expect(list.emptyFiltered).toBeVisible();
        await list.clearFilters.click();
        await expect(list.search).toHaveValue('');
        await expect(list.names).toHaveText(['Narrator An', 'Brother Minh', 'Cloud Ana']);
        await expect(list.root.getByTestId('library-voices-sort')).toHaveCount(0);
      });
    });

    test('US-0132 plays one generated sample at a time and locks the preview of voices whose engine is not ready', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      await openVoices(ui, picker, sandbox, VOICES);
      const list = ui.main.library.voices;
      await watchAudio(app.page);

      await test.step('plays the sample of a ready voice and stops by itself when the sample ends', async () => {
        const play = list.row('Narrator An').play;
        await play.click();
        await expect(play).toHaveAttribute('aria-label', STOP_SAMPLE, { timeout: 30_000 });
        await expectAudio(app.page, false);
        await expect(play).toHaveAttribute('aria-label', PLAY_SAMPLE, { timeout: 15_000 });
      });

      await test.step('plays on double click and stops when the same voice is pressed again', async () => {
        const row = list.row('Narrator An');
        await row.name.dblclick();
        await expect(row.play).toHaveAttribute('aria-label', STOP_SAMPLE, { timeout: 30_000 });
        await row.play.click();
        await expect(row.play).toHaveAttribute('aria-label', PLAY_SAMPLE);
        await expectAudio(app.page, true);
      });

      await test.step('locks the play button of a voice whose engine is not ready and explains why', async () => {
        for (const name of ['Brother Minh', 'Cloud Ana']) {
          await expect(list.row(name).play).toBeDisabled();
          await expect(list.row(name).play).toHaveAttribute('title', 'Engine not ready');
        }
      });
    });

    test.describe('without a ready engine', () => {
      test.use({ backendOptions: { models: [] } });

      test('US-0133 guides the user to Local backend or Cloud providers when no speech engine is ready', async ({
        ui,
        picker,
        sandbox,
      }) => {
        await openVoices(ui, picker, sandbox, [VOICES[0]]);
        const list = ui.main.library.voices;
        const panel = ui.main.library.voicePanel;

        await test.step('warns in the voice panel and opens the matching settings section', async () => {
          await list.row('Narrator An').name.click();
          await expect(panel.warning).toContainText(
            'VieNeu-TTS v3 Turbo is not ready on this machine.',
          );
          await panel.openSettings.click();
          await expect(ui.main.settings.dialog.pane('backend')).toBeVisible();
        });
      });
    });
  });
});
