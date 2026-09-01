import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { folderOpens, openProjectFiles, openProjectsView, projectFolder, stubFolderOpen } from '../scripts/project.ts';

test.describe('CAP-06 Project Management', () => {
  test.describe('FEAT-35 Project Folder Browsing', () => {
    test('US-0099 browses the project folder tree with folders first and refreshes it after outside changes', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox, {
        projects: [
          {
            name: 'Harbor Audio',
            dirs: ['audio'],
            files: {
              'a-notes.txt': 'notes',
              'readme.md': 'read me',
              'scenes/outline.txt': 'outline',
              'scenes/act1/intro.txt': 'intro',
            },
          },
        ],
      });
      const view = ui.main.project.view;

      await test.step('shows the folder tree with folders before files and expands a folder to show its content', async () => {
        await openProjectFiles(ui, 'Harbor Audio');

        await expect(view.entries).toContainText(['audio', 'scenes', 'a-notes.txt', 'readme.md']);

        await view.entry('scenes').click();
        await expect(view.entries).toContainText([
          'audio',
          'scenes',
          'act1',
          'outline.txt',
          'a-notes.txt',
          'readme.md',
        ]);

        await view.entry('act1').click();
        await expect(view.entry('intro.txt')).toBeVisible();
      });

      await test.step('shows the latest content of the folder after refreshing the files', async () => {
        const project = projectFolder(folder, 1);
        await writeFile(join(project, 'fresh-take.txt'), 'new');
        await mkdir(join(project, 'extras'));
        await expect(view.entry('fresh-take.txt')).toHaveCount(0);

        await view.refresh.click();

        await expect(view.entry('fresh-take.txt')).toBeVisible();
        await expect(view.entry('extras')).toBeVisible();
      });
    });

    test('US-0100 asks the operating system to open the project folder in the file manager', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox, {
        projects: [{ name: 'Harbor Audio' }, { name: 'Iron Film' }],
      });
      await stubFolderOpen(app.page);
      await openProjectFiles(ui, 'Iron Film');

      await test.step('requests the file manager for the folder of the viewed project', async () => {
        await ui.main.project.view.openFolder.click();

        await expect.poll(() => folderOpens(app.page)).toEqual([{ id: 2 }]);
        expect(existsSync(projectFolder(folder, 2))).toBe(true);
      });
    });
  });
});
