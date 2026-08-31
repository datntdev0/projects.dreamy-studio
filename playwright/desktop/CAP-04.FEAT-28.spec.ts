import { expect, test } from "../scripts/provider.ts";
import { goToTab, openKnowledge, selectLang, showKnowledge, BROWSE_SEED, groupCounts, listCount, openBrowseWorkspace, readGraph, TYPE_LABEL, DETAIL_EMPTY, LIST_EMPTY_TITLE, OMNISCIENT_MODE_CHAPTER, OMNISCIENT_MODE_OMNISCIENT } from "../scripts/knowledge.ts";
import { showBottomPanel } from "../scripts/pipeline.ts";
import { SAMPLE_TITLE } from "../scripts/translation.ts";
import { KnowledgeBrowsing } from "../pages/knowledge.ts";

test.describe("CAP-04 Content Intelligence", () => {
  test.describe("FEAT-28 Knowledge Browsing", () => {
    test("US-0075 browses knowledge per language version and across tabs", async ({ ui, picker, sandbox, app }) => {
      const browsing = new KnowledgeBrowsing(app.page);
      const knowledge = ui.main.knowledge;
      await openKnowledge(ui, picker, sandbox, BROWSE_SEED, "list", { lang: "src" });

      await test.step("shows the knowledge of the chosen language version after the language changes", async () => {
        await expect(browsing.list.count).toHaveText(listCount(13));
        await expect(browsing.list.row("Lin Feng", TYPE_LABEL.persona)).toBeVisible();
        await expect(browsing.list.row("Lâm Phong")).toHaveCount(0);

        await selectLang(ui, "VI");
        await expect(browsing.list.count).toHaveText(listCount(4));
        await expect(browsing.list.row("Lâm Phong", TYPE_LABEL.persona)).toBeVisible();
        await expect(browsing.list.row("Thanh Thành")).toBeVisible();
        await expect(browsing.list.row("Lin Feng")).toHaveCount(0);

        await selectLang(ui, "src");
        await expect(browsing.list.count).toHaveText(listCount(13));
        await expect(browsing.list.row("Lâm Phong")).toHaveCount(0);
      });

      await test.step("shows each tab with its own content and the review tab shows the conflict count", async () => {
        await expect(knowledge.reviewCount).toHaveText("1");

        await goToTab(ui, "graph");
        await expect(browsing.graph.canvas).toBeVisible();
        await expect(browsing.graph.legend).toBeVisible();
        await expect(browsing.list.root).toBeHidden();
        await expect(browsing.review.root).toBeHidden();

        await goToTab(ui, "list");
        await expect(browsing.list.rows).toHaveCount(13);
        await expect(browsing.graph.canvas).toBeHidden();

        await goToTab(ui, "review");
        await expect(browsing.review.issues).toHaveCount(1);
        await expect(browsing.list.root).toBeHidden();
        await expect(knowledge.reviewCount).toHaveText("1");

        await selectLang(ui, "VI");
        await expect(browsing.review.issues).toHaveCount(0);
        await expect(knowledge.reviewCount).toHaveCount(0);
      });
    });

    test("US-0076 searches and filters entities in the list", async ({ ui, picker, sandbox, app }) => {
      const list = new KnowledgeBrowsing(app.page).list;
      await openKnowledge(ui, picker, sandbox, BROWSE_SEED, "list", { lang: "src" });
      await expect(list.rows).toHaveCount(13);

      await test.step("shows only the entities whose name, title or alias match the keyword, with their count", async () => {
        await list.search.fill("lin");
        await expect(list.count).toHaveText(listCount(2));
        await expect(list.row("Lin Feng", TYPE_LABEL.persona)).toBeVisible();
        await expect(list.row("Lin Feng", TYPE_LABEL.character)).toBeVisible();

        await list.search.fill("leader");
        await expect(list.count).toHaveText(listCount(1));
        await expect(list.row("Master Chen", TYPE_LABEL.persona)).toBeVisible();

        await list.search.fill("lotus");
        await expect(list.count).toHaveText(listCount(1));
        await expect(list.row("Su Yan", TYPE_LABEL.persona)).toBeVisible();
        await expect(list.aliases(list.row("Su Yan", TYPE_LABEL.persona))).toHaveText("White Lotus");

        await list.search.fill("");
        await expect(list.count).toHaveText(listCount(13));
      });

      await test.step("shows only the entities that satisfy the type, chapter and only-conflicts filters", async () => {
        await list.type.selectOption("persona");
        await expect(list.count).toHaveText(listCount(4));
        await expect(list.rows.filter({ hasText: TYPE_LABEL.persona })).toHaveCount(4);
        await expect(list.row("Lin Feng", TYPE_LABEL.character)).toHaveCount(0);
        await list.type.selectOption("all");

        await list.chapter.selectOption("1");
        await expect(list.count).toHaveText(listCount(9));
        await expect(list.row("Su Yan")).toHaveCount(0);
        await expect(list.row("trial")).toHaveCount(0);
        await expect(list.row("relic")).toBeVisible();
        await list.chapter.selectOption("0");

        await list.onlyIssues.check();
        await expect(list.count).toHaveText(listCount(2));
        await expect(list.row("Lin Feng", TYPE_LABEL.persona)).toBeVisible();
        await expect(list.row("Feng", TYPE_LABEL.persona)).toBeVisible();
        await expect(list.conflicts).toHaveCount(2);
        await list.onlyIssues.uncheck();
        await expect(list.count).toHaveText(listCount(13));
      });

      await test.step("reports that nothing matches and lets the filters be cleared", async () => {
        await list.search.fill("zzz");
        await expect(list.count).toHaveText(listCount(0));
        await expect(list.empty).toContainText(LIST_EMPTY_TITLE);
        await expect(list.rows).toHaveCount(0);

        await list.clear.click();
        await expect(list.empty).toBeHidden();
        await expect(list.search).toHaveValue("");
        await expect(list.count).toHaveText(listCount(13));
      });
    });

    test("US-0077 shows an entity with its evidence in the inspector", async ({ ui, picker, sandbox, app }) => {
      const browsing = new KnowledgeBrowsing(app.page);
      const list = browsing.list;
      const inspector = browsing.inspector;
      await openKnowledge(ui, picker, sandbox, BROWSE_SEED, "list", { lang: "src" });

      await test.step("shows an empty state that asks to select an entity while none is selected", async () => {
        await expect(inspector.empty).toContainText(DETAIL_EMPTY);
        await expect(inspector.detail).toBeHidden();
      });

      await test.step("shows the name, type, titles or aliases, attributes, relations and evidence quotes of the selected entity", async () => {
        await list.row("Lin Feng", TYPE_LABEL.persona).click();
        await expect(inspector.empty).toBeHidden();
        await expect(inspector.title).toHaveText("Lin Feng");
        await expect(inspector.type).toContainText(TYPE_LABEL.persona);
        await expect(inspector.scalars).toContainText("He was twenty years old and worked as a blacksmith.");
        await expect(inspector.relations).toContainText("Frost Blade");
        await expect(inspector.relations).toContainText("Master Chen");
        await expect(inspector.quotes).toHaveText(["Lin Feng arrived at the gates of Azure City at dawn.", "Master Chen asked Lin Feng to show the Frost Blade to the elders.", "Lin Feng fought Master Chen beneath the tower of Azure City."]);
        await expect(inspector.references).toHaveText([/Ch\.1 ¶1/, /Ch\.2 ¶2/, /Ch\.3 ¶2/]);

        await list.row("Master Chen", TYPE_LABEL.persona).click();
        await expect(inspector.title).toHaveText("Master Chen");
        await expect(inspector.titles).toContainText("Sect Leader");
        await expect(inspector.relations).toContainText("Sky Sword Sect");

        await list.row("Su Yan", TYPE_LABEL.persona).click();
        await expect(inspector.title).toHaveText("Su Yan");
        await expect(inspector.aliases).toContainText("White Lotus");
        await expect(inspector.relations).toContainText("Sky Sword Sect");
        await expect(inspector.quotes.first()).toContainText("Su Yan");
      });
    });

    test("US-0078 draws entities and relations as a graph", async ({ ui, picker, sandbox, app }) => {
      const browsing = new KnowledgeBrowsing(app.page);
      const graph = browsing.graph;
      await openKnowledge(ui, picker, sandbox, BROWSE_SEED, "graph", { lang: "src" });
      const visible = { character: 3, persona: 4, location: 1, organization: 1, artifact: 1, skill: 1 };

      await test.step("shows entities as nodes and relations as edges with the term and event groups hidden by default", async () => {
        await expect.poll(async () => groupCounts(await readGraph(app.page))).toEqual(visible);
        await expect(graph.group("term")).not.toBeChecked();
        await expect(graph.group("event")).not.toBeChecked();
        await expect(graph.group("persona")).toBeChecked();

        await graph.orphans.uncheck();
        await expect.poll(async () => groupCounts(await readGraph(app.page))).toEqual({ character: 3, persona: 4, organization: 1, artifact: 1 });
        await graph.orphans.check();

        await graph.group("term").check();
        await graph.group("event").check();
        await expect.poll(async () => groupCounts(await readGraph(app.page))).toEqual({ ...visible, term: 1, event: 1 });
        await graph.group("term").uncheck();
        await graph.group("event").uncheck();
        await expect.poll(async () => groupCounts(await readGraph(app.page))).toEqual(visible);
      });

      await test.step("keeps only the nodes that match a name typed in the node search", async () => {
        await graph.search.fill("chen");
        await expect.poll(async () => groupCounts(await readGraph(app.page))).toEqual({ persona: 1, character: 1 });
        await graph.search.fill("");
        await expect.poll(async () => groupCounts(await readGraph(app.page))).toEqual(visible);
      });

      await test.step("marks the conflicting nodes", async () => {
        await expect(graph.legendFlag).toBeVisible();
        await expect.poll(async () => (await readGraph(app.page)).flags).toBe(2);
      });
    });

    test("US-0079 limits knowledge to the chosen chapter in the Omniscient panel", async ({ ui, picker, sandbox, app }) => {
      const browsing = new KnowledgeBrowsing(app.page);
      const omniscient = browsing.omniscient;
      await openBrowseWorkspace(ui, picker, sandbox);

      await test.step("shows an empty state while no knowledge tab is open", async () => {
        await showBottomPanel(ui, "omniscient");
        await expect(omniscient.empty).toBeVisible();
        await expect(omniscient.main).toBeHidden();
      });

      await test.step("shows only the items first evidenced up to the chosen chapter in spoiler-safe mode", async () => {
        await showKnowledge(ui, SAMPLE_TITLE, "src");
        await goToTab(ui, "list");
        await expect(omniscient.empty).toBeHidden();
        await expect(omniscient.main).toBeVisible();
        await expect(browsing.list.count).toHaveText(listCount(13));

        await omniscient.modeButton(OMNISCIENT_MODE_CHAPTER).click();
        await omniscient.select.selectOption("1");
        await expect(omniscient.position).toHaveText("1 / 3");
        await expect(browsing.list.count).toHaveText(listCount(9));
        await expect(browsing.list.row("Su Yan")).toHaveCount(0);
        await expect(browsing.list.row("trial")).toHaveCount(0);
        await expect(browsing.list.row("relic")).toBeVisible();

        await omniscient.select.selectOption("2");
        await expect(omniscient.position).toHaveText("2 / 3");
        await expect(browsing.list.count).toHaveText(listCount(13));
        await expect(browsing.list.row("Su Yan", TYPE_LABEL.persona)).toBeVisible();
        await expect(browsing.list.row("trial")).toBeVisible();
      });

      await test.step("shows all the knowledge regardless of chapter in omniscient mode", async () => {
        await omniscient.select.selectOption("1");
        await expect(browsing.list.count).toHaveText(listCount(9));

        await omniscient.modeButton(OMNISCIENT_MODE_OMNISCIENT).click();
        await expect(omniscient.modeButton(OMNISCIENT_MODE_OMNISCIENT)).toHaveAttribute("aria-pressed", "true");
        await expect(browsing.list.count).toHaveText(listCount(13));
        await expect(browsing.list.row("Su Yan", TYPE_LABEL.persona)).toBeVisible();
        await expect(browsing.list.row("trial")).toBeVisible();
      });
    });
  });
});
