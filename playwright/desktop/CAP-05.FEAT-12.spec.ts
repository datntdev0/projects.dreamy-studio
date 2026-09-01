import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { assetNames, assetRows, BADGE_DONE, BADGE_ERROR, BADGE_INVALID, BADGE_RENAME, BADGE_VALID, CHECK_DUPLICATE_BY_KIND, CHECK_EMPTY, CHECK_NOT_FOUND, CHECK_TOO_LARGE_BY_KIND, CHECK_UNSUPPORTED_BY_KIND, closeUploadDialog, DROP_TITLE_BY_KIND, dropFiles, DROPZONE_LABEL_BY_KIND, expectLibraryCounts, fillUploadForm, MAX_BYTES, openLibraryView, openUploadDialog, pickIntoDialog, readLibrary, sectionOf, showLibraryCollection, showLibrarySection, stageCheapAsset, stageCorruptAsset, stageEmptyAsset, stageFile, stageImage, stageRealAsset, stageSizedAsset, storedCount, storedFiles, UNSUPPORTED_NAMES, UPLOAD_CLOSE_BY_KIND, UPLOAD_EXTENSIONS, UPLOAD_KINDS, UPLOAD_PARTIAL_BY_KIND, UPLOAD_SUCCESS_BY_KIND, UPLOAD_TITLE_BY_KIND, uploadSubmitLabel, writeSampleSound, writeSampleVideo } from '../scripts/library.ts';

const SEEDED_COUNTS = { image: 1, sound: 1, video: 1, prompt: 0 };

