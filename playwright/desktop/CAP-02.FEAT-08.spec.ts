import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../scripts/fixtures.ts";
import { COVER_CHANGED, COVER_REMOVED, IMAGE_TOO_LARGE, NOT_AN_IMAGE, TAG_EXISTS, TITLE_EMPTY } from "../scripts/messages.ts";
import { openLibrary, PNG_BYTES, selectNovel, showNovelList } from "../scripts/novels.ts";
import { readWorkspace } from "../scripts/workspaces.ts";

const COVER_LIMIT = 8 * 1024 * 1024;
const TEN_TAGS = ["t01", "t02", "t03", "t04", "t05", "t06", "t07", "t08", "t09", "t10"];

test.describe("CAP-02 Content Source Management", () => {
  test.describe("FEAT-08 Novel Information Management", () => {
    test("US-0018 edits the novel information and keeps the title when it would be cleared", async ({ ui, picker, sandbox }) => {
      const folder = await openLibrary(ui, picker, sandbox, [{ title: "Harbor Lights", name: "", author: "Mai Tran", lang: "VI", description: "Old text." }]);
      await showNovelList(ui);
      await selectNovel(ui, "Harbor Lights");

      await test.step("saves the edited title, display name, author, language and description and updates the list", async () => {
        await ui.main.panel.setField(ui.main.panel.title, "Harbor Lights II");
        await ui.main.panel.setField(ui.main.panel.name, "Harbor");
        await ui.main.panel.setField(ui.main.panel.authorInput, "Mai");
        await ui.main.panel.langSelect.selectOption("EN");
        await ui.main.panel.setField(ui.main.panel.description, "New text.");

        await expect.poll(() => readWorkspace(folder, (db) => db.novels())).toMatchObject([
          { title: "Harbor Lights II", name: "Harbor", author: "Mai", lang: "EN", description: "New text." },
        ]);
        await expect(ui.main.novels.card("Harbor")).toBeVisible();
        await expect(ui.main.panel.heading).toHaveText("Harbor");
        await expect(ui.main.panel.original).toHaveText("Harbor Lights II");
        await expect(ui.main.panel.author).toHaveText("Mai");
        await expect(ui.main.panel.lang).toHaveText("EN");
      });

      await test.step("uses the title as the display name when the display name is empty or equal to the title", async () => {
        await ui.main.panel.setField(ui.main.panel.name, "");

        await expect(ui.main.novels.card("Harbor Lights II")).toBeVisible();
        await expect(ui.main.panel.heading).toHaveText("Harbor Lights II");
        await expect(ui.main.panel.original).toBeHidden();

        await ui.main.panel.setField(ui.main.panel.name, "Harbor");
        await expect(ui.main.panel.heading).toHaveText("Harbor");
        await ui.main.panel.setField(ui.main.panel.name, "Harbor Lights II");

        await expect(ui.main.novels.card("Harbor Lights II")).toBeVisible();
        await expect(ui.main.panel.heading).toHaveText("Harbor Lights II");
        await expect(ui.main.panel.original).toBeHidden();
        expect((await readWorkspace(folder, (db) => db.novels()))[0]?.name).toBe("");
      });

      await test.step("rejects a cleared title and keeps the previous one", async () => {
        await ui.main.panel.setField(ui.main.panel.title, "  ");

        await expect(ui.main.toast(TITLE_EMPTY)).toBeVisible();
        await expect(ui.main.panel.title).toHaveValue("Harbor Lights II");
        expect((await readWorkspace(folder, (db) => db.novels()))[0]?.title).toBe("Harbor Lights II");
        await expect(ui.main.novels.card("Harbor Lights II")).toBeVisible();
      });
    });

    test("US-0019 adds normalized tags, rejects invalid ones and removes tags", async ({ ui, picker, sandbox }) => {
      const folder = await openLibrary(ui, picker, sandbox, [{ title: "Harbor Lights", tags: TEN_TAGS }]);
      await showNovelList(ui);
      await selectNovel(ui, "Harbor Lights");
      await expect(ui.main.panel.tags).toHaveCount(10);

      await test.step("normalizes a valid tag to lowercase with dashes and attaches it to the novel", async () => {
        await ui.main.panel.addTag("Dark Fantasy");

        await expect(ui.main.panel.tag("dark-fantasy")).toBeVisible();
        await expect(ui.main.panel.tags).toHaveCount(11);
        expect(await readWorkspace(folder, (db) => db.tags("Harbor Lights"))).toContain("dark-fantasy");
      });

      await test.step("rejects an empty tag, a duplicate tag and any tag once the novel has 12 tags", async () => {
        await ui.main.panel.addTag("   ");
        await expect(ui.main.panel.tags).toHaveCount(11);

        await ui.main.panel.addTag("DARK fantasy");
        await expect(ui.main.toast(TAG_EXISTS)).toBeVisible();
        await expect(ui.main.panel.tags).toHaveCount(11);

        await ui.main.panel.addTag("extra");
        await expect(ui.main.panel.tags).toHaveCount(12);
        await expect(ui.main.panel.tagInput).toBeDisabled();
        expect(await readWorkspace(folder, (db) => db.tags("Harbor Lights"))).toHaveLength(12);
      });

      await test.step("detaches a removed tag from the novel", async () => {
        await ui.main.panel.tag("dark-fantasy").getByTestId("novel-panel-tag-remove").click();

        await expect(ui.main.panel.tag("dark-fantasy")).toHaveCount(0);
        await expect(ui.main.panel.tags).toHaveCount(11);
        expect(await readWorkspace(folder, (db) => db.tags("Harbor Lights"))).not.toContain("dark-fantasy");
      });
    });

    test("US-0020 sets, rejects and removes the cover image", async ({ ui, picker, sandbox }) => {
      const folder = await openLibrary(ui, picker, sandbox, [{ title: "Harbor Lights" }]);
      const coverFile = join(folder, "novels", "1", "cover.png");
      await showNovelList(ui);
      await selectNovel(ui, "Harbor Lights");
      await expect(ui.main.panel.coverRemove).toBeDisabled();

      await test.step("saves a valid image up to 8 MB and shows it as the cover", async () => {
        await ui.main.panel.coverInput.setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG_BYTES });

        await expect(ui.main.toast(COVER_CHANGED)).toBeVisible();
        await expect(ui.main.panel.cover).toHaveCSS("background-image", /url\(/);
        await expect(ui.main.panel.coverRemove).toBeEnabled();
        expect(existsSync(coverFile)).toBe(true);
      });

      await test.step("rejects an image over 8 MB or in an unsupported format with a reason and keeps the cover", async () => {
        const before = await readFile(coverFile);

        await ui.main.panel.coverInput.setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(COVER_LIMIT + 1) });
        await expect(ui.main.toast(IMAGE_TOO_LARGE)).toBeVisible();

        await ui.main.panel.coverInput.setInputFiles({ name: "animated.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
        await expect(ui.main.toast(NOT_AN_IMAGE)).toBeVisible();

        expect((await readFile(coverFile)).equals(before)).toBe(true);
        await expect(ui.main.panel.cover).toHaveCSS("background-image", /url\(/);
      });

      await test.step("returns to the default cover when the cover is removed", async () => {
        await ui.main.panel.coverRemove.click();

        await expect(ui.main.toast(COVER_REMOVED)).toBeVisible();
        await expect(ui.main.panel.cover).toHaveClass(/is-empty/);
        await expect(ui.main.panel.coverRemove).toBeDisabled();
        expect(existsSync(coverFile)).toBe(false);
      });
    });
  });
});
