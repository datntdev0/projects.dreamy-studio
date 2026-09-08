import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { openTags, readLibrary, renameTagTo, selectTag, storedCount, TAG_DELETE_WARNING, TAG_MERGE_WARNING } from '../scripts/library.ts';

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-19 Tag Management', () => {
    test('US-0050 lists tags with per-kind counts by usage and filters them by keyword', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { tags } = await openTags(ui, picker, sandbox);

      await test.step('shows each tag with image, sound, video and prompt counts sorted by most used', async () => {
        await expect(tags.names).toHaveText(['forest', 'city', 'ocean', 'forest-night', 'zen']);
        await expect(tags.counts('forest')).toHaveText(['2', '1', '1', '1', '0']);
        await expect(tags.counts('city')).toHaveText(['2', '1', '1', '0', '0']);
        await expect(tags.counts('ocean')).toHaveText(['1', '1', '0', '1', '0']);
        await expect(tags.counts('forest-night')).toHaveText(['1', '0', '1', '0', '0']);
        await expect(tags.counts('zen')).toHaveText(['0', '0', '0', '1', '0']);
        await expect(tags.total('forest')).toHaveText('5');
        await expect(tags.total('zen')).toHaveText('1');
      });

      await test.step('shows only the tags containing the searched keyword', async () => {
        await tags.search.fill('forest');

        await expect(tags.names).toHaveText(['forest', 'forest-night']);
        await tags.search.fill('zzz');
        await expect(tags.rows).toHaveCount(0);
        await expect(tags.empty).toBeVisible();
      });
    });

    test('US-0051 renames a tag to a new name, merges into an existing tag after confirmation and keeps both when cancelled', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, tags } = await openTags(ui, picker, sandbox);

      await test.step('moves every asset carrying the old tag to the new unused name', async () => {
        await selectTag(ui, tags, 'ocean');

        await renameTagTo(tags, 'sea');

        await expect(tags.row('sea')).toBeVisible();
        await expect(tags.row('ocean')).toHaveCount(0);
        await expect(tags.counts('sea')).toHaveText(['1', '1', '0', '1', '0']);
        const library = await readLibrary(folder, (db) => ({
          tags: db.tags().map((row) => row.tag),
          imageB: db.image('img-b.png').tags,
          sound: db.sound('snd-a.wav').tags,
          prompt: db.prompt('pr-a').tags,
        }));
        expect(library.tags).not.toContain('ocean');
        expect(library.imageB).toEqual(['forest', 'sea']);
        expect(library.sound).toEqual(['city', 'forest', 'sea']);
        expect(library.prompt).toEqual(['forest', 'sea']);
      });

      await test.step('merges into the existing tag after confirmation, dropping the old tag without duplicates', async () => {
        await selectTag(ui, tags, 'forest-night');

        await renameTagTo(tags, 'city');

        await expect(ui.main.confirm.panel).toBeVisible();
        await expect(tags.confirmMessage).toContainText('forest-night');
        await expect(tags.confirmMessage).toContainText('city');
        await expect(ui.main.confirm.warning).toContainText(TAG_MERGE_WARNING);
        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.panel).toHaveCount(0);
        await expect(tags.row('forest-night')).toHaveCount(0);
        await expect(tags.counts('city')).toHaveText(['2', '1', '2', '0', '0']);
        const library = await readLibrary(folder, (db) => ({
          tags: db.tags(),
          imageC: db.image('img-c.png').tags,
          videoB: db.video('vid-b.mp4').tags,
          orphans: db.orphanTagCount(),
        }));
        expect(library.tags.map((row) => row.tag)).not.toContain('forest-night');
        expect(library.tags.find((row) => row.tag === 'city')?.counts).toEqual({
          image: 2,
          sound: 1,
          video: 2,
          prompt: 0,
        });
        expect(library.imageC).toEqual(['city']);
        expect(library.videoB).toEqual(['city']);
        expect(library.orphans).toBe(0);
      });

      await test.step('keeps both tags unchanged when the merge confirmation is cancelled', async () => {
        const before = await readLibrary(folder, (db) => db.tags());
        await selectTag(ui, tags, 'zen');

        await renameTagTo(tags, 'forest');

        await expect(ui.main.confirm.panel).toBeVisible();
        await ui.main.confirm.cancel.click();

        await expect(ui.main.confirm.panel).toHaveCount(0);
        await expect(tags.row('zen')).toBeVisible();
        await expect(tags.row('forest')).toBeVisible();
        expect(await readLibrary(folder, (db) => db.tags())).toEqual(before);
        expect(await readLibrary(folder, (db) => db.prompt('pr-b').tags)).toEqual(['zen']);
      });
    });

    test('US-0052 deletes a tag from every asset after confirmation and keeps the assets', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, tags } = await openTags(ui, picker, sandbox);
      const before = await readLibrary(folder, (db) => db.counts());

      await test.step('names the tag to delete and states it is removed from all assets using it', async () => {
        await selectTag(ui, tags, 'forest');

        await tags.panel.remove.click();

        await expect(ui.main.confirm.panel).toBeVisible();
        await expect(tags.confirmMessage).toContainText('forest');
        await expect(ui.main.confirm.warning).toContainText(TAG_DELETE_WARNING);
        await expect(ui.main.confirm.warning).toContainText('5');
      });

      await test.step('removes the tag from the library while the assets remain', async () => {
        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.panel).toHaveCount(0);
        await expect(tags.row('forest')).toHaveCount(0);
        await expect(tags.names).toHaveText(['city', 'ocean', 'forest-night', 'zen']);
        const library = await readLibrary(folder, (db) => ({
          tags: db.tags().map((row) => row.tag),
          counts: db.counts(),
          imageA: db.image('img-a.png').tags,
          sound: db.sound('snd-a.wav').tags,
          video: db.video('vid-a.mp4').tags,
          prompt: db.prompt('pr-a').tags,
        }));
        expect(library.tags).not.toContain('forest');
        expect(library.counts).toEqual(before);
        expect(library.imageA).toEqual(['city']);
        expect(library.sound).toEqual(['city', 'ocean']);
        expect(library.video).toEqual(['city']);
        expect(library.prompt).toEqual(['ocean']);
        expect(await storedCount(folder, 'image')).toBe(3);
        expect(await storedCount(folder, 'sound')).toBe(1);
        expect(await storedCount(folder, 'video')).toBe(2);
        expect(await storedCount(folder, 'prompt')).toBe(2);
      });
    });
  });
});
