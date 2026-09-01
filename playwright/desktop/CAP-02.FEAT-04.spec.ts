import { expect, test } from '../scripts/fixtures.ts';
import { NOVEL_CREATED } from '../scripts/messages.ts';
import { openLibrary, showNovelList } from '../scripts/novels.ts';
import { readWorkspace } from '../scripts/workspaces.ts';

const TITLE = 'Gió Muộn Trên Đồi Thông';
const TITLE_TOO_LONG = 'x'.repeat(201);

test.describe('CAP-02 Content Source Management', () => {
  test.describe('FEAT-04 Novel Creation', () => {
    test('US-0009 creates a novel without chapters and lists it', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openLibrary(ui, picker, sandbox);
      await showNovelList(ui);

      await test.step('creates the novel with the author, language, description and tags that were entered', async () => {
        await ui.main.novels.createButton.click();
        await expect(ui.main.createDialog.panel).toBeVisible();
        await ui.main.createDialog.title.fill(TITLE);
        await ui.main.createDialog.name.fill('Gió Muộn');
        await ui.main.createDialog.author.fill('Lan Anh');
        await ui.main.createDialog.lang.selectOption('JA');
        await ui.main.createDialog.tags.fill('Fantasy, Dark Harbor');
        await ui.main.createDialog.description.fill('A quiet harbor town.');
        await ui.main.createDialog.submit.click();

        await expect(ui.main.createDialog.panel).toBeHidden();
        await expect(ui.main.toast(NOVEL_CREATED)).toBeVisible();
        const novels = await readWorkspace(folder, (db) => db.novels());
        expect(novels).toHaveLength(1);
        expect(novels[0]).toMatchObject({
          title: TITLE,
          name: 'Gió Muộn',
          author: 'Lan Anh',
          lang: 'JA',
          description: 'A quiet harbor town.',
          origin: 'created',
        });
        expect(await readWorkspace(folder, (db) => db.tags(TITLE))).toEqual([
          'dark-harbor',
          'fantasy',
        ]);
        expect(await readWorkspace(folder, (db) => db.chapters(TITLE))).toEqual([]);
      });

      await test.step('shows the new novel in the novel list', async () => {
        await expect(ui.main.novels.empty).toBeHidden();
        await expect(ui.main.novels.cards).toHaveCount(1);
        await expect(ui.main.novels.card('Gió Muộn')).toBeVisible();
        await expect(ui.main.novels.count).toContainText('1');
        await expect(ui.main.explorer.novel('Gió Muộn')).toBeVisible();
      });
    });

    test('US-0010 rejects an empty or overlong title and creates nothing', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openLibrary(ui, picker, sandbox);
      await showNovelList(ui);
      await ui.main.novels.createButton.click();
      await expect(ui.main.createDialog.panel).toBeVisible();

      await test.step('refuses an empty title or a title longer than 200 characters, flags the title field and creates no novel', async () => {
        await ui.main.createDialog.title.fill('   ');
        await ui.main.createDialog.submit.click();

        await expect(ui.main.createDialog.titleError).toBeVisible();
        await expect(ui.main.createDialog.panel).toBeVisible();
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual([]);

        await ui.main.createDialog.title.fill(TITLE_TOO_LONG);
        await ui.main.createDialog.submit.click();

        await expect(ui.main.createDialog.titleError).toBeVisible();
        await expect(ui.main.createDialog.panel).toBeVisible();
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual([]);
        await expect(ui.main.novels.cards).toHaveCount(0);
      });
    });
  });
});
