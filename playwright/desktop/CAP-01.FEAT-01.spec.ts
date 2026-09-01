import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';
import { openFromSplash, pickFromSplash } from '../scripts/flows.ts';
import { MISSING_FOLDER, NOT_A_FOLDER, NOT_WRITABLE } from '../scripts/messages.ts';
import { allowWrite, denyWrite } from '../scripts/permissions.ts';
// prettier-ignore
import { migrationKeys, readWorkspace, seedWorkspace,WORKSPACE_DB_FILE } from '../scripts/workspaces.ts';

test.describe('CAP-01 Workspace Management', () => {
  test.describe('FEAT-01 Workspace Creation', () => {
    test('US-0001 creates the workspace structure and lists it in the recent workspaces', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const folder = sandbox.workspace('novels');

      await test.step('creates the workspace database in the chosen folder and enters the workspace', async () => {
        await openFromSplash(ui, picker, folder);

        expect(existsSync(join(folder, WORKSPACE_DB_FILE))).toBe(true);
        expect(await readWorkspace(folder, (db) => db.migrations())).toEqual(await migrationKeys());
        const tables = await readWorkspace(folder, (db) => db.tables());
        expect(tables).toEqual(
          expect.arrayContaining(['sys_migration_history', 'ws_novels', 'ws_projects']),
        );
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual([]);
        await expect(ui.main.workspaceName).toHaveText('novels');
        await expect(ui.main.statusPath).toContainText(folder);
      });

      await test.step('lists the new workspace in the recent workspaces', async () => {
        await ui.main.openSwitchDialog();

        await expect(ui.main.switchDialog.panel).toBeVisible();
        await expect(ui.main.switchDialog.recent.rows).toHaveCount(1);
        await expect(ui.main.switchDialog.recent.rowAt(folder)).toBeVisible();
      });

      await test.step('keeps the workspace in the recent workspaces after the app restarts', async () => {
        await app.restart();

        await expect(ui.splash.root).toBeVisible();
        await expect(ui.splash.recent.rows).toHaveCount(1);
        await expect(ui.splash.recent.rowAt(folder)).toBeVisible();
      });
    });

    test('US-0002 rejects invalid or conflicting folders without leaving anything behind', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const missing = sandbox.workspace('missing');
      const file = sandbox.file('not-a-folder.txt');
      const readOnly = sandbox.workspace('read-only');
      const existing = sandbox.workspace('existing');
      await writeFile(file, 'keep me');
      await mkdir(readOnly, { recursive: true });
      await seedWorkspace(existing, { novels: [{ title: 'Existing Novel' }] });
      await mkdir(join(existing, 'drafts'), { recursive: true });
      await writeFile(join(existing, 'readme.txt'), 'my notes');
      await writeFile(join(existing, 'drafts', 'chapter.txt'), 'chapter one');

      await test.step('rejects a folder that does not exist and creates nothing', async () => {
        await pickFromSplash(ui, picker, missing);

        await expect(ui.splash.notice).toContainText(MISSING_FOLDER);
        await expect(ui.main.root).toBeHidden();
        await expect(ui.splash.firstRun).toBeVisible();
        expect(existsSync(missing)).toBe(false);
      });

      await test.step('rejects a path that is a file and leaves the file untouched', async () => {
        await pickFromSplash(ui, picker, file);

        await expect(ui.splash.notice).toContainText(NOT_A_FOLDER);
        await expect(ui.main.root).toBeHidden();
        await expect(ui.splash.firstRun).toBeVisible();
        expect(await readFile(file, 'utf8')).toBe('keep me');
        expect(existsSync(join(file, WORKSPACE_DB_FILE))).toBe(false);
      });

      await test.step('reports a folder without write permission and leaves no partial structure behind', async () => {
        await denyWrite(readOnly);
        try {
          await pickFromSplash(ui, picker, readOnly);

          await expect(ui.splash.notice).toContainText(NOT_WRITABLE);
          await expect(ui.main.root).toBeHidden();
          await expect(ui.splash.firstRun).toBeVisible();
        } finally {
          await allowWrite(readOnly);
        }
        expect(await readdir(readOnly)).toEqual([]);
      });

      await test.step('does not overwrite a workspace or files that already exist in the folder', async () => {
        await openFromSplash(ui, picker, existing);

        await expect(ui.main.workspaceName).toHaveText('existing');
        expect(await readWorkspace(existing, (db) => db.novelTitles())).toEqual(['Existing Novel']);
        expect(await readWorkspace(existing, (db) => db.migrations())).toEqual(
          await migrationKeys(),
        );
        expect(await readFile(join(existing, 'readme.txt'), 'utf8')).toBe('my notes');
        expect(await readFile(join(existing, 'drafts', 'chapter.txt'), 'utf8')).toBe('chapter one');
      });
    });
  });
});
