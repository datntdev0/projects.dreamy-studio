import { expect, test } from "../scripts/fixtures.ts";
import { CHAPTER_EMPTY, CHAPTER_SAVED, NO_CHANGES, PARAGRAPH_EMPTY, PARAGRAPH_SAVED } from "../scripts/messages.ts";
import { openLibrary, openReader } from "../scripts/novels.ts";
import { readParagraphs, readWorkspace, type SeedChapter } from "../scripts/workspaces.ts";

const NOVEL = "Harbor Lights";

const CHAPTERS: SeedChapter[] = [
  { title: "The Harbor Wakes", paragraphs: ["The harbor wakes slowly.", "Gulls circle the pier.", "Fog."] },
  { title: "Fog", paragraphs: ["Morning fog lifts."] },
  { title: "Night Returns", paragraphs: ["Night returns to the sea.", "Lanterns burn low."] },
];

async function chapterState(folder: string, seq: number): Promise<{ words: number; paragraphs: string[] }> {
  const chapter = (await readWorkspace(folder, (db) => db.chapters(NOVEL)))[seq - 1];
  const id = await readWorkspace(folder, (db) => db.novelId(NOVEL));
  return { words: chapter?.wordCount ?? -1, paragraphs: await readParagraphs(folder, id, chapter?.id ?? "") };
}

