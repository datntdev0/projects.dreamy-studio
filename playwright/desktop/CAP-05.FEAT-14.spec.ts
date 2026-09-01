import { LibraryBrowsingPage } from '../pages/library.ts';
import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { chooseFilterCollection, expectLibraryCounts, expectNames, expectTagPressed, openLibraryView, searchFor, showLibrarySection, sortBy, toggleFilterTag } from '../scripts/library.ts';

const COUNT_SEED = {
  images: [
    { name: 'Dawn', ext: 'png' },
    { name: 'Dusk', ext: 'png' },
    { name: 'Noon', ext: 'png' },
  ],
  sounds: [
    { name: 'Waves', ext: 'wav' },
    { name: 'Wind', ext: 'wav' },
  ],
  prompts: [{ name: 'Opening' }, { name: 'Closing' }],
};

const SEARCH_SEED = {
  images: [
    {
      name: 'Harbor Dawn',
      ext: 'png',
      tags: ['sea'],
      size: 300,
      createdAt: '2026-03-01T00:00:00.000Z',
    },
    {
      name: 'Market Night',
      ext: 'png',
      tags: ['lantern'],
      size: 100,
      createdAt: '2026-03-03T00:00:00.000Z',
    },
    {
      name: 'Pier Fog',
      ext: 'png',
      tags: ['harbor-walk'],
      size: 200,
      createdAt: '2026-03-02T00:00:00.000Z',
    },
    {
      name: 'Zebra Study',
      ext: 'png',
      tags: ['animal'],
      size: 400,
      createdAt: '2026-03-04T00:00:00.000Z',
    },
  ],
  prompts: [
    {
      name: 'Opening Scene',
      text: 'A quiet harbor at dawn',
      tags: ['intro'],
      createdAt: '2026-03-01T00:00:00.000Z',
    },
    {
      name: 'Closing Scene',
      text: 'Fireworks over the city skyline tonight',
      createdAt: '2026-03-03T00:00:00.000Z',
    },
    {
      name: 'Aria Voice',
      text: 'Low and calm',
      tags: ['harbor-talk'],
      createdAt: '2026-03-02T00:00:00.000Z',
    },
  ],
};

