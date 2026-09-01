import { existsSync } from 'node:fs';

import { expect, test } from '../scripts/fixtures.ts';
import { readLibrary } from '../scripts/library.ts';
import { DELETE_WARNING } from '../scripts/messages.ts';
// prettier-ignore
import { DELETE_NOTE, HARBOR_CHAPTERS, openProjectsView, PROJECT_DELETED, projectFolder, readProjects, selectProject } from '../scripts/project.ts';
import { readWorkspace } from '../scripts/workspaces.ts';

test.describe('CAP-06 Project Management', () => {
  test.describe('FEAT-34 Project Deletion', () => {
    test('US-0098 deletes a project only after a confirmation that names it and warns about the consequences', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox, {
        novels: [{ title: 'Harbor Lights', chapters: HARBOR_CHAPTERS }],
        projects: [
          { name: 'Harbor Audio', novel: 'Harbor Lights', files: { 'scenes/one.txt': 'scene' } },
        ],
        library: { images: [{ name: 'beacon.png' }] },
      });
      const project = ui.main.project;
      const confirm = ui.main.confirm;
      await selectProject(ui, 'Harbor Audio');

      await test.step('names the project and warns that its folder and contents are deleted for good while the library and source novel are untouched', async () => {
        await project.panel.remove.click();

        await expect(confirm.panel).toBeVisible();
        await expect(confirm.names).toHaveText(['Harbor Audio']);
        await expect(confirm.warning).toContainText(DELETE_WARNING);
        await expect(project.deleteDialog.note).toContainText(DELETE_NOTE);
      });

      await test.step('keeps the project and its folder when the confirmation is cancelled', async () => {
        await confirm.cancel.click();

        await expect(confirm.panel).toBeHidden();
        await expect(project.catalog.card('Harbor Audio')).toBeVisible();
        expect(readProjects(folder)).toHaveLength(1);
        expect(existsSync(projectFolder(folder, 1))).toBe(true);
      });

      await test.step('removes the project and its folder, reports the deletion and keeps the library resources and the source novel', async () => {
        await project.panel.remove.click();
        await expect(confirm.panel).toBeVisible();
        await project.deleteDialog.acknowledge.check();
        await confirm.accept.click();

        await expect(confirm.panel).toBeHidden();
        await expect(ui.main.toast(PROJECT_DELETED)).toContainText('Harbor Audio');
        await expect(project.catalog.cards).toHaveCount(0);
        expect(readProjects(folder)).toHaveLength(0);
        expect(existsSync(projectFolder(folder, 1))).toBe(false);
        expect(await readLibrary(folder, (db) => db.counts())).toEqual({
          image: 1,
          sound: 0,
          video: 0,
          prompt: 0,
        });
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual(['Harbor Lights']);
      });
    });
  });
});
