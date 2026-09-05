// prettier-ignore
import { castVoices, generateChapter, NARRATOR_VOICE, openAudiobookOf, switchModule } from '../scripts/audiobook.ts';
import { expect, test } from '../scripts/backend.ts';
// prettier-ignore
import { AUDIO_PROJECT, COMING_SOON, expandProject, generateDefault, MODULE_LABELS, moduleState, NARRATOR_ID, openScripting, openScriptingWorkspace, PROJECT_IDS, showProjectExplorer, startWriting, STATE_DOING, STATE_DONE, STATE_IDLE, UNSUPPORTED_MODULES } from '../scripts/scripting.ts';

const AUDIO_ID = PROJECT_IDS[AUDIO_PROJECT] ?? 1;
const EDITED = 'Lin Feng arrived late at the gates.';

test.describe('CAP-06 Project Management', () => {
  test.describe('FEAT-53 Project Modules', () => {
    test('US-0142 lists the project modules in production order and opens the supported ones in their own tab', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openScriptingWorkspace(ui, picker, sandbox);
      const project = ui.main.project;
      const explorer = project.explorer;

      await test.step('shows Scripting, Character, World, Storyboard, Audiobook, Canvas and Video editor in order when the project is expanded', async () => {
        await expandProject(ui, AUDIO_PROJECT);
        await expect(explorer.moduleLabels(AUDIO_PROJECT)).toHaveText(MODULE_LABELS);
      });

      await test.step('locks the unsupported modules with a coming soon note and does not open them', async () => {
        for (const moduleId of UNSUPPORTED_MODULES) {
          const row = explorer.module(AUDIO_PROJECT, moduleId);
          await expect(row).toHaveAttribute('aria-disabled', 'true');
          await expect(row).toHaveAttribute('title', COMING_SOON);
          await row.click({ force: true });
        }
        await expect(project.moduleTabs).toHaveCount(0);
      });

      await test.step('opens Scripting on click and Audiobook on Enter in their own tabs and highlights the module row', async () => {
        await explorer.module(AUDIO_PROJECT, 'scripting').click();
        await expect(project.moduleTab(AUDIO_ID, 'scripting')).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await expect(ui.main.scripting.root).toBeVisible();
        await expect(explorer.module(AUDIO_PROJECT, 'scripting')).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await explorer.module(AUDIO_PROJECT, 'audiobook').focus();
        await explorer.module(AUDIO_PROJECT, 'audiobook').press('Enter');
        await expect(project.moduleTab(AUDIO_ID, 'audiobook')).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await expect(ui.main.audiobook.root).toBeVisible();
        await expect(explorer.module(AUDIO_PROJECT, 'audiobook')).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await expect(explorer.module(AUDIO_PROJECT, 'scripting')).toHaveAttribute(
          'aria-selected',
          'false',
        );
        await expect(project.moduleTabs).toHaveCount(2);
      });

      await test.step('reopens the project tab from the back button named after the project', async () => {
        await expect(ui.main.audiobook.back).toHaveText(AUDIO_PROJECT);
        await ui.main.audiobook.back.click();
        await expect(project.projectTab(AUDIO_ID)).toHaveAttribute('aria-selected', 'true');
        await expect(project.view.title).toHaveText(AUDIO_PROJECT);
        await project.moduleTab(AUDIO_ID, 'scripting').click();
        await expect(ui.main.scripting.back).toHaveText(AUDIO_PROJECT);
        await ui.main.scripting.back.click();
        await expect(project.projectTab(AUDIO_ID)).toHaveAttribute('aria-selected', 'true');
        await expect(project.view.title).toHaveText(AUDIO_PROJECT);
      });
    });

    test('US-0143 shows the Scripting progress and refreshes it after the script changes', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      await openScriptingWorkspace(ui, picker, sandbox);
      const explorer = ui.main.project.explorer;
      const row = explorer.module(AUDIO_PROJECT, 'scripting');
      const dot = explorer.moduleDot(AUDIO_PROJECT, 'scripting');
      const count = explorer.moduleCount(AUDIO_PROJECT, 'scripting');

      await test.step('shows not started while no chapter has a script', async () => {
        await expandProject(ui, AUDIO_PROJECT);
        await expect(row).toHaveAttribute('data-state', 'idle');
        await expect(dot).toHaveAttribute('title', STATE_IDLE);
        await expect(count).toBeHidden();
        expect(await moduleState(app.page, AUDIO_ID, 'scripting')).toMatchObject({
          state: 'idle',
          done: 0,
          total: 4,
        });
      });

      await test.step('shows in progress with the scripted chapters over all chapters once some chapters have a script', async () => {
        await openScripting(ui, AUDIO_PROJECT);
        await generateDefault(ui, 1);
        await expect(row).toHaveAttribute('data-state', 'doing');
        await expect(dot).toHaveAttribute('title', STATE_DOING);
        await expect(count).toHaveText('1/4');
        await expect
          .poll(() => moduleState(app.page, AUDIO_ID, 'scripting'))
          .toMatchObject({ state: 'doing', done: 1, total: 4 });
      });

      await test.step('updates the module list to done once every chapter has a script', async () => {
        await generateDefault(ui, 2);
        await generateDefault(ui, 3);
        await startWriting(ui, 4);
        await expect(row).toHaveAttribute('data-state', 'done');
        await expect(dot).toHaveAttribute('title', STATE_DONE);
        await expect(count).toHaveText('4/4');
        await expect
          .poll(() => moduleState(app.page, AUDIO_ID, 'scripting'))
          .toMatchObject({ state: 'done', done: 4, total: 4 });
      });
    });

    test.describe('with a local TTS model', () => {
      test.use({ backendOptions: { models: ['vieneu-turbo'] } });

      test('US-0143 shows Audiobook as needing review with the generated and stale chapter counts', async ({
        ui,
        app,
        picker,
        sandbox,
      }) => {
        const { voices } = await openAudiobookOf(ui, picker, sandbox);
        const row = ui.main.project.explorer.module(AUDIO_PROJECT, 'audiobook');
        await castVoices(ui, { [NARRATOR_ID]: voices[NARRATOR_VOICE] ?? 0 });
        await generateChapter(ui);

        await test.step('shows Audiobook in progress with the generated chapters over all chapters', async () => {
          await showProjectExplorer(ui);
          await expandProject(ui, AUDIO_PROJECT);
          await expect(row).toHaveAttribute('data-state', 'doing');
          await expect
            .poll(() => moduleState(app.page, AUDIO_ID, 'audiobook'))
            .toMatchObject({ state: 'doing', done: 1, total: 4 });
        });

        await test.step('shows Audiobook as needing review once a generated chapter changes in Scripting', async () => {
          await switchModule(ui, 'scripting');
          await ui.main.scripting.block(0).text.fill(EDITED);
          await expect(row).toHaveAttribute('data-state', 'stale');
          await expect
            .poll(() => moduleState(app.page, AUDIO_ID, 'audiobook'))
            .toMatchObject({ state: 'stale', done: 0, total: 4 });
          expect((await moduleState(app.page, AUDIO_ID, 'audiobook'))?.note).toContain(
            '1 need review',
          );
        });
      });
    });
  });
});
