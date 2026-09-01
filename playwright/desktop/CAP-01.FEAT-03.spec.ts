import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Ui } from '../scripts/fixtures.ts';
// prettier-ignore
import { openFromSplash, pickFromSplash, rememberWorkspaces, switchFromMain, switchWorkspace } from '../scripts/flows.ts';
import { CORRUPT_DATA, NOT_READABLE, UPGRADE_FAILED } from '../scripts/messages.ts';
import { allowWrite, denyRead } from '../scripts/permissions.ts';
// prettier-ignore
import { migrationKeys, readWorkspace, seedBlockedUpgrade, seedWorkspace, WORKSPACE_DB_FILE, writeCorruptDatabase } from '../scripts/workspaces.ts';

async function expectOpened(ui: Ui, name: string, folder: string, novel: string): Promise<void> {
  await expect(ui.main.workspaceName).toHaveText(name);
  await expect(ui.main.statusPath).toContainText(folder);
  await ui.main.showNovels();
  await expect(ui.main.novelRows).toHaveCount(1);
  await expect(ui.main.novelRows.first()).toContainText(novel);
}

test.describe('CAP-01 Workspace Management', () => {
  test.describe('FEAT-03 Workspace Opening', () => {
    test('US-0006 opens a workspace from the folder dialog or the recent list with its own data', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const first = sandbox.workspace('first');
      const second = sandbox.workspace('second');
      await seedWorkspace(first, { novels: [{ title: 'First Novel' }] });
      await seedWorkspace(second, { novels: [{ title: 'Second Novel' }] });

      await test.step('opens a folder picked from the folder dialog', async () => {
        await openFromSplash(ui, picker, first);

        await expectOpened(ui, 'first', first, 'First Novel');
      });

      await test.step('opens a workspace chosen from the recent list in the switch dialog', async () => {
        await switchWorkspace(ui, picker, second);
        await expectOpened(ui, 'second', second, 'Second Novel');

        await ui.main.openSwitchDialog();
        await ui.main.switchDialog.recent.openAt(first).click();

        await expect(ui.main.workspaceName).toHaveText('first');
        await expectOpened(ui, 'first', first, 'First Novel');
      });

      await test.step('opens a workspace chosen from the recent list on the splash screen', async () => {
        await app.restart();
        await expect(ui.splash.root).toBeVisible();

        await ui.splash.recent.openAt(second).click();
        await expect(ui.main.root).toBeVisible();

        await expectOpened(ui, 'second', second, 'Second Novel');
      });
    });

    test('US-0007 rejects invalid folders with a reason and leaves nothing changed', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const vanished = sandbox.workspace('vanished');
      const corrupt = sandbox.workspace('corrupt');
      const locked = sandbox.workspace('locked');
      const current = sandbox.workspace('working');
      await rememberWorkspaces(ui, app, picker, [vanished]);
      await app.stop();
      await rm(vanished, { recursive: true, force: true });
      await app.start();
      await writeCorruptDatabase(corrupt);
      await seedWorkspace(locked, { novels: [{ title: 'Locked Novel' }] });

      await test.step('flags a recent workspace whose folder no longer exists and cannot open it', async () => {
        await expect(ui.splash.recent.notFoundBadgeAt(vanished)).toBeVisible();
        await expect(ui.splash.recent.notFoundReasonAt(vanished)).not.toBeEmpty();
        await expect(ui.splash.recent.openAt(vanished)).toHaveCount(0);
      });

      await test.step('rejects a folder whose workspace database is corrupt and does not modify it', async () => {
        const before = await readFile(join(corrupt, WORKSPACE_DB_FILE));

        await pickFromSplash(ui, picker, corrupt);

        await expect(ui.splash.notice).toContainText(CORRUPT_DATA);
        await expect(ui.main.root).toBeHidden();
        expect((await readFile(join(corrupt, WORKSPACE_DB_FILE))).equals(before)).toBe(true);
      });

      await test.step('rejects a folder the user cannot read and leaves it untouched', async () => {
        await denyRead(locked);
        try {
          await pickFromSplash(ui, picker, locked);

          await expect(ui.splash.notice).toContainText(NOT_READABLE);
          await expect(ui.main.root).toBeHidden();
        } finally {
          await allowWrite(locked);
        }
        expect(await readWorkspace(locked, (db) => db.novelTitles())).toEqual(['Locked Novel']);
      });

      await test.step('stays in the current workspace when switching to an invalid folder fails', async () => {
        await seedWorkspace(current, { novels: [{ title: 'Work In Progress' }] });
        await openFromSplash(ui, picker, current);

        await switchFromMain(ui, picker, corrupt);

        await expect(ui.main.switchNotice).toContainText(CORRUPT_DATA);
        await expect(ui.main.root).toBeVisible();
        await expectOpened(ui, 'working', current, 'Work In Progress');
      });
    });

    test('US-0008 prepares the data before entering and refuses a workspace that fails to upgrade', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const stuck = sandbox.workspace('stuck');
      const older = sandbox.workspace('older');
      const keys = await migrationKeys();
      const oldest = keys.slice(0, 2);
      await seedBlockedUpgrade(stuck);
      await seedWorkspace(older, { upTo: oldest[1], novels: [{ title: 'Old Novel' }] });
      const stuckBefore = await readWorkspace(stuck, (db) => db.migrations());

      await test.step('reports a failed upgrade, does not enter the workspace and rolls the data back', async () => {
        await pickFromSplash(ui, picker, stuck);

        await expect(ui.splash.notice).toContainText(UPGRADE_FAILED);
        await expect(ui.splash.root).toBeVisible();
        await expect(ui.main.root).toBeHidden();
        expect(await readWorkspace(stuck, (db) => db.migrations())).toEqual(stuckBefore);
        expect(await readWorkspace(stuck, (db) => db.novelTitles())).toEqual(['Before Upgrade']);
      });

      await test.step('upgrades an older workspace before entering it and keeps its data', async () => {
        expect(await readWorkspace(older, (db) => db.migrations())).toEqual(oldest);

        await openFromSplash(ui, picker, older);

        await expectOpened(ui, 'older', older, 'Old Novel');
        expect(await readWorkspace(older, (db) => db.migrations())).toEqual(keys);
        expect(await readWorkspace(older, (db) => db.novelTitles())).toEqual(['Old Novel']);
      });
    });
  });
});
