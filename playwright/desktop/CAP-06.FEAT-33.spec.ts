import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { COVER_CHANGED, COVER_REMOVED, IMAGE_TOO_LARGE, NOT_AN_IMAGE } from '../scripts/messages.ts';
import { PNG_BYTES } from '../scripts/novels.ts';
// prettier-ignore
import { ARCHIVE, HARBOR_CHAPTERS, NO_NOVEL, NOVEL_DELETED, openProjectSettings, openProjectsView, openSettings, ORIGINAL, PROJECT_NAME_REQUIRED, projectFolder, readProjects, RESTORE, selectProject, showCatalog,SOURCE_NOTE } from '../scripts/project.ts';

const COVER_LIMIT = 8 * 1024 * 1024;

test.describe('CAP-06 Project Management', () => {
  test.describe('FEAT-33 Project Information Management', () => {
    test('US-0094 renames the project and edits its description without changing its folder', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox, {
        projects: [{ name: 'Harbor Audio', description: 'Old text' }],
      });
      const project = ui.main.project;
      await openProjectSettings(ui, 'Harbor Audio');

      await test.step('shows the new name and description in the project tab, the details panel and the catalog after saving', async () => {
        await project.view.setField(project.view.nameInput, 'Harbor Story');
        await project.view.setField(project.view.descriptionInput, 'Night harbor tales');

        await expect(project.view.title).toHaveText('Harbor Story');
        await expect(project.view.tabs).toContainText('Harbor Story');
        await expect(project.panel.name).toHaveText('Harbor Story');
        await expect(project.panel.description).toHaveText('Night harbor tales');
        await expect
          .poll(() => readProjects(folder)[0])
          .toMatchObject({ name: 'Harbor Story', description: 'Night harbor tales' });

        await showCatalog(ui);
        await expect(project.catalog.card('Harbor Story')).toBeVisible();
        await expect(project.catalog.card('Harbor Audio')).toHaveCount(0);
        await project.catalog.search.fill('night harbor');
        await expect(project.catalog.cards).toHaveCount(1);
        await project.catalog.search.fill('');
      });

      await test.step('reports that a project name is required and keeps the previous name when the name is cleared', async () => {
        await project.view.tabs.click();
        await openSettings(ui);

        await project.view.setField(project.view.nameInput, '   ');

        await expect(ui.main.toast(PROJECT_NAME_REQUIRED)).toBeVisible();
        await expect(project.view.nameInput).toHaveValue('Harbor Story');
        await expect(project.view.title).toHaveText('Harbor Story');
        expect(readProjects(folder)[0]?.name).toBe('Harbor Story');
      });

      await test.step('keeps the same project folder path after the rename', async () => {
        await expect(project.view.folder).toHaveText('projects\\1\\');
        expect(readProjects(folder)[0]?.id).toBe(1);
        expect(existsSync(projectFolder(folder, 1))).toBe(true);
      });
    });

    test('US-0095 sets, rejects and removes the project cover image', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox, {
        projects: [{ name: 'Harbor Audio' }],
      });
      const project = ui.main.project;
      const coverFile = join(folder, 'project-covers', '1.png');

      await test.step('shows the placeholder icon while the project has no cover', async () => {
        await selectProject(ui, 'Harbor Audio');

        await expect(project.panel.thumb).toHaveClass(/is-empty/);
        await expect(project.panel.thumb.locator('.cover-ph')).toBeVisible();
        await expect(project.panel.coverRemove).toBeDisabled();
      });

      await test.step('shows a valid image as the cover in the details panel and the catalog and reports the change', async () => {
        await project.panel.coverInput.setInputFiles({
          name: 'cover.png',
          mimeType: 'image/png',
          buffer: PNG_BYTES,
        });

        await expect(ui.main.toast(COVER_CHANGED)).toBeVisible();
        await expect(project.panel.thumb).toHaveCSS('background-image', /url\(/);
        await expect(project.catalog.card('Harbor Audio').getByTestId('project-thumb')).toHaveCSS(
          'background-image',
          /url\(/,
        );
        await expect(project.panel.coverRemove).toBeEnabled();
        expect(existsSync(coverFile)).toBe(true);
      });

      await test.step('reports the reason and keeps the cover when the file is not a valid image or is too large', async () => {
        const before = await readFile(coverFile);

        await project.panel.coverInput.setInputFiles({
          name: 'huge.png',
          mimeType: 'image/png',
          buffer: Buffer.alloc(COVER_LIMIT + 1),
        });
        await expect(ui.main.toast(IMAGE_TOO_LARGE)).toBeVisible();

        await project.panel.coverInput.setInputFiles({
          name: 'animated.gif',
          mimeType: 'image/gif',
          buffer: Buffer.from('GIF89a'),
        });
        await expect(ui.main.toast(NOT_AN_IMAGE)).toBeVisible();

        expect((await readFile(coverFile)).equals(before)).toBe(true);
        await expect(project.panel.thumb).toHaveCSS('background-image', /url\(/);
      });

      await test.step('removes the cover, shows the placeholder icon again and reports the removal', async () => {
        await project.panel.coverRemove.click();

        await expect(ui.main.toast(COVER_REMOVED)).toBeVisible();
        await expect(project.panel.thumb).toHaveClass(/is-empty/);
        await expect(project.panel.thumb.locator('.cover-ph')).toBeVisible();
        await expect(project.panel.coverRemove).toBeDisabled();
        expect(existsSync(coverFile)).toBe(false);
      });
    });

    test('US-0096 archives a project without losing its files and restores it', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox, {
        projects: [
          { name: 'Alpha Audio', updatedAt: '2026-01-01T12:00:00.000Z' },
          {
            name: 'Beta Audio',
            updatedAt: '2026-01-02T12:00:00.000Z',
            files: { 'notes/draft.txt': 'keep me' },
          },
        ],
      });
      const project = ui.main.project;
      const draft = join(projectFolder(folder, 2), 'notes', 'draft.txt');
      await expect(project.catalog.cards).toContainText(['Beta Audio', 'Alpha Audio']);

      await test.step('marks the project as archived, places it after the active projects and keeps all its files', async () => {
        await selectProject(ui, 'Beta Audio');
        await project.panel.archive.click();

        await expect(project.catalog.card('Beta Audio')).toHaveClass(/is-archived/);
        await expect(project.panel.archive).toHaveText(RESTORE);
        await expect(project.catalog.cards).toContainText(['Alpha Audio', 'Beta Audio']);
        expect(readProjects(folder)[1]?.archived).toBe(true);
        expect(await readFile(draft, 'utf8')).toBe('keep me');
      });

      await test.step('returns the project to the active projects when it is restored', async () => {
        await project.panel.archive.click();

        await expect(project.catalog.card('Beta Audio')).not.toHaveClass(/is-archived/);
        await expect(project.panel.archive).toHaveText(ARCHIVE);
        await expect(project.catalog.cards).toContainText(['Beta Audio', 'Alpha Audio']);
        expect(readProjects(folder)[1]?.archived).toBe(false);
      });
    });

    test('US-0097 shows the content source of the project, including a missing or deleted novel', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openProjectsView(ui, picker, sandbox, {
        novels: [{ title: 'Harbor Lights', chapters: HARBOR_CHAPTERS }],
        projects: [
          { name: 'Linked Audio', novel: 'Harbor Lights' },
          { name: 'Loose Audio' },
          { name: 'Orphan Audio', missingNovel: true },
        ],
      });
      const project = ui.main.project;

      await test.step('shows the novel, text version and the note that the project is tied to that version', async () => {
        await openProjectSettings(ui, 'Linked Audio');

        await expect(project.view.sourceList).toContainText('Harbor Lights');
        await expect(project.view.sourceList).toContainText(ORIGINAL);
        await expect(project.view.source).toContainText(SOURCE_NOTE);
      });

      await test.step('shows that no novel is linked when the project has no source novel', async () => {
        await openProjectSettings(ui, 'Loose Audio');

        await expect(project.view.sourceList).toContainText(NO_NOVEL);
      });

      await test.step('reports that the source novel was deleted when the novel no longer exists', async () => {
        await openProjectSettings(ui, 'Orphan Audio');

        await expect(project.view.sourceList).toContainText(NOVEL_DELETED);
      });
    });
  });
});
