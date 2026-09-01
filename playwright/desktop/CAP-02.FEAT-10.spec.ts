import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { CHAPTER_ADDED, CHAPTER_DELETED, CHAPTER_RENAMED, DELETE_WARNING, NOT_ANALYZED, NOT_TRANSLATED } from '../scripts/messages.ts';
import { openChapters, openLibrary } from '../scripts/novels.ts';
import { chapterFileName, readWorkspace, type SeedChapter } from '../scripts/workspaces.ts';

const NOVEL = 'Harbor Lights';

const READING: SeedChapter[] = [
  { title: 'The Harbor Wakes', paragraphs: ['The harbor wakes slowly.', 'Gulls circle the pier.'] },
  { title: 'Fog', paragraphs: ['Morning fog lifts.'] },
  { title: 'Night Returns', paragraphs: ['Night returns to the sea.', 'Lanterns burn low.'] },
  { title: 'Dawn', paragraphs: ['Dawn.'] },
];

const ORDERED: SeedChapter[] = [
  { title: 'Alpha' },
  { title: 'Bravo' },
  { title: 'Charlie' },
  { title: 'Delta', translated: true },
  { title: 'Echo', analyzed: true },
];

test.describe('CAP-02 Content Source Management', () => {
  test.describe('FEAT-10 Chapter Management', () => {
    test('US-0022 lists the chapters with their figures and statuses and searches them', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openLibrary(ui, picker, sandbox, [{ title: NOVEL, chapters: READING }]);
      await openChapters(ui, NOVEL);

      await test.step('shows the number, title, word count, translation status and analysis status of every chapter', async () => {
        await expect(ui.main.chapters.rows).toHaveCount(4);
        await expect(ui.main.chapters.count).toContainText('4/4');
        const first = ui.main.chapters.rowAt(1);
        await expect(first.locator('td').nth(0)).toHaveText('01');
        await expect(first.locator('td').nth(1)).toHaveText('The Harbor Wakes');
        await expect(first.locator('td').nth(2)).toHaveText('8');
        await expect(first.getByTestId('novel-chapter-translation')).toHaveAttribute(
          'title',
          NOT_TRANSLATED,
        );
        await expect(first.getByTestId('novel-chapter-analysis')).toHaveAttribute(
          'title',
          NOT_ANALYZED,
        );
        await expect(ui.main.chapters.rowAt(2).locator('td').nth(2)).toHaveText('3');
        await expect(ui.main.chapters.rowAt(4).locator('td').nth(0)).toHaveText('04');
      });

      await test.step('shows only the chapters that match a number or part of a title', async () => {
        await ui.main.chapters.search.fill('fog');
        await expect(ui.main.chapters.rows).toHaveCount(1);
        await expect(ui.main.chapters.row('Fog')).toBeVisible();
        await expect(ui.main.chapters.count).toContainText('1/4');

        await ui.main.chapters.search.fill('3');
        await expect(ui.main.chapters.rows).toHaveCount(1);
        await expect(ui.main.chapters.row('Night Returns')).toBeVisible();

        await ui.main.chapters.search.fill('');
        await expect(ui.main.chapters.rows).toHaveCount(4);
      });
    });

    test('US-0023 adds a chapter and renames a chapter', async ({ ui, picker, sandbox }) => {
      const folder = await openLibrary(ui, picker, sandbox, [{ title: NOVEL, chapters: READING }]);
      await openChapters(ui, NOVEL);

      await test.step('appends the new chapter to the novel and counts it', async () => {
        await ui.main.chapters.runAction(ui.main.chapters.rowAt(1), 'add');
        await expect(ui.main.addChapterDialog.panel).toBeVisible();
        await ui.main.addChapterDialog.title.fill('Dusk Market');
        await ui.main.addChapterDialog.submit.click();

        await expect(ui.main.addChapterDialog.panel).toBeHidden();
        await expect(ui.main.toast(CHAPTER_ADDED)).toContainText('Dusk Market');
        await expect(ui.main.chapters.rows).toHaveCount(5);
        await expect(ui.main.chapters.rowAt(5).locator('td').nth(1)).toHaveText('Dusk Market');
        await expect(ui.main.chapters.count).toContainText('5/5');
        const chapters = await readWorkspace(folder, (db) => db.chapters(NOVEL));
        expect(chapters.map((chapter) => [chapter.seq, chapter.title])).toEqual([
          [1, 'The Harbor Wakes'],
          [2, 'Fog'],
          [3, 'Night Returns'],
          [4, 'Dawn'],
          [5, 'Dusk Market'],
        ]);
        expect(
          existsSync(join(folder, 'novels', '1', chapterFileName(chapters[4]?.id ?? ''))),
        ).toBe(true);
      });

      await test.step('saves the new title of a renamed chapter and shows it in the chapter list', async () => {
        await ui.main.chapters.rowAt(2).click();
        await expect(ui.main.reader.root).toBeVisible();
        await ui.main.reader.mode('edit').click();
        await ui.main.reader.titleInput.fill('Thick Fog');
        await ui.main.reader.titleInput.blur();

        await expect(ui.main.toast(CHAPTER_RENAMED)).toBeVisible();
        expect((await readWorkspace(folder, (db) => db.chapters(NOVEL)))[1]?.title).toBe(
          'Thick Fog',
        );

        await ui.main.reader.back.click();
        await expect(ui.main.chapters.root).toBeVisible();
        await expect(ui.main.chapters.rowAt(2).locator('td').nth(1)).toHaveText('Thick Fog');
      });
    });

    test('US-0024 reorders unlocked chapters and refuses to move locked or filtered ones', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openLibrary(ui, picker, sandbox, [{ title: NOVEL, chapters: ORDERED }]);
      await openChapters(ui, NOVEL);
      await expect(ui.main.chapters.rows).toHaveCount(5);

      await test.step('moves a chapter to another position and renumbers the chapters without gaps or duplicates', async () => {
        await expect(ui.main.chapters.row('Charlie')).toHaveClass(/is-reorderable/);

        await ui.main.chapters.drag(
          ui.main.chapters.row('Charlie'),
          ui.main.chapters.row('Alpha'),
          'before',
        );

        await expect
          .poll(() => ui.main.chapters.titles())
          .toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta', 'Echo']);
        const chapters = await readWorkspace(folder, (db) => db.chapters(NOVEL));
        expect(chapters.map((chapter) => [chapter.seq, chapter.title])).toEqual([
          [1, 'Charlie'],
          [2, 'Alpha'],
          [3, 'Bravo'],
          [4, 'Delta'],
          [5, 'Echo'],
        ]);
        await expect(ui.main.chapters.rowAt(1).locator('td').nth(0)).toHaveText('01');
        await expect(ui.main.chapters.rowAt(5).locator('td').nth(0)).toHaveText('05');
      });

      await test.step('does not move a translated or analyzed chapter, onto one, or any chapter while the list is filtered', async () => {
        const order = ['Charlie', 'Alpha', 'Bravo', 'Delta', 'Echo'];
        await expect(ui.main.chapters.row('Delta')).not.toHaveClass(/is-reorderable/);
        await expect(ui.main.chapters.row('Echo')).not.toHaveClass(/is-reorderable/);

        await ui.main.chapters.drag(
          ui.main.chapters.row('Delta'),
          ui.main.chapters.row('Charlie'),
          'before',
        );
        await ui.main.chapters.drag(
          ui.main.chapters.row('Alpha'),
          ui.main.chapters.row('Delta'),
          'after',
        );
        expect(await ui.main.chapters.titles()).toEqual(order);

        await ui.main.chapters.search.fill('a');
        await expect(ui.main.chapters.row('Alpha')).not.toHaveClass(/is-reorderable/);
        await ui.main.chapters.drag(
          ui.main.chapters.row('Alpha'),
          ui.main.chapters.row('Bravo'),
          'after',
        );
        await ui.main.chapters.search.fill('');

        await expect.poll(() => ui.main.chapters.titles()).toEqual(order);
        const chapters = await readWorkspace(folder, (db) => db.chapters(NOVEL));
        expect(chapters.map((chapter) => chapter.title)).toEqual(order);
      });
    });

    test('US-0025 deletes an untranslated chapter after confirmation and keeps a translated one', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const chapters: SeedChapter[] = [
        { title: 'Alpha' },
        { title: 'Bravo' },
        { title: 'Charlie' },
        { title: 'Delta', translated: true },
      ];
      const folder = await openLibrary(ui, picker, sandbox, [{ title: NOVEL, chapters }]);
      await openChapters(ui, NOVEL);
      const before = await readWorkspace(folder, (db) => db.chapters(NOVEL));

      await test.step('deletes the chapter after confirmation and renumbers the remaining chapters without gaps', async () => {
        await ui.main.chapters.runAction(ui.main.chapters.row('Bravo'), 'delete');
        await expect(ui.main.confirm.panel).toBeVisible();
        await expect(ui.main.confirm.names).toContainText('Bravo');
        await expect(ui.main.confirm.warning).toContainText(DELETE_WARNING);

        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(ui.main.toast(CHAPTER_DELETED)).toContainText('Bravo');
        await expect.poll(() => ui.main.chapters.titles()).toEqual(['Alpha', 'Charlie', 'Delta']);
        const after = await readWorkspace(folder, (db) => db.chapters(NOVEL));
        expect(after.map((chapter) => [chapter.seq, chapter.title])).toEqual([
          [1, 'Alpha'],
          [2, 'Charlie'],
          [3, 'Delta'],
        ]);
        expect(existsSync(join(folder, 'novels', '1', chapterFileName(before[1]?.id ?? '')))).toBe(
          false,
        );
        await expect(ui.main.chapters.rowAt(3).locator('td').nth(0)).toHaveText('03');
      });

      await test.step('refuses to delete a translated chapter and keeps it unchanged', async () => {
        await ui.main.chapters.runAction(ui.main.chapters.row('Delta'), 'delete');
        await expect(ui.main.confirm.panel).toBeVisible();

        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.error).toBeVisible();
        await ui.main.confirm.cancel.click();
        await expect(ui.main.chapters.row('Delta')).toBeVisible();
        const after = await readWorkspace(folder, (db) => db.chapters(NOVEL));
        expect(after.map((chapter) => chapter.title)).toEqual(['Alpha', 'Charlie', 'Delta']);
        expect(existsSync(join(folder, 'novels', '1', chapterFileName(before[3]?.id ?? '')))).toBe(
          true,
        );
      });
    });
  });
});
