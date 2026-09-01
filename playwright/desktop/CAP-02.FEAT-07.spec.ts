import { expect, test } from '../scripts/fixtures.ts';
import { switchWorkspace } from '../scripts/flows.ts';
import { fraction, openLibrary, showNovelList } from '../scripts/novels.ts';
import { type SeedNovel, seedWorkspace } from '../scripts/workspaces.ts';

const PROGRESS_NOVELS: SeedNovel[] = [
  {
    title: 'Harbor Lights',
    chapters: [
      {
        title: 'The Harbor Wakes',
        paragraphs: ['The harbor wakes slowly.', 'Gulls circle the pier.'],
        translated: true,
      },
      { title: 'Fog', paragraphs: ['Morning fog lifts.'], analyzed: true },
    ],
  },
  { title: 'Iron Garden', chapters: [{ title: 'Rust', paragraphs: ['Rust blooms.'] }] },
  { title: 'Silent Sea' },
];

const SEARCH_NOVELS: SeedNovel[] = [
  { title: 'Harbor Lights', author: 'Mai Tran', lang: 'VI', tags: ['light', 'sea'] },
  { title: 'Iron Garden', author: 'Lee Min', lang: 'KO', tags: ['sea', 'steel'] },
  { title: 'Silent Sea', author: 'Tran Bao', lang: 'EN', tags: ['dark', 'sea'] },
  { title: 'Lantern Road', name: 'Đèn Lồng', author: 'Sun Wei', lang: 'ZH', tags: ['light'] },
];

test.describe('CAP-02 Content Source Management', () => {
  test.describe('FEAT-07 Novel Browsing', () => {
    test('US-0016 browses every novel as a grid or a table with its figures and shows an empty state', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openLibrary(ui, picker, sandbox, PROGRESS_NOVELS);
      await showNovelList(ui);

      await test.step('shows the novels as a grid or a table with the counts, words and translation and analysis progress', async () => {
        await ui.main.novels.gridView.click();
        await expect(ui.main.novels.grid).toBeVisible();
        await expect(ui.main.novels.cards).toHaveCount(3);
        await expect(ui.main.novels.count).toContainText('3');
        await expect(
          ui.main.novels.card('Harbor Lights').getByTestId('novel-progress-frac').nth(0),
        ).toHaveText(fraction(1, 2));
        await expect(
          ui.main.novels.card('Harbor Lights').getByTestId('novel-progress-frac').nth(1),
        ).toHaveText(fraction(1, 2));

        await ui.main.novels.tableView.click();

        await expect(ui.main.novels.table).toBeVisible();
        await expect(ui.main.novels.grid).toBeHidden();
        await expect(ui.main.novels.rows).toHaveCount(3);
        const harbor = ui.main.novels.row('Harbor Lights');
        await expect(harbor.locator('td').nth(2)).toHaveText('2');
        await expect(harbor.locator('td').nth(3)).toHaveText('11');
        await expect(harbor.getByTestId('novel-progress-frac').nth(0)).toHaveText(fraction(1, 2));
        await expect(harbor.getByTestId('novel-progress-frac').nth(1)).toHaveText(fraction(1, 2));
        await expect(
          ui.main.novels.row('Iron Garden').getByTestId('novel-progress-frac').nth(0),
        ).toHaveText(fraction(0, 1));
        await expect(ui.main.novels.row('Silent Sea').locator('td').nth(2)).toHaveText('0');

        await ui.main.novels.gridView.click();
        await expect(ui.main.novels.cards).toHaveCount(3);
      });

      await test.step('shows an empty state with a way to create or import a novel in a workspace without novels', async () => {
        const empty = sandbox.workspace('empty');
        await seedWorkspace(empty);
        await switchWorkspace(ui, picker, empty);
        await showNovelList(ui);

        await expect(ui.main.novels.empty).toBeVisible();
        await expect(ui.main.novels.cards).toHaveCount(0);
        await expect(ui.main.novels.emptyCreate).toBeVisible();
        await expect(ui.main.novels.emptyImport).toBeVisible();
      });
    });

    test('US-0017 searches by keyword and filters by tags and languages', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openLibrary(ui, picker, sandbox, SEARCH_NOVELS);
      await showNovelList(ui);
      await ui.main.novels.gridView.click();
      await expect(ui.main.novels.cards).toHaveCount(4);

      await test.step('shows only the novels whose title, name or author match the keyword', async () => {
        await ui.main.novels.search.fill('garden');
        await expect(ui.main.novels.cards).toHaveCount(1);
        await expect(ui.main.novels.card('Iron Garden')).toBeVisible();

        await ui.main.novels.search.fill('tran');
        await expect(ui.main.novels.cards).toHaveCount(2);
        await expect(ui.main.novels.card('Harbor Lights')).toBeVisible();
        await expect(ui.main.novels.card('Silent Sea')).toBeVisible();

        await ui.main.novels.search.fill('đèn');
        await expect(ui.main.novels.cards).toHaveCount(1);
        await expect(ui.main.novels.card('Đèn Lồng')).toBeVisible();
        await ui.main.novels.search.fill('');
        await expect(ui.main.novels.cards).toHaveCount(4);
      });

      await test.step('shows only the novels with every selected tag and in any selected language', async () => {
        await ui.main.explorer.tag('sea').click();
        await expect(ui.main.novels.cards).toHaveCount(3);

        await ui.main.explorer.lang('VI').click();
        await ui.main.explorer.lang('KO').click();
        await expect(ui.main.novels.cards).toHaveCount(2);
        await expect(ui.main.novels.card('Harbor Lights')).toBeVisible();
        await expect(ui.main.novels.card('Iron Garden')).toBeVisible();
        await expect(ui.main.novels.card('Silent Sea')).toBeHidden();

        await ui.main.explorer.tag('steel').click();
        await expect(ui.main.novels.cards).toHaveCount(1);
        await expect(ui.main.novels.card('Iron Garden')).toBeVisible();
      });

      await test.step('shows the full list again once the keyword and filters are cleared', async () => {
        await ui.main.novels.search.fill('zzz');
        await expect(ui.main.novels.noMatch).toBeVisible();

        await ui.main.novels.noMatchClear.click();

        await expect(ui.main.novels.cards).toHaveCount(4);
        await expect(ui.main.novels.search).toHaveValue('');
        await expect(ui.main.novels.chips).toBeHidden();

        await ui.main.explorer.tag('sea').click();
        await expect(ui.main.novels.cards).toHaveCount(3);
        await ui.main.novels.clearFilters.click();
        await expect(ui.main.novels.cards).toHaveCount(4);
      });
    });
  });
});