const FILTER_SEED = {
  collections: [{ name: 'Travel' }, { name: 'Work' }],
  images: [
    { name: 'Beach Sunset', ext: 'png', collection: 'Travel', tags: ['sunset', 'beach'] },
    { name: 'Hill Sunset', ext: 'png', collection: 'Travel', tags: ['sunset'] },
    { name: 'Office Sunset', ext: 'png', collection: 'Work', tags: ['sunset', 'beach'] },
    { name: 'Plain Beach', ext: 'png', tags: ['beach'] },
    { name: 'Snow Cabin', ext: 'png', collection: 'Work', tags: ['winter'] },
  ],
};

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-14 Asset Browsing', () => {
    test('US-0035 browses assets by kind and guides the upload when a kind is empty', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openLibraryView(ui, picker, sandbox, COUNT_SEED);
      const library = ui.main.library;
      const browsing = new LibraryBrowsingPage(library.page);

      await test.step('shows the image, sound, video and prompt counts and opens the list of each kind', async () => {
        await expectLibraryCounts(ui, { image: 3, sound: 2, video: 0, prompt: 2 });

        await showLibrarySection(ui, 'images');
        await expect(library.images.cards).toHaveCount(3);
        await showLibrarySection(ui, 'sounds');
        await expect(library.sounds.cards).toHaveCount(2);
        await showLibrarySection(ui, 'prompts');
        await expect(library.prompts.cards).toHaveCount(2);
        await showLibrarySection(ui, 'videos');
        await expect(library.videos.root).toBeVisible();
      });

      await test.step('shows the empty state with an upload route for a kind without assets', async () => {
        await expect(library.videos.empty).toBeVisible();
        await expect(library.videos.cards).toHaveCount(0);
        await expect(library.videos.emptyUpload).toBeVisible();

        await library.videos.emptyUpload.click();

        await expect(browsing.uploadDialog).toBeVisible();
        await browsing.uploadCancel.click();
        await expect(browsing.uploadDialog).toHaveCount(0);
      });
    });

    test('US-0036 searches assets by name, tag or prompt content and sorts them', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openLibraryView(ui, picker, sandbox, SEARCH_SEED, 'images');
      const images = ui.main.library.images;
      const prompts = ui.main.library.prompts;

      await test.step('shows only the assets whose name or tag matches the keyword and also prompts whose content matches', async () => {
        await expectNames(images, ['Zebra Study', 'Market Night', 'Pier Fog', 'Harbor Dawn']);

        await searchFor(images, 'harbor');
        await expectNames(images, ['Pier Fog', 'Harbor Dawn']);
        await searchFor(images, 'lantern');
        await expectNames(images, ['Market Night']);

        await showLibrarySection(ui, 'prompts');
        await searchFor(prompts, 'scene');
        await expectNames(prompts, ['Closing Scene', 'Opening Scene']);
        await searchFor(prompts, 'harbor');
        await expectNames(prompts, ['Aria Voice', 'Opening Scene']);
        await searchFor(prompts, 'fireworks');
        await expectNames(prompts, ['Closing Scene']);
      });

      await test.step('orders the list by newest, name or file size as chosen', async () => {
        await showLibrarySection(ui, 'images');
        await searchFor(images, '');

        await sortBy(images, 'name');
        await expectNames(images, ['Harbor Dawn', 'Market Night', 'Pier Fog', 'Zebra Study']);
        await sortBy(images, 'size');
        await expectNames(images, ['Zebra Study', 'Harbor Dawn', 'Pier Fog', 'Market Night']);
        await sortBy(images, 'new');
        await expectNames(images, ['Zebra Study', 'Market Night', 'Pier Fog', 'Harbor Dawn']);

        await showLibrarySection(ui, 'prompts');
        await searchFor(prompts, '');
        await sortBy(prompts, 'size');
        await expectNames(prompts, ['Closing Scene', 'Opening Scene', 'Aria Voice']);
        await sortBy(prompts, 'name');
        await expectNames(prompts, ['Aria Voice', 'Closing Scene', 'Opening Scene']);
        await sortBy(prompts, 'new');
        await expectNames(prompts, ['Closing Scene', 'Aria Voice', 'Opening Scene']);
      });
    });

    test('US-0037 filters assets by tags and a collection and restores the full list when cleared', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { ids } = await openLibraryView(ui, picker, sandbox, FILTER_SEED, 'images');
      const images = ui.main.library.images;
      const browsing = new LibraryBrowsingPage(ui.main.library.page);
      const all = ['Snow Cabin', 'Plain Beach', 'Office Sunset', 'Hill Sunset', 'Beach Sunset'];

      await test.step('shows only assets in the chosen collection that carry every selected tag', async () => {
        await expectNames(images, all);

        await toggleFilterTag(ui, 'sunset');
        await expectNames(images, ['Office Sunset', 'Hill Sunset', 'Beach Sunset']);
        await toggleFilterTag(ui, 'beach');
        await expectTagPressed(ui, ['sunset', 'beach']);
        await expectNames(images, ['Office Sunset', 'Beach Sunset']);
        await chooseFilterCollection(ui, ids.collections['Travel'] ?? 0);
        await expectNames(images, ['Beach Sunset']);
      });

      await test.step('reports no results and offers to clear the filters when nothing matches', async () => {
        await toggleFilterTag(ui, 'beach');
        await toggleFilterTag(ui, 'sunset');
        await toggleFilterTag(ui, 'winter');

        await expect(images.emptyFiltered).toBeVisible();
        await expect(images.cards).toHaveCount(0);
        await expect(browsing.emptyFilteredClear('image')).toBeVisible();
        await expect(images.empty).toHaveCount(0);
      });

      await test.step('shows the full list again after clearing the filters and keyword', async () => {
        await searchFor(images, 'cabin');
        await expect(images.emptyFiltered).toBeVisible();

        await browsing.emptyFilteredClear('image').click();

        await expectNames(images, all);
        await expect(images.search).toHaveValue('');
        await expect(ui.main.library.explorer.filterClear).toHaveCount(0);
        await expect(ui.main.library.explorer.filterCollection).toHaveValue('');
        await expect(browsing.tagChips('image')).toHaveCount(0);
      });
    });
  });
});
