import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';
import { DELETE_WARNING, NOVEL_DELETED } from '../scripts/messages.ts';
import { openLibrary, PNG_BYTES, selectNovel, showNovelList } from '../scripts/novels.ts';
import { readWorkspace } from '../scripts/workspaces.ts';

test.describe('CAP-02 Content Source Management', () => {
  test.describe('FEAT-09 Novel Deletion', () => {
    test('US-0021 deletes a novel only after a confirmation that names it and warns about the consequences', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openLibrary(ui, picker, sandbox, [
        {
          title: 'Harbor Lights',
          name: 'Harbor',
          author: 'Mai Tran',
          chapters: [{ title: 'One' }, { title: 'Two' }],
          cover: PNG_BYTES,
        },
        { title: 'Iron Garden', chapters: [{ title: 'Rust' }] },
      ]);
      await showNovelList(ui);
      await selectNovel(ui, 'Harbor');

      await test.step('names the novel to delete and warns about the consequences in the confirmation dialog', async () => {
        await ui.main.panel.remove.click();

        await expect(ui.main.confirm.panel).toBeVisible();
        await expect(ui.main.confirm.names).toHaveText(['Harbor']);
        await expect(ui.main.confirm.metas).toContainText('2');
        await expect(ui.main.confirm.warning).toContainText(DELETE_WARNING);
      });

      await test.step('deletes the novel and its content from the workspace and reports the result when confirmed', async () => {
        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(ui.main.toast(NOVEL_DELETED)).toContainText('Harbor');
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual(['Iron Garden']);
        expect(await readWorkspace(folder, (db) => db.chapterCount())).toBe(1);
        expect(existsSync(join(folder, 'novels', '1'))).toBe(false);
        expect(existsSync(join(folder, 'novels', '2'))).toBe(true);
        await expect(ui.main.novels.cards).toHaveCount(1);
        await expect(ui.main.novels.card('Harbor')).toHaveCount(0);
      });

      await test.step('changes nothing when the confirmation is cancelled', async () => {
        await selectNovel(ui, 'Iron Garden');
        await ui.main.panel.remove.click();
        await expect(ui.main.confirm.panel).toBeVisible();

        await ui.main.confirm.cancel.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual(['Iron Garden']);
        expect(await readWorkspace(folder, (db) => db.chapterCount())).toBe(1);
        expect(existsSync(join(folder, 'novels', '2'))).toBe(true);
        await expect(ui.main.novels.card('Iron Garden')).toBeVisible();
      });
    });
  });
});