const SEED = {
  collections: [{ name: 'Moodboard' }],
  images: [{ name: 'taken.png', rights: 'free' as const, tags: ['old'], width: 50, height: 40 }],
  sounds: [{ name: 'taken.wav', rights: 'free' as const, tags: ['old'] }],
  videos: [{ name: 'taken.mp4', rights: 'free' as const, tags: ['old'] }],
};

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-12 Asset Upload', () => {
    test('US-0029 inspects every selected file before upload', async ({ ui, picker, sandbox }) => {
      const { folder } = await openLibraryView(ui, picker, sandbox, SEED);

      await test.step('shows an individual valid status for each file chosen with the picker or dropped on the dialog', async () => {
        for (const kind of UPLOAD_KINDS) {
          const ext = UPLOAD_EXTENSIONS[kind];
          const dialog = await openUploadDialog(ui, kind);
          await expect(dialog.title).toHaveText(UPLOAD_TITLE_BY_KIND[kind]);
          await expect(dialog.closeButton).toHaveAttribute(
            'aria-label',
            UPLOAD_CLOSE_BY_KIND[kind],
          );
          await expect(dialog.dropzone).toHaveAttribute('aria-label', DROPZONE_LABEL_BY_KIND[kind]);
          await expect(dialog.dropzoneTitle).toHaveText(DROP_TITLE_BY_KIND[kind]);
          const picked = [
            await stageCheapAsset(sandbox, kind, `fresh-1.${ext}`),
            await stageCheapAsset(sandbox, kind, `fresh-2.${ext}`),
          ];
          const dropped = await stageCheapAsset(sandbox, kind, `fresh-3.${ext}`);

          await pickIntoDialog(ui, picker, kind, picked);
          await expect(dialog.rows).toHaveCount(2);
          await expect(dialog.badge(`fresh-1.${ext}`)).toHaveText(BADGE_VALID);
          await expect(dialog.badge(`fresh-2.${ext}`)).toHaveText(BADGE_VALID);

          await dropFiles(ui, [dropped]);
          await expect(dialog.rows).toHaveCount(3);
          await expect(dialog.badge(`fresh-3.${ext}`)).toHaveText(BADGE_VALID);
          await expect(dialog.badge(`fresh-1.${ext}`)).toHaveText(BADGE_VALID);
          await dialog.rights.selectOption('own');
          await expect(dialog.submit).toHaveText(uploadSubmitLabel(kind, 3));
          await expect(dialog.size(`fresh-3.${ext}`)).not.toBeEmpty();
          await closeUploadDialog(ui);
        }
      });

      await test.step('marks wrong-format, empty, unreadable and oversized files invalid with a reason and keeps them out of the upload', async () => {
        for (const kind of UPLOAD_KINDS) {
          const ext = UPLOAD_EXTENSIONS[kind];
          const dialog = await openUploadDialog(ui, kind);
          const unsupported = await stageFile(
            sandbox,
            UNSUPPORTED_NAMES[kind],
            'not a supported format',
          );
          const empty = await stageEmptyAsset(sandbox, `empty.${ext}`);
          const huge = await stageSizedAsset(sandbox, kind, `huge.${ext}`, MAX_BYTES[kind] + 1);
          const limit = await stageSizedAsset(sandbox, kind, `limit.${ext}`, MAX_BYTES[kind]);
          const ghost = sandbox.file(`ghost.${ext}`);

          await dropFiles(ui, [unsupported, empty, huge, ghost, limit]);

          await expect(dialog.rows).toHaveCount(5);
          for (const name of [
            UNSUPPORTED_NAMES[kind],
            `empty.${ext}`,
            `huge.${ext}`,
            `ghost.${ext}`,
          ]) {
            await expect(dialog.badge(name)).toHaveText(BADGE_INVALID);
            await expect(dialog.message(name)).not.toBeEmpty();
          }
          await expect(dialog.message(`empty.${ext}`)).toHaveText(CHECK_EMPTY);
          await expect(dialog.message(`ghost.${ext}`)).toHaveText(CHECK_NOT_FOUND);
          await expect(dialog.badge(`limit.${ext}`)).toHaveText(BADGE_VALID);
          await expect(dialog.message(UNSUPPORTED_NAMES[kind])).toContainText(
            CHECK_UNSUPPORTED_BY_KIND[kind],
          );
          await expect(dialog.message(`huge.${ext}`)).toHaveText(CHECK_TOO_LARGE_BY_KIND[kind]);

          await dialog.rights.selectOption('own');
          await expect(dialog.submit).toBeEnabled();
          await expect(dialog.submit).toHaveText(uploadSubmitLabel(kind, 1));
          await closeUploadDialog(ui);
          expect(await readLibrary(folder, (db) => db.counts())).toEqual(SEEDED_COUNTS);
        }
      });

      await test.step('marks a file sharing its name with an existing same-kind asset as rename instead of rejecting it', async () => {
        for (const kind of UPLOAD_KINDS) {
          const ext = UPLOAD_EXTENSIONS[kind];
          const dialog = await openUploadDialog(ui, kind);
          const taken = await stageCheapAsset(sandbox, kind, `taken.${ext}`);
          const unique = await stageCheapAsset(sandbox, kind, `unique.${ext}`);

          await dropFiles(ui, [taken, unique]);

          await expect(dialog.rows).toHaveCount(2);
          await expect(dialog.badge(`taken.${ext}`)).toHaveText(BADGE_RENAME);
          await expect(dialog.message(`taken.${ext}`)).not.toBeEmpty();
          await expect(dialog.badge(`unique.${ext}`)).toHaveText(BADGE_VALID);
          await expect(dialog.message(`taken.${ext}`)).toHaveText(CHECK_DUPLICATE_BY_KIND[kind]);
          await dialog.rights.selectOption('own');
          await expect(dialog.submit).toBeEnabled();
          await expect(dialog.submit).toHaveText(uploadSubmitLabel(kind, 2));
          await closeUploadDialog(ui);
        }
      });
    });

    test('US-0030 declares rights, tags and collection when uploading', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, ids } = await openLibraryView(ui, picker, sandbox, SEED);

      await test.step('keeps the confirm button disabled until usage rights are chosen', async () => {
        for (const kind of UPLOAD_KINDS) {
          const name = `fresh.${UPLOAD_EXTENSIONS[kind]}`;
          const dialog = await openUploadDialog(ui, kind);
          await dropFiles(ui, [await stageCheapAsset(sandbox, kind, name)]);

          await expect(dialog.badge(name)).toHaveText(BADGE_VALID);
          await expect(dialog.rights).toHaveValue('');
          await expect(dialog.submit).toBeDisabled();

          await dialog.rights.selectOption('own');
          await expect(dialog.submit).toBeEnabled();
          await closeUploadDialog(ui);
        }
        expect(await readLibrary(folder, (db) => db.counts())).toEqual(SEEDED_COUNTS);
      });

      await test.step('adds each valid file with the chosen rights, tags, existing or new collection and measured info', async () => {
        const sky = await stageImage(sandbox, 'sky.png', { width: 320, height: 200 });
        const sea = await stageImage(sandbox, 'sea.jpg', { width: 128, height: 96 });
        const tone = sandbox.file('tone.wav');
        const scene = sandbox.file('scene.mp4');
        await writeSampleSound(tone, 2);
        await writeSampleVideo(scene, 2, '320x180');

        const images = await openUploadDialog(ui, 'image');
        await dropFiles(ui, [sky, sea]);
        await expect(images.rows).toHaveCount(2);
        await fillUploadForm(images, {
          rights: 'licensed',
          tags: 'Sky, Blue Sea',
          collection: 'Moodboard',
        });
        await images.submit.click();
        await expect(ui.main.toast(UPLOAD_SUCCESS_BY_KIND.image).last()).toBeVisible();
        await expect(images.root).toBeHidden();

        const sounds = await openUploadDialog(ui, 'sound');
        await dropFiles(ui, [tone]);
        await expect(sounds.badge('tone.wav')).toHaveText(BADGE_VALID);
        await fillUploadForm(sounds, {
          rights: 'free',
          tags: 'ambient',
          newCollection: 'Fresh Sounds',
        });
        await sounds.submit.click();
        await expect(ui.main.toast(UPLOAD_SUCCESS_BY_KIND.sound).last()).toBeVisible();
        await expect(sounds.root).toBeHidden();

        const videos = await openUploadDialog(ui, 'video');
        await dropFiles(ui, [scene]);
        await expect(videos.badge('scene.mp4')).toHaveText(BADGE_VALID);
        await fillUploadForm(videos, {
          rights: 'other',
          tags: 'intro, b-roll',
          collection: 'Moodboard',
        });
        await videos.submit.click();
        await expect(ui.main.toast(UPLOAD_SUCCESS_BY_KIND.video).last()).toBeVisible();
        await expect(videos.root).toBeHidden();

        const library = await readLibrary(folder, (db) => ({
          sky: db.image('sky.png'),
          sea: db.image('sea.jpg'),
          tone: db.sound('tone.wav'),
          scene: db.video('scene.mp4'),
          fresh: db.collection('Fresh Sounds'),
          counts: db.counts(),
        }));
        expect(library.counts).toEqual({ image: 3, sound: 2, video: 2, prompt: 0 });
        expect(library.sky).toMatchObject({
          rights: 'licensed',
          origin: 'upload',
          collectionId: ids.collections['Moodboard'],
          tags: ['blue-sea', 'sky'],
          width: 320,
          height: 200,
        });
        expect(library.sea).toMatchObject({
          rights: 'licensed',
          collectionId: ids.collections['Moodboard'],
          tags: ['blue-sea', 'sky'],
          width: 128,
          height: 96,
        });
        expect(library.tone).toMatchObject({
          rights: 'free',
          collectionId: library.fresh.id,
          tags: ['ambient'],
        });
        expect(library.tone.durationMs).toBeGreaterThan(1900);
        expect(library.tone.durationMs).toBeLessThan(2200);
        expect(library.scene).toMatchObject({
          rights: 'other',
          collectionId: ids.collections['Moodboard'],
          tags: ['b-roll', 'intro'],
          width: 320,
          height: 180,
        });
        expect(library.scene.durationMs).toBeGreaterThan(1800);
        expect(library.scene.durationMs).toBeLessThan(2400);

        await expectLibraryCounts(ui, { image: 3, sound: 2, video: 2, prompt: 0 });
        await showLibrarySection(ui, 'images');
        await expect(ui.main.library.images.card('sky.png')).toContainText('320×200');
        await expect(ui.main.library.images.card('sea.jpg')).toContainText('128×96');
        await expect(ui.main.library.explorer.collectionNamed('Fresh Sounds')).toBeVisible();
        await showLibraryCollection(ui, ids.collections['Moodboard']);
        await expect(ui.main.library.collection.cards).toHaveCount(3);
        await showLibraryCollection(ui, library.fresh.id);
        await expect(ui.main.library.collection.cards).toHaveCount(1);
      });

      await test.step('gives a file sharing a same-kind name a numbered name and leaves the old asset unchanged', async () => {
        for (const kind of UPLOAD_KINDS) {
          const ext = UPLOAD_EXTENSIONS[kind];
          const before = await readLibrary(folder, (db) =>
            assetRows(db, kind).find((row) => row.name === `taken.${ext}`),
          );
          const dialog = await openUploadDialog(ui, kind);
          await dropFiles(ui, [await stageRealAsset(sandbox, kind, `taken.${ext}`)]);
          await expect(dialog.badge(`taken.${ext}`)).toHaveText(BADGE_RENAME);

          await fillUploadForm(dialog, { rights: 'own', tags: 'newer' });
          await dialog.submit.click();
          await expect(dialog.root).toBeHidden();

          const after = await readLibrary(folder, (db) => assetRows(db, kind));
          const numbered = after.find((row) => row.name === `taken (2).${ext}`);
          expect(after.find((row) => row.name === `taken.${ext}`)).toEqual(before);
          expect(numbered).toMatchObject({ rights: 'own', origin: 'upload', tags: ['newer'] });
          expect(numbered?.id).not.toBe(before?.id);
          await showLibrarySection(ui, sectionOf(kind));
          await expect(ui.main.library.section(kind).card(`taken (2).${ext}`)).toBeVisible();
          await expect(ui.main.library.section(kind).card(`taken.${ext}`)).toHaveCount(1);
        }
      });
    });

    test('US-0031 keeps successful files and reports failed ones without partial assets', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder } = await openLibraryView(ui, picker, sandbox);

      await test.step('keeps the successful files, shows the reason of each failed file and summarizes the counts', async () => {
        for (const kind of UPLOAD_KINDS) {
          const ext = UPLOAD_EXTENSIONS[kind];
          const dialog = await openUploadDialog(ui, kind);
          const good1 = await stageRealAsset(sandbox, kind, `good-1.${ext}`);
          const good2 = await stageRealAsset(sandbox, kind, `good-2.${ext}`);
          const broken1 = await stageCorruptAsset(sandbox, `broken-1.${ext}`);
          const broken2 = await stageCorruptAsset(sandbox, `broken-2.${ext}`);

          await pickIntoDialog(ui, picker, kind, [good1, broken1, good2, broken2]);
          await expect(dialog.rows).toHaveCount(4);
          await expect(dialog.badge(`broken-1.${ext}`)).toHaveText(BADGE_VALID);
          await fillUploadForm(dialog, { rights: 'own', tags: 'mixed' });
          await dialog.submit.click();

          await expect(ui.main.toast(UPLOAD_PARTIAL_BY_KIND[kind]).last()).toBeVisible();
          for (const name of [`good-1.${ext}`, `good-2.${ext}`]) {
            await expect(dialog.badge(name)).toHaveText(BADGE_DONE);
          }
          for (const name of [`broken-1.${ext}`, `broken-2.${ext}`]) {
            await expect(dialog.badge(name)).toHaveText(BADGE_ERROR);
            await expect(dialog.message(name)).not.toBeEmpty();
          }
          await expect(dialog.root).toBeVisible();
          await closeUploadDialog(ui);
        }
      });

      await test.step('leaves no partial asset, stored file or tag for a failed file', async () => {
        const library = await readLibrary(folder, (db) => ({
          counts: db.counts(),
          orphanTags: db.orphanTagCount(),
          mixedTags: db.tagCount('mixed'),
          names: UPLOAD_KINDS.map((kind) => assetNames(db, kind).sort()),
        }));
        expect(library.counts).toEqual({ image: 2, sound: 2, video: 2, prompt: 0 });
        expect(library.orphanTags).toBe(0);
        expect(library.mixedTags).toBe(6);
        expect(library.names).toEqual(
          UPLOAD_KINDS.map((kind) => [
            `good-1.${UPLOAD_EXTENSIONS[kind]}`,
            `good-2.${UPLOAD_EXTENSIONS[kind]}`,
          ]),
        );
        for (const kind of UPLOAD_KINDS) {
          expect(await storedCount(folder, kind)).toBe(2);
          expect((await storedFiles(folder, kind)).temporary).toEqual([]);
        }
        expect((await storedFiles(folder, 'image')).derived).toHaveLength(2);

        await expectLibraryCounts(ui, { image: 2, sound: 2, video: 2, prompt: 0 });
        for (const kind of UPLOAD_KINDS) {
          const ext = UPLOAD_EXTENSIONS[kind];
          await showLibrarySection(ui, sectionOf(kind));
          await expect(ui.main.library.section(kind).cards).toHaveCount(2);
          await expect(ui.main.library.section(kind).card(`good-1.${ext}`)).toBeVisible();
          await expect(ui.main.library.section(kind).card(`broken-1.${ext}`)).toHaveCount(0);
        }
      });
    });
  });
});
