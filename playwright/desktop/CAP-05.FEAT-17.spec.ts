import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { cancelDeletionDialog, confirmDeletionDialog, deletedToast, DELETION_SEED, DELETION_TARGETS, expectDeletionDialog, expectLibraryCounts, openDeletionDialog, openLibraryView, snapshotLibrary } from '../scripts/library.ts';

const ID_GROUPS = { image: 'images', sound: 'sounds', video: 'videos', prompt: 'prompts' } as const;

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-17 Asset Deletion', () => {
    test('US-0045 deletes an asset and its file only after a confirmation that warns it cannot be undone', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, ids } = await openLibraryView(ui, picker, sandbox, DELETION_SEED);
      const initial = await snapshotLibrary(folder);

      await test.step('shows a confirmation naming the asset about to be deleted and warning that deletion cannot be undone', async () => {
        for (const target of DELETION_TARGETS) {
          await openDeletionDialog(ui, target.kind, target.name);

          await expectDeletionDialog(ui, target.name);
          await cancelDeletionDialog(ui);
        }
      });

      await test.step('removes the asset and its file from the library, updates the counts and reports the result', async () => {
        for (const target of DELETION_TARGETS) {
          const id = ids[ID_GROUPS[target.kind]][target.name];
          await openDeletionDialog(ui, target.kind, target.name);

          await confirmDeletionDialog(ui);

          await expect(ui.main.toast(deletedToast(target))).toBeVisible();
          await expect(ui.main.library.section(target.kind).card(target.name)).toHaveCount(0);
          await expect(ui.main.library.section(target.kind).card(target.keep)).toHaveCount(1);
          const after = await snapshotLibrary(folder);
          expect(after.names[target.kind]).toEqual([target.keep]);
          expect(after.originals[target.kind]).toHaveLength(1);
          expect(after.originals[target.kind].some((file) => file.startsWith(`${id}.`))).toBe(
            false,
          );
          expect(after.derived[target.kind].some((file) => file.startsWith(`${id}.`))).toBe(false);
        }
        await expectLibraryCounts(ui, { image: 1, sound: 1, video: 1, prompt: 1 });
        const deleted = await snapshotLibrary(folder);
        expect(deleted.counts).toEqual({ image: 1, sound: 1, video: 1, prompt: 1 });
        expect(deleted.derived.video).toHaveLength(initial.derived.video.length - 1);
      });

      await test.step('leaves every asset, file and count unchanged when the confirmation is cancelled', async () => {
        const before = await snapshotLibrary(folder);
        for (const target of DELETION_TARGETS) {
          await openDeletionDialog(ui, target.kind, target.keep);

          await cancelDeletionDialog(ui);

          await expect(ui.main.library.section(target.kind).card(target.keep)).toHaveCount(1);
        }
        await expectLibraryCounts(ui, { image: 1, sound: 1, video: 1, prompt: 1 });
        expect(await snapshotLibrary(folder)).toEqual(before);
      });
    });
  });
});
