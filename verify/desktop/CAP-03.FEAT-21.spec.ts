import { expect, test } from "../scripts/fixtures.ts";
import { readDictionary, DICT_ADDED, DICT_DELETED, DICT_DUPLICATE, DICT_EMPTY_FIELD, DICT_REQUIRED, DICT_SAVED, addEntry, dictionaryCount, DICT_NO_MATCH_HINT, editCell, openDictionary, removeEntry, startDraft, selectTarget } from "../scripts/translation.ts";

const VI_ENTRIES = [
  { src: "Lin Feng", dst: "Lâm Phong", type: "name" as const, note: "The protagonist" },
  { src: "Su Yan", dst: "Tô Yên", type: "name" as const, note: "Healer of the sect" },
  { src: "Azure City", dst: "Thanh Thành", type: "place" as const, note: "Capital of the realm" },
  { src: "Frost Blade", dst: "Hàn Kiếm", type: "term" as const, note: "" },
];

const EN_ENTRIES = [
  { src: "Master Chen", dst: "Master Chen", type: "title" as const, note: "Keep the honorific" },
  { src: "Sky Sword Sect", dst: "Sky Sword Sect", type: "org" as const, note: "" },
];

test.describe("CAP-03 Content Translation", () => {
  test.describe("FEAT-21 Translation Dictionary", () => {
    test("US-0055 adds a term to the dictionary", async ({ ui, picker, sandbox }) => {
      const { folder, novel, dictionary } = await openDictionary(ui, picker, sandbox, { VI: [VI_ENTRIES[0]!] });

      await test.step("adds the new entry to the list and announces it after confirming with source, translation, type and note", async () => {
        await addEntry(dictionary, { src: "Azure City", dst: "Thanh Thành", type: "place", note: "Capital of the realm" });

        await expect(ui.main.toast(DICT_ADDED).last()).toBeVisible();
        await expect(dictionary.draftSrc).toBeHidden();
        await expect(dictionary.rows).toHaveCount(2);
        await expect(dictionary.cell(dictionary.row("Azure City"), "dst")).toHaveText("Thanh Thành");
        await expect(dictionary.cell(dictionary.row("Azure City"), "note")).toHaveText("Capital of the realm");
        const stored = (await readDictionary(folder, novel, "VI")).find((row) => row.src === "Azure City");
        expect(stored).toMatchObject({ dst: "Thanh Thành", type: "place", note: "Capital of the realm", target: "VI" });
      });

      await test.step("rejects a missing source term or translation, asks for both and adds nothing", async () => {
        await startDraft(dictionary, { src: "", dst: "Phong Linh" });
        await dictionary.add.click();
        await expect(ui.main.toast(DICT_REQUIRED).last()).toBeVisible();
        await expect(dictionary.draftSrc).toBeVisible();

        await dictionary.draftSrc.fill("Wind Spirit");
        await dictionary.draftDst.fill("");
        await dictionary.add.click();
        await expect(ui.main.toast(DICT_REQUIRED).last()).toBeVisible();
        await expect(dictionary.draftSrc).toBeVisible();

        await dictionary.cancel.click();
        await expect(dictionary.draftSrc).toBeHidden();
        await expect(dictionary.rows).toHaveCount(2);
        expect(await readDictionary(folder, novel, "VI")).toHaveLength(2);
      });

      await test.step("rejects a source term already in the dictionary of the target language, reports it and adds nothing", async () => {
        await addEntry(dictionary, { src: "Lin Feng", dst: "Lâm Phụng", note: "Duplicate" });

        await expect(ui.main.toast(DICT_DUPLICATE).last()).toBeVisible();
        await expect(dictionary.draftSrc).toBeVisible();
        await dictionary.cancel.click();
        await expect(dictionary.rows).toHaveCount(2);
        const stored = await readDictionary(folder, novel, "VI");
        expect(stored).toHaveLength(2);
        expect(stored.find((row) => row.src === "Lin Feng")).toMatchObject({ dst: "Lâm Phong", note: "The protagonist" });
      });
    });

    test("US-0056 edits and deletes dictionary entries", async ({ ui, picker, sandbox }) => {
      const { folder, novel, dictionary } = await openDictionary(ui, picker, sandbox, { VI: VI_ENTRIES });

      await test.step("saves a changed source term, translation, type or note and shows it in the list", async () => {
        const before = await readDictionary(folder, novel, "VI");
        const entryId = before.find((row) => row.src === "Lin Feng")?.id;

        await editCell(dictionary, dictionary.row("Lin Feng"), "src", "Lin Fung");
        await expect(ui.main.toast(DICT_SAVED).last()).toBeVisible();
        await expect(dictionary.row("Lin Fung")).toBeVisible();
        await editCell(dictionary, dictionary.row("Lin Fung"), "dst", "Lâm Phụng");
        await expect(dictionary.cell(dictionary.row("Lin Fung"), "dst")).toHaveText("Lâm Phụng");
        await editCell(dictionary, dictionary.row("Lin Fung"), "type", "title");
        await editCell(dictionary, dictionary.row("Lin Fung"), "note", "The young blacksmith");
        await expect(dictionary.cell(dictionary.row("Lin Fung"), "note")).toHaveText("The young blacksmith");

        await expect.poll(async () => (await readDictionary(folder, novel, "VI")).find((row) => row.id === entryId)).toMatchObject({
          src: "Lin Fung",
          dst: "Lâm Phụng",
          type: "title",
          note: "The young blacksmith",
        });
        await expect(dictionary.rows).toHaveCount(4);
      });

      await test.step("rejects clearing the source term or translation, says it cannot be empty and keeps the old value", async () => {
        await editCell(dictionary, dictionary.row("Su Yan"), "src", "");
        await expect(ui.main.toast(DICT_EMPTY_FIELD).last()).toBeVisible();
        await expect(dictionary.row("Su Yan")).toBeVisible();

        await editCell(dictionary, dictionary.row("Su Yan"), "dst", "");
        await expect(ui.main.toast(DICT_EMPTY_FIELD).last()).toBeVisible();
        await expect(dictionary.cell(dictionary.row("Su Yan"), "dst")).toHaveText("Tô Yên");

        const stored = (await readDictionary(folder, novel, "VI")).find((row) => row.src === "Su Yan");
        expect(stored).toMatchObject({ src: "Su Yan", dst: "Tô Yên" });
      });

      await test.step("removes a deleted entry from the list and announces the deletion", async () => {
        await removeEntry(dictionary, dictionary.row("Azure City"));

        await expect(ui.main.toast(DICT_DELETED).last()).toBeVisible();
        await expect(dictionary.row("Azure City")).toHaveCount(0);
        await expect(dictionary.rows).toHaveCount(3);
        const stored = await readDictionary(folder, novel, "VI");
        expect(stored.map((row) => row.src).sort()).toEqual(["Frost Blade", "Lin Fung", "Su Yan"]);
      });
    });

    test("US-0057 searches the dictionary and keeps one per target language", async ({ ui, picker, sandbox }) => {
      const { dictionary } = await openDictionary(ui, picker, sandbox, { VI: VI_ENTRIES, EN: EN_ENTRIES });

      await test.step("shows only the entries whose source term, translation or note match, with the shown/total count", async () => {
        await expect(dictionary.rows).toHaveCount(4);
        await expect(dictionary.count).toHaveText(dictionaryCount(4, 4));

        await dictionary.search.fill("frost");
        await expect(dictionary.rows).toHaveCount(1);
        await expect(dictionary.row("Frost Blade")).toBeVisible();
        await expect(dictionary.count).toHaveText(dictionaryCount(1, 4));

        await dictionary.search.fill("Tô Yên");
        await expect(dictionary.rows).toHaveCount(1);
        await expect(dictionary.row("Su Yan")).toBeVisible();
        await expect(dictionary.count).toHaveText(dictionaryCount(1, 4));

        await dictionary.search.fill("capital");
        await expect(dictionary.rows).toHaveCount(1);
        await expect(dictionary.row("Azure City")).toBeVisible();
        await expect(dictionary.count).toHaveText(dictionaryCount(1, 4));

        await dictionary.search.fill("");
        await expect(dictionary.rows).toHaveCount(4);
        await expect(dictionary.count).toHaveText(dictionaryCount(4, 4));
      });

      await test.step("reports no results and suggests another keyword when nothing matches", async () => {
        await dictionary.search.fill("zzzz");

        await expect(dictionary.rows).toHaveCount(0);
        await expect(dictionary.empty).toBeVisible();
        await expect(dictionary.emptyHint).toHaveText(DICT_NO_MATCH_HINT);
        await expect(dictionary.count).toHaveText(dictionaryCount(0, 4));
        await dictionary.search.fill("");
      });

      await test.step("lists only the entries of the selected target language after switching the target", async () => {
        await selectTarget(ui, "EN");

        await expect(dictionary.rows).toHaveCount(2);
        await expect(dictionary.row("Master Chen")).toBeVisible();
        await expect(dictionary.row("Sky Sword Sect")).toBeVisible();
        await expect(dictionary.row("Lin Feng")).toHaveCount(0);
        await expect(dictionary.count).toHaveText(dictionaryCount(2, 2));

        await selectTarget(ui, "VI");

        await expect(dictionary.rows).toHaveCount(4);
        await expect(dictionary.row("Lin Feng")).toBeVisible();
        await expect(dictionary.row("Master Chen")).toHaveCount(0);
        await expect(dictionary.count).toHaveText(dictionaryCount(4, 4));
      });
    });
  });
});
