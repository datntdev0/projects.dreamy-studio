import { expect, test } from "../scripts/fixtures.ts";
import { openLibraryView, fillPromptForm, openImportDialog, openWriteDialog, PROMPT_BYTES_LIMIT, readPrompt, snapshotPrompts, stageFile, stagePrompt, stageSizedFile, readLibrary, BADGE_INVALID, BADGE_VALID, CHECK_EMPTY, CHECK_TOO_LARGE_BY_KIND, CHECK_UNREADABLE, CHECK_UNSUPPORTED_BY_KIND, DROPZONE_LABEL_BY_KIND, PROMPT_NAME_REQUIRED, PROMPT_NAME_TOO_LONG, PROMPT_SAVED, PROMPT_TEXT_REQUIRED, PROMPT_TEXT_TOO_LARGE, UPLOAD_CLOSE_BY_KIND, UPLOAD_SUBMIT_BY_KIND, UPLOAD_SUCCESS_BY_KIND, UPLOAD_TITLE_BY_KIND } from "../scripts/library.ts";

const NAME_LIMIT = 120;
const SEED = {
  collections: [{ name: "Scripts" }],
  prompts: [{ name: "Existing prompt", text: "Already stored" }],
};

test.describe("CAP-05 Asset Library Management", () => {
  test.describe("FEAT-13 Prompt Authoring", () => {
    test("US-0032 writes a prompt with name, kind, content, rights, tags and collection and lists its variables once each", async ({ ui, picker, sandbox }) => {
      const { folder, ids } = await openLibraryView(ui, picker, sandbox, SEED, "prompts");
      const section = ui.main.library.prompts;
      const prompts = await openWriteDialog(ui);
      const content = "Wide shot of {{hero}} walking through {{city}} at night.\nKeep {{hero}} in focus.";

      await test.step("saves the prompt and shows it in the library with the chosen name, kind, content, tags, collection and rights", async () => {
        await fillPromptForm(prompts, {
          name: "Noir opener",
          kind: "video",
          text: content,
          collection: ids.collections["Scripts"],
          tags: "Cinematic, Night Scene",
          rights: "licensed",
        });
        await prompts.dialog.submit.click();

        await expect(ui.main.toast(PROMPT_SAVED)).toContainText("Noir opener");
        await expect(prompts.dialog.panel).toBeHidden();
        await expect(section.cards).toHaveCount(2);
        await expect(prompts.card("Noir opener")).toBeVisible();
        const stored = await readPrompt(folder, "Noir opener");
        expect(stored.text).toBe(content);
        expect(stored.row).toMatchObject({ kind: "video", rights: "licensed", collectionId: ids.collections["Scripts"], origin: "app", tags: ["cinematic", "night-scene"] });
        await prompts.card("Noir opener").click();
        await expect(prompts.inspector.name).toHaveValue("Noir opener");
        await expect(prompts.inspector.kind).toHaveValue("video");
        await expect(prompts.inspector.text).toHaveValue(content);
        await expect(prompts.inspector.collection).toHaveValue(String(ids.collections["Scripts"]));
        await expect(prompts.inspector.rights).toHaveValue("licensed");
        await expect(prompts.inspector.tags).toHaveText(["cinematic", "night-scene"]);
      });

      await test.step("lists each recognised variable once while the content is typed", async () => {
        await prompts.write.click();
        await expect(prompts.dialog.panel).toBeVisible();
        await prompts.dialog.text.fill("Hello {{name}}, welcome to {{place}}. Bye {{name}}.");

        await expect(prompts.dialog.variables).toContainText("name, place");
        await expect(prompts.dialog.variables).not.toContainText("name, place, name");

        await prompts.dialog.text.fill("Hello {{name}}, welcome to {{place}}. Bye {{name}}. Mood: {{mood}}.");

        await expect(prompts.dialog.variables).toContainText("name, place, mood");
      });
    });

    test("US-0033 rejects an invalid name or content with an error at the field and creates no prompt", async ({ ui, picker, sandbox }) => {
      const { folder } = await openLibraryView(ui, picker, sandbox, SEED, "prompts");
      const prompts = await openWriteDialog(ui);
      const before = await snapshotPrompts(folder);

      await test.step("refuses an empty name and a name longer than 120 characters with an error at the name field", async () => {
        await fillPromptForm(prompts, { text: "Valid content", rights: "own" });
        await prompts.dialog.submit.click();

        await expect(prompts.dialog.nameError).toBeVisible();
        await expect(prompts.dialog.nameError).toHaveText(PROMPT_NAME_REQUIRED);
        await expect(prompts.dialog.textError).toBeHidden();
        expect(await snapshotPrompts(folder)).toEqual(before);

        await prompts.setValue(prompts.dialog.name, "N".repeat(NAME_LIMIT + 1));
        await prompts.dialog.submit.click();

        await expect(prompts.dialog.nameError).toBeVisible();
        await expect(prompts.dialog.nameError).toHaveText(PROMPT_NAME_TOO_LONG);
        await expect(ui.main.toasts).toHaveCount(0);
        await expect(prompts.dialog.panel).toBeVisible();
        expect(await snapshotPrompts(folder)).toEqual(before);
      });

      await test.step("refuses empty content and content larger than 256 KB with an error at the content field", async () => {
        await prompts.dialog.name.fill("Valid name");
        await prompts.dialog.text.fill("");
        await prompts.dialog.submit.click();

        await expect(prompts.dialog.textError).toBeVisible();
        await expect(prompts.dialog.textError).toHaveText(PROMPT_TEXT_REQUIRED);
        await expect(prompts.dialog.nameError).toBeHidden();
        expect(await snapshotPrompts(folder)).toEqual(before);

        await prompts.setValue(prompts.dialog.text, "x".repeat(PROMPT_BYTES_LIMIT + 1));
        await prompts.dialog.submit.click();

        await expect(prompts.dialog.textError).toBeVisible();
        await expect(prompts.dialog.textError).toHaveText(PROMPT_TEXT_TOO_LARGE);
        await expect(ui.main.toasts).toHaveCount(0);
        await expect(prompts.dialog.panel).toBeVisible();
        expect(await snapshotPrompts(folder)).toEqual(before);
      });
    });

    test("US-0034 imports prompts from .txt and .md files and marks invalid files with a reason", async ({ ui, picker, sandbox }) => {
      const { folder } = await openLibraryView(ui, picker, sandbox, SEED, "prompts");
      const txtBody = "Describe {{hero}} at dawn.";
      const mdBody = "# Brief\nShow {{place}} in {{style}} style.";
      const txt = await stagePrompt(sandbox, "Dawn scene.txt", txtBody);
      const md = await stagePrompt(sandbox, "hero-brief.md", mdBody);
      const wrongType = await stagePrompt(sandbox, "notes.docx", "Looks like text");
      const empty = await stagePrompt(sandbox, "blank.txt", "");
      const unreadable = await stageFile(sandbox, "binary.txt", Buffer.from([0xc3, 0x28, 0xa0, 0xa1]));
      const oversized = await stageSizedFile(sandbox, "huge.md", PROMPT_BYTES_LIMIT + 1);

      await test.step("creates one prompt per valid file with the file content and the name taken from the file name", async () => {
        const prompts = await openImportDialog(ui, picker, [txt, md]);
        await expect(prompts.dialog.title).toHaveText(UPLOAD_TITLE_BY_KIND.prompt);
        await expect(prompts.dialog.closeButton).toHaveAttribute("aria-label", UPLOAD_CLOSE_BY_KIND.prompt);

        await expect(prompts.dialog.badge("Dawn scene")).toHaveText(BADGE_VALID);
        await expect(prompts.dialog.badge("hero-brief")).toHaveText(BADGE_VALID);
        await prompts.dialog.rights.selectOption("free");
        await expect(prompts.dialog.submit).toHaveText(UPLOAD_SUBMIT_BY_KIND.prompt);
        await expect(prompts.dialog.submit).toContainText(/\b2\b/);
        await prompts.dialog.submit.click();

        await expect(ui.main.toast(UPLOAD_SUCCESS_BY_KIND.prompt).last()).toBeVisible();
        await expect(prompts.dialog.panel).toBeHidden();
        await expect(prompts.card("Dawn scene")).toBeVisible();
        await expect(prompts.card("hero-brief")).toBeVisible();
        const first = await readPrompt(folder, "Dawn scene");
        const second = await readPrompt(folder, "hero-brief");
        expect(first.text).toBe(txtBody);
        expect(second.text).toBe(mdBody);
        expect(first.row).toMatchObject({ rights: "free", origin: "upload" });
        expect(second.row).toMatchObject({ rights: "free", origin: "upload" });
        expect((await readLibrary(folder, (db) => db.counts())).prompt).toBe(3);
      });

      await test.step("marks a wrong type, empty, unreadable and oversized file invalid with a reason and creates no prompt", async () => {
        const before = await snapshotPrompts(folder);
        const prompts = await openImportDialog(ui, picker, [wrongType, empty, unreadable, oversized]);
        const files = ["notes.docx", "blank.txt", "binary.txt", "huge.md"];
        await expect(prompts.dialog.dropzone).toHaveAttribute("aria-label", DROPZONE_LABEL_BY_KIND.prompt);

        for (const file of files) {
          await expect(prompts.dialog.badge(file)).toHaveText(BADGE_INVALID);
          await expect(prompts.dialog.message(file)).toBeVisible();
        }
        await expect(prompts.dialog.message("notes.docx")).toHaveText(CHECK_UNSUPPORTED_BY_KIND.prompt);
        await expect(prompts.dialog.message("huge.md")).toHaveText(CHECK_TOO_LARGE_BY_KIND.prompt);
        await expect(prompts.dialog.message("blank.txt")).toHaveText(CHECK_EMPTY);
        await expect(prompts.dialog.message("binary.txt")).toHaveText(CHECK_UNREADABLE);
        await prompts.dialog.rights.selectOption("own");
        await expect(prompts.dialog.submit).toBeDisabled();
        expect(await snapshotPrompts(folder)).toEqual(before);
      });
    });
  });
});
