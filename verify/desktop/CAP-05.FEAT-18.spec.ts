import { expect, test } from "../scripts/fixtures.ts";
import { collectionNamesInDb, collectionsInDb, commitField, deleteSelectedCollection, expectRowCounts, forceValue, openCollectionsView, openCreateDialog, selectCollectionRow, showCollections, submitCollection, showLibraryCollection, readLibrary, storedCount, COLLECTION_DELETE_WARNING, COLLECTION_EXISTS, COLLECTION_INVALID, COLLECTION_NAME_REQUIRED } from "../scripts/library.ts";

const MAX_DESCRIPTION = "d".repeat(500);
const MAX_NAME = "n".repeat(80);

test.describe("CAP-05 Asset Library Management", () => {
  test.describe("FEAT-18 Collection Management", () => {
    test("US-0046 creates a collection with a valid name and rejects invalid names", async ({ ui, picker, sandbox }) => {
      const { folder, view } = await openCollectionsView(ui, picker, sandbox, { collections: [{ name: "Harbor", description: "Harbor scenes" }] });

      await test.step("adds a new collection with no resources to the list when the name and description are valid", async () => {
        await openCreateDialog(ui, view);
        await submitCollection(view, "Night Market", MAX_DESCRIPTION);

        await expect(view.dialog.panel).toBeHidden();
        await expect(view.rows).toHaveCount(2);
        await expect(view.row("Night Market")).toBeVisible();
        await expectRowCounts(view, "Night Market", { image: 0, sound: 0, video: 0, prompt: 0 });
        await expect(ui.main.library.explorer.collectionNamed("Night Market")).toBeVisible();
        const created = (await collectionsInDb(folder)).find((row) => row.name === "Night Market");
        expect(created?.description).toBe(MAX_DESCRIPTION);
        expect(created?.counts).toEqual({ image: 0, sound: 0, video: 0, prompt: 0 });
      });

      await test.step("refuses an empty, over-long or case-insensitive duplicate name with an error and creates nothing", async () => {
        await openCreateDialog(ui, view);

        await submitCollection(view, "   ", "no name");
        await expect(view.dialog.error).toHaveText(COLLECTION_NAME_REQUIRED);

        await submitCollection(view, "HARBOR", "same name in capitals");
        await expect(view.dialog.error).toHaveText(COLLECTION_EXISTS);

        await view.dialog.name.fill("Fresh");
        await forceValue(view.dialog.name, `${MAX_NAME}x`, ["input"]);
        await view.dialog.submit.click();
        await expect(view.dialog.error).toHaveText(COLLECTION_INVALID);

        await view.dialog.name.fill("Fresh");
        await forceValue(view.dialog.description, `${MAX_DESCRIPTION}x`, ["input"]);
        await view.dialog.submit.click();
        await expect(view.dialog.error).toHaveText(COLLECTION_INVALID);

        await expect(view.dialog.panel).toBeVisible();
        await view.dialog.cancel.click();
        await expect(view.rows).toHaveCount(2);
        expect(await collectionNamesInDb(folder)).toEqual(["Harbor", "Night Market"]);
      });
    });

    test("US-0047 lists collections with per-kind counts, shows their resources and an empty state", async ({ ui, picker, sandbox }) => {
      const { view } = await openCollectionsView(ui, picker, sandbox, {
        collections: [{ name: "Harbor", description: "Harbor scenes" }, { name: "Quiet Shelf" }, { name: "Spare" }],
        images: [
          { name: "beacon.png", collection: "Harbor", tags: ["night"] },
          { name: "pier.png", collection: "Harbor", tags: ["day"] },
          { name: "outside.png", collection: "Spare", tags: ["night"] },
          { name: "loose.png", tags: ["night"] },
        ],
        sounds: [{ name: "waves.wav", collection: "Harbor", tags: ["day"] }],
        videos: [{ name: "tide.mp4", collection: "Harbor", tags: ["night"] }],
        prompts: [
          { name: "dusk", collection: "Harbor", tags: ["night"] },
          { name: "dawn", collection: "Harbor" },
          { name: "noon", collection: "Harbor" },
        ],
      });

      await test.step("shows each collection with its name, description and image, sound, video and prompt counts", async () => {
        await expect(view.rows).toHaveCount(3);
        await expect(view.row("Harbor")).toContainText("Harbor scenes");
        await expectRowCounts(view, "Harbor", { image: 2, sound: 1, video: 1, prompt: 3 });
        await expect(view.descriptionOf(view.row("Quiet Shelf"))).toHaveText(/không có mô tả|no description/i);
        await expectRowCounts(view, "Quiet Shelf", { image: 0, sound: 0, video: 0, prompt: 0 });
        await expectRowCounts(view, "Spare", { image: 1, sound: 0, video: 0, prompt: 0 });
      });

      await test.step("lists only the resources of the opened collection and narrows them by search and by tag", async () => {
        const library = ui.main.library;
        await view.row("Harbor").click();
        await view.panel.open.click();
        await expect(library.collection.root).toBeVisible();
        await expect(library.collection.title).toHaveText("Harbor");
        await expect(library.collection.cards).toHaveCount(7);
        await expect(library.collection.cards.filter({ hasText: "outside.png" })).toHaveCount(0);
        await expect(library.collection.cards.filter({ hasText: "loose.png" })).toHaveCount(0);

        const search = library.page.getByTestId("library-collection-assets-search");
        await search.fill("beacon");
        await expect(library.collection.cards).toHaveCount(1);
        await expect(library.collection.cards.first()).toContainText("beacon.png");

        await search.fill("day");
        await expect(library.collection.cards).toHaveCount(2);
        await search.fill("");
        await expect(library.collection.cards).toHaveCount(7);

        await library.explorer.filterTag("night").click();
        await expect(library.collection.cards).toHaveCount(3);
        await expect(library.collection.cards.filter({ hasText: "outside.png" })).toHaveCount(0);
        await expect(library.collection.cards.filter({ hasText: "beacon.png" })).toHaveCount(1);
        await expect(library.collection.cards.filter({ hasText: "tide.mp4" })).toHaveCount(1);
        await expect(library.collection.cards.filter({ hasText: "dusk" })).toHaveCount(1);
        await library.explorer.filterClear.click();
        await expect(library.collection.cards).toHaveCount(7);
      });

      await test.step("shows the empty state with a way to create a collection when the library has none", async () => {
        await showCollections(ui);
        for (const name of ["Harbor", "Quiet Shelf", "Spare"]) {
          await selectCollectionRow(view, name);
          await deleteSelectedCollection(ui, view);
        }

        await expect(view.rows).toHaveCount(0);
        await expect(ui.main.library.explorer.emptyCollections).toBeVisible();
        await expect(ui.main.library.taxonomy.emptyCreate).toBeVisible();
        await ui.main.library.taxonomy.emptyCreate.click();
        await expect(view.dialog.panel).toBeVisible();
      });
    });

    test("US-0048 edits a collection name and description and keeps the old name on invalid input", async ({ ui, picker, sandbox }) => {
      const { folder, view } = await openCollectionsView(ui, picker, sandbox, {
        collections: [{ name: "Harbor", description: "Old description" }, { name: "Market" }],
      });

      await test.step("saves a valid new name and description and updates the collection list", async () => {
        await selectCollectionRow(view, "Harbor");
        await commitField(view.panel.name, "Harbor Lights");
        await commitField(view.panel.description, "New description");

        await expect(view.row("Harbor Lights")).toContainText("New description");
        await expect(view.row("Harbor")).toHaveCount(0);
        await expect(ui.main.library.explorer.collectionNamed("Harbor Lights")).toBeVisible();
        await expect.poll(async () => (await collectionsInDb(folder)).map((row) => [row.name, row.description])).toEqual([
          ["Harbor Lights", "New description"],
          ["Market", ""],
        ]);
        await showLibraryCollection(ui, (await collectionsInDb(folder))[0]!.id);
        await expect(ui.main.library.collection.title).toHaveText("Harbor Lights");
        await showCollections(ui);
      });

      await test.step("rejects an empty, over-long or duplicate name and keeps the old name", async () => {
        await selectCollectionRow(view, "Harbor Lights");
        await expect(view.panel.error).toHaveCount(0);

        await commitField(view.panel.name, "  ");
        await expect(view.panel.name).toHaveValue("Harbor Lights");
        await expect(view.panel.error).toHaveText(COLLECTION_NAME_REQUIRED);

        await view.panel.name.press("a");
        await expect(view.panel.error).toHaveCount(0);

        await commitField(view.panel.name, "MARKET");
        await expect(view.panel.name).toHaveValue("Harbor Lights");
        await expect(view.panel.error).toHaveText(COLLECTION_EXISTS);

        await forceValue(view.panel.name, `${MAX_NAME}x`, ["input", "change"]);
        await expect(view.panel.name).toHaveValue("Harbor Lights");
        await expect(view.panel.error).toHaveText(COLLECTION_INVALID);

        await selectCollectionRow(view, "Market");
        await expect(view.panel.error).toHaveCount(0);
        await selectCollectionRow(view, "Harbor Lights");
        await expect(view.row("Harbor Lights")).toBeVisible();
        await expect(view.rows).toHaveCount(2);
        expect(await collectionNamesInDb(folder)).toEqual(["Harbor Lights", "Market"]);
      });
    });

    test("US-0049 deletes a collection after confirmation and leaves its resources unfiled", async ({ ui, picker, sandbox }) => {
      const { folder, view } = await openCollectionsView(ui, picker, sandbox, {
        collections: [{ name: "Harbor" }, { name: "Market" }],
        images: [
          { name: "beacon.png", collection: "Harbor", tags: ["night"] },
          { name: "pier.png", collection: "Harbor" },
          { name: "stall.png", collection: "Market" },
        ],
        sounds: [{ name: "waves.wav", collection: "Harbor" }],
        prompts: [{ name: "dusk", collection: "Harbor" }],
      });

      await test.step("names the collection being deleted and how many resources become unfiled", async () => {
        await selectCollectionRow(view, "Harbor");
        await view.panel.remove.click();

        await expect(ui.main.confirm.panel).toBeVisible();
        await expect(ui.main.confirm.panel).toContainText("Harbor");
        await expect(ui.main.confirm.warning).toContainText(COLLECTION_DELETE_WARNING);
        await expect(ui.main.confirm.warning).toContainText("4");
      });

      await test.step("deletes the collection and keeps its resources in the library as unfiled", async () => {
        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(view.row("Harbor")).toHaveCount(0);
        await expect(view.rows).toHaveCount(1);
        await expect(ui.main.library.explorer.collectionNamed("Harbor")).toHaveCount(0);
        await expect.poll(() => collectionNamesInDb(folder)).toEqual(["Market"]);
        const library = await readLibrary(folder, (db) => ({ counts: db.counts(), unfiled: db.unfiled(), market: db.collection("Market").counts }));
        expect(library.counts).toEqual({ image: 3, sound: 1, video: 0, prompt: 1 });
        expect(library.unfiled).toEqual({ image: 2, sound: 1, video: 0, prompt: 1 });
        expect(library.market).toEqual({ image: 1, sound: 0, video: 0, prompt: 0 });
        expect(await storedCount(folder, "image")).toBe(3);
      });

      await test.step("keeps the collection and its resources when the deletion is cancelled", async () => {
        await selectCollectionRow(view, "Market");
        await view.panel.remove.click();
        await expect(ui.main.confirm.panel).toBeVisible();
        await expect(ui.main.confirm.panel).toContainText("Market");

        await ui.main.confirm.cancel.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(view.row("Market")).toBeVisible();
        expect(await collectionNamesInDb(folder)).toEqual(["Market"]);
        expect(await readLibrary(folder, (db) => db.collection("Market").counts)).toEqual({ image: 1, sound: 0, video: 0, prompt: 0 });
        expect(await readLibrary(folder, (db) => db.unfiled())).toEqual({ image: 2, sound: 1, video: 0, prompt: 1 });
      });
    });
  });
});
