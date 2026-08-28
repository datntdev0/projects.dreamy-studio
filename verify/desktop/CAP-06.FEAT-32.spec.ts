import { expect, test } from "../scripts/fixtures.ts";
import { switchWorkspace } from "../scripts/flows.ts";
import { ACTIVE, ARCHIVED, AUDIOBOOK, COLUMN_PROJECT, COLUMN_STATUS, COLUMN_TYPE, COLUMN_UPDATED, FILMSERIES, ORIGINAL, HARBOR_CHAPTERS, openProjectsView, selectProject, showCatalog } from "../scripts/project.ts";

test.describe("CAP-06 Project Management", () => {
  test.describe("FEAT-32 Project Browsing", () => {
    test("US-0091 shows the catalog as a grid or a table and an empty state with a way to create", async ({ ui, picker, sandbox }) => {
      await openProjectsView(ui, picker, sandbox, {
        novels: [{ title: "Harbor Lights", chapters: HARBOR_CHAPTERS }],
        projects: [
          { name: "Harbor Audio", template: "audiobook", novel: "Harbor Lights", range: [2, 4], updatedAt: "2026-01-03T12:00:00.000Z" },
          { name: "Iron Film", template: "filmseries", updatedAt: "2026-01-02T12:00:00.000Z" },
          { name: "Old Draft", template: "blank", archived: true, updatedAt: "2026-01-01T12:00:00.000Z" },
        ],
      });
      const catalog = ui.main.project.catalog;

      await test.step("shows the projects as a grid with their template, status, content source and the total count", async () => {
        await expect(catalog.grid).toBeVisible();
        await expect(catalog.cards).toHaveCount(3);
        await expect(catalog.count).toHaveText(/^3\b/);
        await expect(catalog.card("Harbor Audio")).toContainText(AUDIOBOOK);
        await expect(catalog.card("Harbor Audio")).toContainText(ACTIVE);
        await expect(catalog.card("Harbor Audio")).toContainText("Harbor Lights");
        await expect(catalog.card("Harbor Audio")).toContainText(ORIGINAL);
        await expect(catalog.card("Iron Film")).toContainText(FILMSERIES);
        await expect(catalog.card("Old Draft")).toContainText(ARCHIVED);
      });

      await test.step("shows the projects as a table with the project, type, status and updated columns", async () => {
        await catalog.listView.click();

        await expect(catalog.table).toBeVisible();
        await expect(catalog.headers).toHaveText([COLUMN_PROJECT, COLUMN_TYPE, COLUMN_STATUS, COLUMN_UPDATED]);
        await expect(catalog.rows).toHaveCount(3);
        await expect(catalog.row("Harbor Audio")).toContainText(AUDIOBOOK);
        await expect(catalog.row("Harbor Audio")).toContainText(ACTIVE);
        await expect(catalog.row("Harbor Audio")).toContainText("2026-01-03");
      });

      await test.step("shows an empty state with a create button when the workspace has no project", async () => {
        await switchWorkspace(ui, picker, sandbox.workspace("empty"));
        await showCatalog(ui);

        await expect(catalog.empty).toBeVisible();
        await expect(catalog.emptyCreate).toBeVisible();
        await catalog.emptyCreate.click();
        await expect(ui.main.project.create.panel).toBeVisible();
      });
    });

    test("US-0092 searches, filters and sorts the catalog and guides the user when nothing matches", async ({ ui, picker, sandbox }) => {
      await openProjectsView(ui, picker, sandbox, {
        projects: [
          { name: "Harbor Audio", template: "audiobook", description: "Narrated sea stories", updatedAt: "2026-01-02T12:00:00.000Z" },
          { name: "Iron Film", template: "filmseries", description: "Rust city", updatedAt: "2026-01-03T12:00:00.000Z" },
          { name: "Zen Blank", template: "blank", description: "Quiet", updatedAt: "2026-01-01T12:00:00.000Z" },
          { name: "Old Audio", template: "audiobook", description: "Retired", archived: true, updatedAt: "2026-01-04T12:00:00.000Z" },
        ],
      });
      const catalog = ui.main.project.catalog;
      const explorer = ui.main.project.explorer;
      await expect(catalog.cards).toHaveCount(4);

      await test.step("keeps only the projects whose name or description matches the search and updates the count", async () => {
        await catalog.search.fill("narrated");
        await expect(catalog.cards).toHaveCount(1);
        await expect(catalog.card("Harbor Audio")).toBeVisible();
        await expect(catalog.count).toHaveText(/^1\b/);

        await catalog.search.fill("iron");
        await expect(catalog.cards).toHaveCount(1);
        await expect(catalog.card("Iron Film")).toBeVisible();
        await catalog.search.fill("");
        await expect(catalog.cards).toHaveCount(4);
      });

      await test.step("keeps only the projects of the chosen template and status, with a removable chip for each filter", async () => {
        await explorer.template(AUDIOBOOK).click();
        await expect(catalog.cards).toHaveCount(2);
        await expect(catalog.chipTemplates).toHaveCount(1);

        await explorer.status(ARCHIVED).click();
        await expect(catalog.cards).toHaveCount(1);
        await expect(catalog.card("Old Audio")).toBeVisible();
        await expect(catalog.chipStatuses).toHaveCount(1);

        await catalog.chipRemove(catalog.chipTemplates).click();
        await expect(catalog.chipTemplates).toHaveCount(0);
        await expect(catalog.chipStatuses).toHaveCount(1);
        await expect(catalog.cards).toHaveCount(1);

        await catalog.chipRemove(catalog.chipStatuses).click();
        await expect(catalog.chipStatuses).toHaveCount(0);
        await expect(catalog.cards).toHaveCount(4);
      });

      await test.step("orders the projects by most recent or by name and always places archived projects last", async () => {
        await expect(catalog.cards).toContainText(["Iron Film", "Harbor Audio", "Zen Blank", "Old Audio"]);

        await catalog.sort.selectOption("name");
        await expect(catalog.cards).toContainText(["Harbor Audio", "Iron Film", "Zen Blank", "Old Audio"]);

        await catalog.sort.selectOption("updated");
        await expect(catalog.cards).toContainText(["Iron Film", "Harbor Audio", "Zen Blank", "Old Audio"]);
      });

      await test.step("reports that no project matches and offers a button that clears the filters", async () => {
        await catalog.search.fill("zzz");
        await explorer.template(FILMSERIES).click();

        await expect(catalog.noMatch).toBeVisible();
        await catalog.noMatchClear.click();

        await expect(catalog.noMatch).toBeHidden();
        await expect(catalog.search).toHaveValue("");
        await expect(catalog.chipTemplates).toHaveCount(0);
        await expect(catalog.cards).toHaveCount(4);
      });
    });

    test("US-0093 shows the project details and opens the project in its own tab", async ({ ui, picker, sandbox }) => {
      await openProjectsView(ui, picker, sandbox, {
        novels: [{ title: "Harbor Lights", chapters: HARBOR_CHAPTERS }],
        projects: [
          { name: "Harbor Audio", template: "audiobook", novel: "Harbor Lights", range: [2, 4], updatedAt: "2026-01-05T12:00:00.000Z" },
          { name: "Iron Film", template: "filmseries", updatedAt: "2026-01-04T12:00:00.000Z" },
        ],
      });
      const project = ui.main.project;

      await test.step("shows the code, type, status, source, folder, created and updated dates of the selected project", async () => {
        await selectProject(ui, "Harbor Audio");

        await expect(project.panel.meta).toContainText("PRJ-0001");
        await expect(project.panel.meta).toContainText(AUDIOBOOK);
        await expect(project.panel.badges).toContainText(ACTIVE);
        await expect(project.panel.source).toContainText("Harbor Lights");
        await expect(project.panel.source).toContainText(/Ch\.2–4/);
        await expect(project.panel.meta).toContainText("projects\\1\\");
        await expect(project.panel.meta).toContainText("2026-01-01");
        await expect(project.panel.meta).toContainText("2026-01-05");
      });

      await test.step("opens the project in its own tab with the files and settings sections from the open button or a double click", async () => {
        await project.panel.open.click();
        await expect(project.view.tabs).toHaveCount(1);
        await expect(project.view.title).toHaveText("Harbor Audio");
        await expect(project.view.tabFiles).toBeVisible();
        await expect(project.view.tabSettings).toBeVisible();

        await showCatalog(ui);
        await project.catalog.card("Iron Film").dblclick();
        await expect(project.view.tabs).toHaveCount(2);
        await expect(project.view.title).toHaveText("Iron Film");
        await expect(project.view.tabFiles).toBeVisible();
        await expect(project.view.tabSettings).toBeVisible();
      });
    });
  });
});
