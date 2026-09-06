import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { IMAGE_RENAMED, IMAGE_TAG_EXISTS, IMAGE_UPDATED, infoPanel, MAX_TAG_CHARS, openLibraryView, PROMPT_EMPTY_TEXT, readImageRow, readImageTags, readLibrary, readPromptRow, selectAsset, storedText } from '../scripts/library.ts';

const TWELVE_TAGS = [
  't01',
  't02',
  't03',
  't04',
  't05',
  't06',
  't07',
  't08',
  't09',
  't10',
  't11',
  't12',
];
const LONG_TAG = 'abcdefghijklmnopqrstuvwxyz0123456789';

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-16 Asset Information Management', () => {
    test('US-0042 edits an image name, rights and collection and keeps names unique per kind', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, ids } = await openLibraryView(
        ui,
        picker,
        sandbox,
        {
          collections: [{ name: 'Mood' }, { name: 'Archive' }],
          images: [
            { name: 'Harbor', collection: 'Archive' },
            { name: 'Dawn', rights: 'own', collection: 'Mood' },
          ],
        },
        'images',
      );
      const images = ui.main.library.images;
      const panel = await selectAsset(ui, 'image', 'Dawn');

      await test.step('saves the new name, rights and collection and reflects them in the list', async () => {
        await panel.rename('Sunrise');
        await expect(ui.main.toast(IMAGE_UPDATED)).toBeVisible();
        await panel.rights.selectOption('licensed');
        await panel.collection.selectOption(String(ids.collections['Archive']));
        await expect
          .poll(() => readImageRow(folder, ids.images['Dawn']))
          .toMatchObject({
            name: 'Sunrise',
            rights: 'licensed',
            collectionId: ids.collections['Archive'],
          });

        await images.listView.click();
        await expect(images.row('Sunrise')).toContainText('Archive');
        await expect(images.row('Dawn')).toHaveCount(0);
        await expect(panel.name).toHaveValue('Sunrise');
        await expect(panel.rights).toHaveValue('licensed');
        await expect(panel.collection).toHaveValue(String(ids.collections['Archive']));
      });

      await test.step('numbers the name when it matches another image of the same kind', async () => {
        await panel.rename('Harbor');

        await expect(ui.main.toast(IMAGE_RENAMED)).toBeVisible();
        const rows = await readLibrary(folder, (db) => db.images());
        const renamed = rows.find((row) => row.id === ids.images['Dawn']);
        expect(renamed?.name).not.toBe('Harbor');
        expect(renamed?.name).toMatch(/^Harbor/);
        expect(rows.find((row) => row.id === ids.images['Harbor'])?.name).toBe('Harbor');
        expect(new Set(rows.map((row) => row.name)).size).toBe(rows.length);
        await expect(panel.name).toHaveValue(renamed?.name ?? '');
        await expect(images.rows).toHaveCount(2);
      });

      await test.step('moves the image to unfiled when the collection is cleared', async () => {
        await panel.collection.selectOption('');

        await expect(panel.collection).toHaveValue('');
        await expect
          .poll(async () => (await readImageRow(folder, ids.images['Dawn']))?.collectionId)
          .toBeNull();
        expect((await readLibrary(folder, (db) => db.unfiled())).image).toBe(1);
        expect((await readLibrary(folder, (db) => db.collection('Archive'))).counts.image).toBe(1);
      });
    });

    test('US-0043 adds normalized tags, rejects invalid ones and removes a tag', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, ids } = await openLibraryView(
        ui,
        picker,
        sandbox,
        {
          images: [
            { name: 'Tagged', tags: ['red'] },
            { name: 'Full', tags: TWELVE_TAGS },
          ],
        },
        'images',
      );
      const panel = await selectAsset(ui, 'image', 'Tagged');

      await test.step('normalizes a valid tag to lowercase with hyphens, caps it at 24 characters and attaches it', async () => {
        await panel.addTag('  Night   Sky ');
        await expect(panel.tag('night-sky')).toBeVisible();
        await panel.addTag(LONG_TAG);
        await expect(panel.tags).toHaveCount(3);

        const stored = await readImageTags(folder, ids.images['Tagged'] as number);
        expect(stored).toContain('night-sky');
        expect(stored).toContain(LONG_TAG.slice(0, MAX_TAG_CHARS));
        expect(stored.every((tag) => tag.length <= MAX_TAG_CHARS)).toBe(true);
        await expect(panel.tagCount).toHaveText('3/12');
        await expect(panel.tagInput).toHaveValue('');
      });

      await test.step('rejects an empty tag, a duplicate tag and a thirteenth tag', async () => {
        const before = await readImageTags(folder, ids.images['Tagged'] as number);

        await panel.addTag('   ');
        await expect(panel.tags).toHaveCount(3);

        await panel.addTag('RED');
        await expect(ui.main.toast(IMAGE_TAG_EXISTS)).toBeVisible();
        await expect(panel.tags).toHaveCount(3);
        expect(await readImageTags(folder, ids.images['Tagged'] as number)).toEqual(before);

        const full = await selectAsset(ui, 'image', 'Full');
        await expect(full.tagCount).toHaveText('12/12');
        await expect(full.tagInput).toBeDisabled();
        await expect(full.tags).toHaveCount(12);
        expect(await readImageTags(folder, ids.images['Full'] as number)).toEqual(
          [...TWELVE_TAGS].sort(),
        );
      });

      await test.step('detaches a removed tag from the image', async () => {
        const tagged = await selectAsset(ui, 'image', 'Tagged');

        await tagged.removeTag('red').click();

        await expect(tagged.tag('red')).toHaveCount(0);
        await expect(tagged.tagCount).toHaveText('2/12');
        expect(await readImageTags(folder, ids.images['Tagged'] as number)).not.toContain('red');
        expect(await readImageTags(folder, ids.images['Tagged'] as number)).toContain('night-sky');
      });
    });

    test('US-0044 edits a prompt kind and content with variables re-detected and refuses empty content or name', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, ids } = await openLibraryView(
        ui,
        picker,
        sandbox,
        { prompts: [{ name: 'Scene', kind: 'image', text: 'Draw {{subject}} in {{style}}' }] },
        'prompts',
      );
      await ui.main.library.prompts.row('Scene').click();
      const panel = infoPanel(ui, 'prompt');
      await expect(panel.root).toBeVisible();
      await expect(panel.variables).toHaveText(['{{subject}}', '{{style}}']);
      const updated = 'Narrate {{voice}} about {{topic}} and {{voice}} again';

      await test.step('saves the new kind and content and re-detects the variables', async () => {
        await panel.promptKind.selectOption('video');
        await expect
          .poll(async () => (await readPromptRow(folder, ids.prompts['Scene']))?.kind)
          .toBe('video');
        await panel.setText(updated);

        await expect.poll(() => storedText(folder, ids.prompts['Scene'] as number)).toBe(updated);
        expect((await readPromptRow(folder, ids.prompts['Scene']))?.size).toBe(
          Buffer.byteLength(updated),
        );
        await expect(panel.variables).toHaveText(['{{voice}}', '{{topic}}']);
        await expect(panel.promptKind).toHaveValue('video');
      });

      await test.step('refuses empty content or an empty name and keeps the old values', async () => {
        await panel.setText('  ');
        await expect(ui.main.toast(PROMPT_EMPTY_TEXT)).toBeVisible();
        await expect(panel.promptText).toHaveValue(updated);
        expect(await storedText(folder, ids.prompts['Scene'] as number)).toBe(updated);

        await panel.blurName('');
        await expect(panel.name).toHaveValue('Scene');
        expect((await readPromptRow(folder, ids.prompts['Scene']))?.name).toBe('Scene');
        await expect(panel.variables).toHaveText(['{{voice}}', '{{topic}}']);
      });
    });
  });
});
