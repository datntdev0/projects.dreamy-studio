import { existsSync } from 'node:fs';

import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { AUDIOBOOK, AUDIOBOOK_BLURB, BLANK, BLANK_BLURB, FILMSERIES, FILMSERIES_BLURB, HARBOR_CHAPTERS, openProjectsView, ORIGINAL, PROJECT_CREATED, PROJECT_NAME_REQUIRED, projectFolder, RANGE_INVALID, readProjects, removeNovel,SOURCE_NOVEL_NOT_FOUND } from '../scripts/project.ts';
import { seedTranslation } from '../scripts/translation.ts';

const TRANSLATION_VI = 'Translation VI';

test.describe('CAP-06 Project Management', () => {
  test.describe('FEAT-31 Project Creation', () => {
    test('US-0089 creates a project from a template and refuses an empty name', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox);
      const project = ui.main.project;
      await project.catalog.create.click();
      await expect(project.create.panel).toBeVisible();

      await test.step('lists the audiobook, filmseries and blank templates, each with a short description', async () => {
        await expect(project.create.templates).toHaveCount(3);
        await expect(project.create.template('audiobook')).toContainText(AUDIOBOOK);
        await expect(project.create.template('audiobook')).toContainText(AUDIOBOOK_BLURB);
        await expect(project.create.template('filmseries')).toContainText(FILMSERIES);
        await expect(project.create.template('filmseries')).toContainText(FILMSERIES_BLURB);
        await expect(project.create.template('blank')).toContainText(BLANK);
        await expect(project.create.template('blank')).toContainText(BLANK_BLURB);
      });

      await test.step('reports that a project name is required and creates no project when the name is empty', async () => {
        await project.create.submit.click();

        await expect(project.create.nameError).toHaveText(PROJECT_NAME_REQUIRED);
        await expect(project.create.panel).toBeVisible();
        expect(readProjects(folder)).toHaveLength(0);
      });

      await test.step('reports the creation, lists the new project in the catalog and creates its folder in the workspace', async () => {
        await project.create.name.fill('Harbor Audiobook');
        await project.create.template('filmseries').click();
        await project.create.submit.click();

        await expect(ui.main.toast(PROJECT_CREATED)).toContainText('Harbor Audiobook');
        await expect(project.create.panel).toBeHidden();
        await expect(project.catalog.cards).toHaveCount(1);
        await expect(project.catalog.card('Harbor Audiobook')).toContainText(FILMSERIES);
        const created = readProjects(folder);
        expect(created).toHaveLength(1);
        expect(created[0]).toMatchObject({ name: 'Harbor Audiobook', template: 'filmseries' });
        expect(existsSync(projectFolder(folder, created[0]!.id))).toBe(true);
      });
    });

    test('US-0090 links a project to a novel and validates the chapter range', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox, {
        novels: [{ title: 'Harbor Lights', chapters: HARBOR_CHAPTERS }],
      });
      const project = ui.main.project;
      await project.catalog.create.click();
      await expect(project.create.panel).toBeVisible();
      await expect(project.create.version).toBeDisabled();

      await test.step('offers the text version of the chosen source novel and defaults to all of its chapters', async () => {
        await project.create.novel.selectOption({ label: 'Harbor Lights' });

        await expect(project.create.version).toBeEnabled();
        await expect(project.create.version).toHaveText(ORIGINAL);
        await expect(project.create.allChapters).toBeChecked();
        await expect(project.create.allChaptersLabel).toContainText('5');
      });

      await test.step('reports an invalid chapter range and creates no project when it is reversed or beyond the novel', async () => {
        await project.create.name.fill('Harbor Run');
        await project.create.allChapters.uncheck();

        await project.create.from.fill('4');
        await project.create.to.fill('2');
        await project.create.submit.click();
        await expect(project.create.rangeError).toContainText(RANGE_INVALID);

        await project.create.from.fill('1');
        await project.create.to.fill('9');
        await project.create.submit.click();
        await expect(project.create.rangeError).toContainText(RANGE_INVALID);

        await expect(project.create.panel).toBeVisible();
        expect(readProjects(folder)).toHaveLength(0);
      });

      await test.step('shows the source novel, text version and chosen chapter range on the created project', async () => {
        await project.create.from.fill('2');
        await project.create.to.fill('4');
        await project.create.submit.click();

        await expect(project.create.panel).toBeHidden();
        await expect(project.panel.name).toHaveText('Harbor Run');
        await expect(project.panel.source).toContainText('Harbor Lights');
        await expect(project.panel.source).toContainText(ORIGINAL);
        await expect(project.panel.source).toContainText('Ch.2–4');
        expect(readProjects(folder)[0]).toMatchObject({
          srcKind: 'original',
          rangeFrom: 2,
          rangeTo: 4,
        });
      });

      await test.step('reports that the source novel is missing and creates no project when the novel was deleted before creating', async () => {
        await project.catalog.create.click();
        await project.create.name.fill('Orphan Run');
        await project.create.novel.selectOption({ label: 'Harbor Lights' });
        removeNovel(folder, 'Harbor Lights');

        await project.create.submit.click();

        await expect(project.create.error).toHaveText(SOURCE_NOVEL_NOT_FOUND);
        await expect(project.create.panel).toBeVisible();
        expect(readProjects(folder)).toHaveLength(1);
      });
    });

    test('US-0090 creates a project from a translated text version of the novel', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const folder = await openProjectsView(ui, picker, sandbox, {
        novels: [{ title: 'Harbor Lights', lang: 'ZH', chapters: HARBOR_CHAPTERS }],
      });
      await seedTranslation(folder, {
        novel: 'Harbor Lights',
        target: 'VI',
        chapters: [{ chapter: 1 }, { chapter: 2 }],
      });
      const project = ui.main.project;
      await project.catalog.create.click();

      await test.step('lists the original and every target language that has translated chapters', async () => {
        await project.create.novel.selectOption({ label: 'Harbor Lights' });
        await expect(project.create.version.locator('option')).toHaveText([
          ORIGINAL,
          TRANSLATION_VI,
        ]);
      });

      await test.step('creates the project from the chosen translation', async () => {
        await project.create.name.fill('Harbor Viet');
        await project.create.version.selectOption({ label: TRANSLATION_VI });
        await project.create.submit.click();

        await expect(project.create.panel).toBeHidden();
        await expect(project.panel.source).toContainText(TRANSLATION_VI);
        expect(readProjects(folder)[0]).toMatchObject({ srcKind: 'translation', srcLang: 'VI' });
      });
    });
  });
});
