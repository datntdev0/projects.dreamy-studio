import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INSPECT_STEPS } from "../pages/novels.ts";
import { expect, test } from "../scripts/fixtures.ts";
import { BAD_FORMAT, CHAPTER_FILE_MISSING, IMPORT_FAILED, MANIFEST_MISSING, NOT_A_ZIP, NOVEL_IMPORTED } from "../scripts/messages.ts";
import { checkPackage, openLibrary, pickPackage, PNG_BYTES, previewPackage, showNovelList, writeBytes, writePackage, writeRawPackage, zipBytes } from "../scripts/novels.ts";
import { readParagraphs, readWorkspace } from "../scripts/workspaces.ts";

const CHAPTERS = [
  { title: "The Harbor Wakes", text: "The harbor wakes slowly.\nGulls circle the pier.\n" },
  { title: "Fog", text: "Morning fog lifts.\n" },
  { title: "Night Returns", text: "Night returns to the sea.\nLanterns burn low.\n" },
];

test.describe("CAP-02 Content Source Management", () => {
  test.describe("FEAT-05 Novel Package Import", () => {
    test("US-0011 checks a package step by step and summarizes it before importing", async ({ ui, picker, sandbox }) => {
      const pack = sandbox.file("harbor.dsnovel");
      await writePackage(pack, { title: "Harbor Lights", author: "Mai Tran", lang: "vi", chapters: CHAPTERS, cover: PNG_BYTES });
      await openLibrary(ui, picker, sandbox);
      await showNovelList(ui);

      await test.step("shows every check step of a valid package as passed", async () => {
        await checkPackage(ui, picker, pack);

        await expect(ui.main.importDialog.progress).toContainText("harbor.dsnovel");
        for (const step of INSPECT_STEPS) {
          await expect(ui.main.importDialog.step(step)).toHaveClass(/is-done/);
        }
        await expect(ui.main.importDialog.resultOk).toBeVisible();
      });

      await test.step("summarizes the title, author, language, chapter count, word count and cover", async () => {
        await ui.main.importDialog.next.click();

        await expect(ui.main.importDialog.form).toBeVisible();
        await expect(ui.main.importDialog.title).toHaveValue("Harbor Lights");
        await expect(ui.main.importDialog.author).toHaveValue("Mai Tran");
        await expect(ui.main.importDialog.lang).toHaveValue("VI");
        await expect(ui.main.importDialog.stats).toContainText("3");
        await expect(ui.main.importDialog.stats).toContainText("19");
        await expect(ui.main.importDialog.preview.getByTestId("cover")).toHaveCSS("background-image", /url\(/);
      });
    });

    test("US-0012 imports the edited novel with all chapters and the cover and warns about a duplicate title", async ({ ui, picker, sandbox }) => {
      const pack = sandbox.file("harbor.dsnovel");
      await writePackage(pack, { title: "Harbor Lights", author: "Mai Tran", lang: "vi", chapters: CHAPTERS, cover: PNG_BYTES });
      const folder = await openLibrary(ui, picker, sandbox);
      await showNovelList(ui);

      await test.step("creates the novel from the edited information with every chapter and the cover", async () => {
        await previewPackage(ui, picker, pack);
        await ui.main.importDialog.display.fill("Harbor");
        await ui.main.importDialog.title.fill("Harbor Lights Revised");
        await ui.main.importDialog.author.fill("Mai");
        await ui.main.importDialog.lang.selectOption("KO");
        await ui.main.importDialog.description.fill("Imported from a package.");
        await ui.main.importDialog.tags.fill("Sea, Light");
        await ui.main.importDialog.submit.click();

        await expect(ui.main.importDialog.root).toBeHidden();
        await expect(ui.main.toast(NOVEL_IMPORTED)).toBeVisible();
        const novels = await readWorkspace(folder, (db) => db.novels());
        const id = novels[0]?.id ?? 0;
        expect(novels).toHaveLength(1);
        expect(novels[0]).toMatchObject({ title: "Harbor Lights Revised", name: "Harbor", author: "Mai", lang: "KO", description: "Imported from a package.", origin: "imported" });
        expect(await readWorkspace(folder, (db) => db.tags("Harbor Lights Revised"))).toEqual(["light", "sea"]);
        const chapters = await readWorkspace(folder, (db) => db.chapters("Harbor Lights Revised"));
        expect(chapters.map((chapter) => chapter.title)).toEqual(CHAPTERS.map((chapter) => chapter.title));
        expect(chapters.map((chapter) => chapter.seq)).toEqual([1, 2, 3]);
        expect(await readParagraphs(folder, id, chapters[0]?.id ?? "")).toEqual(["The harbor wakes slowly.", "Gulls circle the pier."]);
        expect(existsSync(join(folder, "novels", String(id), "cover.png"))).toBe(true);
        await expect(ui.main.novels.card("Harbor")).toBeVisible();
      });

      await test.step("warns when the entered title matches a novel already in the workspace", async () => {
        await previewPackage(ui, picker, pack);
        await expect(ui.main.importDialog.duplicate).toBeHidden();

        await ui.main.importDialog.title.fill("Harbor Lights Revised");

        await expect(ui.main.importDialog.duplicate).toBeVisible();
        await ui.main.importDialog.title.fill("Harbor Lights Again");
        await expect(ui.main.importDialog.duplicate).toBeHidden();
        await ui.main.importDialog.cancel.click();
        await expect(ui.main.importDialog.root).toBeHidden();
      });
    });

    test("US-0013 explains why a package cannot be imported and leaves no half-imported data", async ({ ui, picker, sandbox }) => {
      const notes = sandbox.file("notes.txt");
      const garbage = sandbox.file("garbage.dsnovel");
      const noManifest = sandbox.file("no-manifest.zip");
      const noChapter = sandbox.file("no-chapter.dsnovel");
      const valid = sandbox.file("harbor.dsnovel");
      await writeFile(notes, "just some notes");
      await writeFile(garbage, "this is not a zip archive ".repeat(40));
      await writeBytes(noManifest, zipBytes([{ name: "chapters/001.md", data: Buffer.from("text\n") }]));
      await writeRawPackage(noChapter, { formatVersion: 1, title: "Broken", lang: "en", chapters: [{ file: "chapters/001.md", title: "One" }] });
      await writePackage(valid, { title: "Harbor Lights", chapters: CHAPTERS });
      const folder = await openLibrary(ui, picker, sandbox);
      await showNovelList(ui);
      await ui.main.novels.importButton.click();
      await expect(ui.main.importDialog.root).toBeVisible();

      await test.step("stops at the failing check, states the reason and creates no novel", async () => {
        await pickPackage(ui, picker, notes);
        await ui.main.importDialog.check.click();
        await expect(ui.main.importDialog.step("format")).toHaveClass(/is-error/);
        await expect(ui.main.importDialog.resultBad).toBeVisible();
        await expect(ui.main.importDialog.error).toContainText(BAD_FORMAT);
        await expect(ui.main.importDialog.step("open")).toHaveCount(0);
        await expect(ui.main.importDialog.next).toBeDisabled();

        await ui.main.importDialog.back.click();
        await ui.main.importDialog.clear.click();
        await pickPackage(ui, picker, garbage);
        await ui.main.importDialog.check.click();
        await expect(ui.main.importDialog.step("open")).toHaveClass(/is-error/);
        await expect(ui.main.importDialog.error).toContainText(NOT_A_ZIP);
        await expect(ui.main.importDialog.step("manifest")).toHaveCount(0);

        await ui.main.importDialog.back.click();
        await ui.main.importDialog.clear.click();
        await pickPackage(ui, picker, noManifest);
        await ui.main.importDialog.check.click();
        await expect(ui.main.importDialog.step("manifest")).toHaveClass(/is-error/);
        await expect(ui.main.importDialog.error).toContainText(MANIFEST_MISSING);
        await expect(ui.main.importDialog.step("chapters")).toHaveCount(0);

        await ui.main.importDialog.back.click();
        await ui.main.importDialog.clear.click();
        await pickPackage(ui, picker, noChapter);
        await ui.main.importDialog.check.click();
        await expect(ui.main.importDialog.step("chapters")).toHaveClass(/is-error/);
        await expect(ui.main.importDialog.error).toContainText(CHAPTER_FILE_MISSING);
        await expect(ui.main.importDialog.step("list")).toHaveCount(0);

        await ui.main.importDialog.cancel.click();
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual([]);
        expect(existsSync(join(folder, "novels"))).toBe(false);
      });

      await test.step("reports a failure in the middle of the import and leaves no half-imported novel", async () => {
        await writeFile(join(folder, "novels"), "blocks the novel files folder");

        await previewPackage(ui, picker, valid);
        await ui.main.importDialog.submit.click();

        await expect(ui.main.importDialog.failed).toBeVisible();
        await expect(ui.main.importDialog.failed).toContainText(IMPORT_FAILED);
        await expect(ui.main.importDialog.root).toBeVisible();
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual([]);
        expect(await readWorkspace(folder, (db) => db.chapterCount())).toBe(0);
        expect(statSync(join(folder, "novels")).isFile()).toBe(true);
        await ui.main.importDialog.cancel.click();
        await expect(ui.main.novels.empty).toBeVisible();
      });
    });
  });
});