test.describe("CAP-02 Content Source Management", () => {
  test.describe("FEAT-11 Novel Reading and Editing", () => {
    test("US-0026 reads a chapter as numbered paragraphs and moves between chapters", async ({ ui, picker, sandbox }) => {
      await openLibrary(ui, picker, sandbox, [{ title: NOVEL, chapters: CHAPTERS }]);

      await test.step("shows the chapter content as numbered paragraphs", async () => {
        await openReader(ui, NOVEL, 1);

        await expect(ui.main.reader.title).toContainText("The Harbor Wakes");
        await expect(ui.main.reader.paragraphs).toHaveCount(3);
        await expect(ui.main.reader.paragraph(1).locator(".rd-no")).toHaveText("1");
        await expect(ui.main.reader.paragraph(3).locator(".rd-no")).toHaveText("3");
        expect(await ui.main.reader.texts()).toEqual(["The harbor wakes slowly.", "Gulls circle the pier.", "Fog."]);
      });

      await test.step("shows the previous, next or typed chapter", async () => {
        await ui.main.reader.next.click();
        await expect(ui.main.reader.eyebrow).toContainText("2 / 3");
        await expect(ui.main.reader.title).toContainText("Fog");
        expect(await ui.main.reader.texts()).toEqual(["Morning fog lifts."]);

        await ui.main.reader.prev.click();
        await expect(ui.main.reader.eyebrow).toContainText("1 / 3");
        await expect(ui.main.reader.title).toContainText("The Harbor Wakes");

        await ui.main.reader.jump.selectOption("3");
        await expect(ui.main.reader.eyebrow).toContainText("3 / 3");
        await expect(ui.main.reader.title).toContainText("Night Returns");
        expect(await ui.main.reader.texts()).toEqual(["Night returns to the sea.", "Lanterns burn low."]);
      });
    });

    test("US-0027 customizes the reading appearance and keeps it for later", async ({ ui, app, picker, sandbox }) => {
      await openLibrary(ui, picker, sandbox, [{ title: NOVEL, chapters: CHAPTERS }]);
      await openReader(ui, NOVEL, 1);
      await expect(ui.main.display.root).toBeVisible();

      await test.step("applies a changed font, size, line spacing, width and background at once", async () => {
        await ui.main.display.font("mono").click();
        await ui.main.display.size.getByTestId("slider").fill("20");
        await ui.main.display.lineHeight("2").click();
        await ui.main.display.width("820").click();
        await ui.main.display.paper("sepia").click();

        await expect(ui.main.reader.surface).toHaveAttribute("style", /--rd-fs:20px/);
        await expect(ui.main.reader.surface).toHaveAttribute("style", /--rd-lh:2/);
        await expect(ui.main.reader.surface).toHaveAttribute("style", /--rd-w:820px/);
        await expect(ui.main.reader.surface).toHaveAttribute("style", /--rd-font:var\(--font-mono\)/);
        await expect(ui.main.reader.surface).toHaveAttribute("data-paper", "sepia");
        await expect(ui.main.display.sizeValue).toContainText("20");
      });

      await test.step("keeps the customization when the reader is opened again later", async () => {
        expect(await app.page.evaluate(() => localStorage.getItem("ds.rd.prefs"))).toContain('"size":20');
        await app.page.reload();
        await expect(ui.main.root).toBeVisible();

        await openReader(ui, NOVEL, 1);

        await expect(ui.main.reader.surface).toHaveAttribute("style", /--rd-fs:20px/);
        await expect(ui.main.reader.surface).toHaveAttribute("style", /--rd-lh:2/);
        await expect(ui.main.reader.surface).toHaveAttribute("style", /--rd-w:820px/);
        await expect(ui.main.reader.surface).toHaveAttribute("data-paper", "sepia");
        await expect(ui.main.display.font("mono")).toHaveAttribute("aria-pressed", "true");
        await expect(ui.main.display.paper("sepia")).toHaveAttribute("aria-pressed", "true");
      });
    });

    test("US-0028 edits a paragraph, adds a paragraph and rewrites the whole chapter", async ({ ui, picker, sandbox }) => {
      const folder = await openLibrary(ui, picker, sandbox, [{ title: NOVEL, chapters: CHAPTERS }]);
      await openReader(ui, NOVEL, 1);
      await ui.main.reader.mode("edit").click();

      await test.step("updates the paragraph text and recalculates the chapter word count", async () => {
        expect((await chapterState(folder, 1)).words).toBe(9);

        await ui.main.reader.paragraph(2).click();
        await ui.main.reader.editor.fill("Gulls circle the old pier slowly.");
        await ui.main.reader.save.click();

        await expect(ui.main.toast(PARAGRAPH_SAVED)).toBeVisible();
        await expect(ui.main.reader.editor).toBeHidden();
        expect(await ui.main.reader.texts()).toEqual(["The harbor wakes slowly.", "Gulls circle the old pier slowly.", "Fog."]);
        expect(await chapterState(folder, 1)).toEqual({ words: 11, paragraphs: ["The harbor wakes slowly.", "Gulls circle the old pier slowly.", "Fog."] });
      });

      await test.step("does not save an empty or unchanged paragraph", async () => {
        const saved = await chapterState(folder, 1);

        await ui.main.reader.paragraph(1).click();
        await ui.main.reader.save.click();
        await expect(ui.main.toast(NO_CHANGES)).toBeVisible();

        await ui.main.reader.paragraph(3).click();
        await ui.main.reader.editor.fill("   ");
        await ui.main.reader.save.click();
        await expect(ui.main.toast(PARAGRAPH_EMPTY)).toBeVisible();
        await ui.main.reader.cancel.click();

        expect(await chapterState(folder, 1)).toEqual(saved);
      });

      await test.step("adds a new paragraph and rewrites the whole chapter without leaving it empty", async () => {
        await ui.main.reader.addPassage.click();
        await ui.main.reader.editor.fill("A new passage.");
        await ui.main.reader.save.click();
        await expect(ui.main.reader.paragraphs).toHaveCount(4);
        expect((await chapterState(folder, 1)).paragraphs.at(-1)).toBe("A new passage.");

        await ui.main.reader.mode("write").click();
        await ui.main.reader.writer.fill("Rewritten one.\n\nRewritten two.");
        await ui.main.reader.writeSave.click();
        await expect(ui.main.toast(CHAPTER_SAVED)).toBeVisible();
        expect(await chapterState(folder, 1)).toEqual({ words: 4, paragraphs: ["Rewritten one.", "Rewritten two."] });

        await ui.main.reader.writer.fill("   ");
        await ui.main.reader.writeSave.click();
        await expect(ui.main.toast(CHAPTER_EMPTY)).toBeVisible();
        expect(await chapterState(folder, 1)).toEqual({ words: 4, paragraphs: ["Rewritten one.", "Rewritten two."] });
      });
    });
  });
});
