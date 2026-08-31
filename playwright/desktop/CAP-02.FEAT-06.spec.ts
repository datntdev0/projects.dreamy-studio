import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { expect, test } from "../scripts/fixtures.ts";
import { EXPORT_BLOCKED, NOVEL_EXPORTED } from "../scripts/messages.ts";
import { entryText, openLibrary, PNG_BYTES, readPackage, selectNovel, showNovelList } from "../scripts/novels.ts";

const SAVE_PICK = "novel_package_save_pick";
const CHAPTERS = [
  { title: "The Harbor Wakes", paragraphs: ["The harbor wakes slowly.", "Gulls circle the pier."] },
  { title: "Fog", paragraphs: ["Morning fog lifts."] },
];

test.describe("CAP-02 Content Source Management", () => {
  test.describe("FEAT-06 Novel Package Export", () => {
    test("US-0014 exports a novel with chapters as a .dsnovel package and writes nothing when cancelled", async ({ ui, picker, sandbox }) => {
      const target = sandbox.file("backup.dsnovel");
      await openLibrary(ui, picker, sandbox, [
        { title: "Harbor Lights", name: "Harbor", author: "Mai Tran", lang: "VI", chapters: CHAPTERS, cover: PNG_BYTES },
      ]);
      await showNovelList(ui);
      await selectNovel(ui, "Harbor");

      await test.step("suggests a .dsnovel file name from the novel name, writes the package and reports the saved file", async () => {
        await picker.queue(SAVE_PICK, target);
        await ui.main.panel.export.click();

        await expect(ui.main.toast(NOVEL_EXPORTED)).toContainText("backup.dsnovel");
        expect(await picker.lastArgs(SAVE_PICK)).toEqual({ fileName: "Harbor.dsnovel" });
        expect(existsSync(target)).toBe(true);
        const archive = await readPackage(target);
        expect(archive.manifest).toMatchObject({ formatVersion: 1, title: "Harbor Lights", name: "Harbor", author: "Mai Tran", lang: "vi", cover: "cover.png" });
        expect(archive.manifest.chapters).toEqual([
          { file: "chapters/001.txt", title: "The Harbor Wakes" },
          { file: "chapters/002.txt", title: "Fog" },
        ]);
        expect(entryText(archive, "chapters/001.txt")).toBe("The harbor wakes slowly.\nGulls circle the pier.\n");
        expect(entryText(archive, "chapters/002.txt")).toBe("Morning fog lifts.\n");
        expect(archive.entries.get("cover.png")?.equals(PNG_BYTES)).toBe(true);
      });

      await test.step("creates no file when the save dialog is cancelled", async () => {
        const before = await readdir(sandbox.filesDir);
        await picker.queue(SAVE_PICK, null);

        await ui.main.panel.export.click();

        await expect.poll(() => picker.calls(SAVE_PICK)).toBe(2);
        expect(await readdir(sandbox.filesDir)).toEqual(before);
        await expect(ui.main.toast(NOVEL_EXPORTED)).toHaveCount(1);
      });
    });

    test("US-0015 refuses to export a novel without chapters and creates no file", async ({ ui, picker, sandbox }) => {
      await openLibrary(ui, picker, sandbox, [{ title: "Empty Novel" }]);
      await showNovelList(ui);
      await selectNovel(ui, "Empty Novel");

      await test.step("blocks the export with a reason and creates no file", async () => {
        await expect(ui.main.panel.export).toBeDisabled();
        await expect(ui.main.panel.export).toHaveAttribute("aria-label", EXPORT_BLOCKED);

        await ui.main.panel.export.click({ force: true });

        expect(await picker.calls(SAVE_PICK)).toBe(0);
        expect(await readdir(sandbox.filesDir)).toEqual([]);
        await expect(ui.main.toasts).toHaveCount(0);
      });
    });
  });
});
