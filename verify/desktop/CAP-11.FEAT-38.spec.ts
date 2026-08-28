import { expect, test } from "../scripts/provider.ts";
import { ASSISTANT_PROVIDER, EDIT_DISABLED, EDIT_NOTICE, EDIT_WARNING, MODE_EDIT, MODE_READ_ONLY, behaviorOf, openAssistant, qaSeed, revealNovels, sendMessage, startChat } from "../scripts/assistant.ts";
import { readKnowledgeState } from "../scripts/knowledge.ts";
import { openChapters } from "../scripts/novels.ts";
import { SAMPLE_TITLE } from "../scripts/translation.ts";
import { readWorkspace } from "../scripts/workspaces.ts";

const RENAMED = "Azure Renamed";
const RENAMED_CHAPTER = "The Arrival Renamed";

test.describe("CAP-11 Assistant", () => {
  test.describe("FEAT-38 Assistant Editing Permission", () => {
    test.use({ providerOptions: ASSISTANT_PROVIDER });

    test("US-0106 keeps the assistant read-only by default", async ({ ui, picker, sandbox, provider }) => {
      const { folder, novelIds, seeded } = await openAssistant(ui, picker, sandbox, qaSeed());
      const novelId = novelIds[SAMPLE_TITLE] ?? 0;
      const entityId = Object.values(seeded.knowledge[0]?.entityIds ?? {})[0] ?? "";
      const titles = await readWorkspace(folder, (db) => db.chapters(SAMPLE_TITLE).map((chapter) => chapter.title));
      const before = await readKnowledgeState(folder, SAMPLE_TITLE);
      await provider.setBehavior(
        behaviorOf({
          ask: "sửa",
          tools: [
            { name: "edit_novel", arguments: { novelId, title: "Hacked Title", name: "Hacked Name" } },
            { name: "edit_novel_chapter", arguments: { novelId, chapter: 1, title: "Hacked Chapter" } },
            { name: "edit_novel_knowledge", arguments: { novelId, lang: "src", edits: [{ k: "del", id: entityId }] } },
          ],
          text: "Tôi chưa được bật quyền chỉnh sửa.",
        }),
      );
      await startChat(ui, SAMPLE_TITLE, "Xin chào");
      const { chat, composer } = ui.main.assistant;

      await test.step("shows the new chat in read-only mode on the session status bar", async () => {
        await expect(composer.edit).toHaveAttribute("aria-pressed", "false");
        await expect(composer.editLabel).toHaveText(MODE_READ_ONLY);
        await expect(chat.editNotice).toBeHidden();
      });

      await test.step("leaves the novel, chapter and knowledge unchanged when I tell the assistant to edit them", async () => {
        await sendMessage(ui, "Hãy sửa tên novel, tên chương 1 và xóa một thực thể tri thức");
        await expect(chat.replies).toHaveCount(2);
        const tools = (await provider.tools()).filter((tool) => tool.name.startsWith("edit_"));
        expect(tools.map((tool) => tool.name)).toEqual(["edit_novel", "edit_novel_chapter", "edit_novel_knowledge"]);
        for (const tool of tools) {
          expect(tool.isError).toBe(true);
          expect(tool.text).toMatch(EDIT_DISABLED);
        }
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual([SAMPLE_TITLE]);
        expect(await readWorkspace(folder, (db) => db.chapters(SAMPLE_TITLE).map((chapter) => chapter.title))).toEqual(titles);
        expect(await readKnowledgeState(folder, SAMPLE_TITLE)).toEqual(before);
      });
    });

    test("US-0107 lets me allow the assistant to edit per chat and turn it off again", async ({ ui, picker, sandbox, provider }) => {
      const { folder, novelIds } = await openAssistant(ui, picker, sandbox, qaSeed());
      const novelId = novelIds[SAMPLE_TITLE] ?? 0;
      await provider.setBehavior(
        behaviorOf({
          ask: "đổi tên",
          tools: [
            { name: "edit_novel", arguments: { novelId, title: RENAMED, name: RENAMED } },
            { name: "edit_novel_chapter", arguments: { novelId, chapter: 1, title: RENAMED_CHAPTER } },
          ],
          text: "Đã đổi tên novel thành {{0.title}}.",
        }),
      );
      await startChat(ui, SAMPLE_TITLE, "Xin chào");
      const { chat, composer } = ui.main.assistant;
      const { confirm } = ui.main;

      await test.step("warns that the assistant writes straight to the workspace and cannot be undone, with an allow-editing button", async () => {
        await composer.edit.click();
        await expect(confirm.panel).toBeVisible();
        await expect(confirm.warning).toHaveText(EDIT_WARNING);
        await expect(confirm.accept).toHaveText(/cho phép chỉnh sửa|allow editing/i);
      });

      await test.step("keeps the chat read-only when I cancel the warning", async () => {
        await confirm.cancel.click();
        await expect(confirm.panel).toBeHidden();
        await expect(composer.edit).toHaveAttribute("aria-pressed", "false");
        await expect(composer.editLabel).toHaveText(MODE_READ_ONLY);
      });

      await test.step("switches the chat to edit mode and shows that the assistant can change novels, chapters and knowledge when I confirm", async () => {
        await composer.edit.click();
        await confirm.accept.click();
        await expect(confirm.panel).toBeHidden();
        await expect(composer.edit).toHaveAttribute("aria-pressed", "true");
        await expect(composer.editLabel).toHaveText(MODE_EDIT);
        await expect(chat.editNotice).toHaveText(EDIT_NOTICE);
      });

      await test.step("changes the data and shows the new content on the related screens when the assistant edits on my command", async () => {
        await sendMessage(ui, "Hãy đổi tên novel và chương 1");
        await expect(chat.replies).toHaveCount(2);
        await expect(chat.replyTexts.last()).toHaveText(`Đã đổi tên novel thành ${RENAMED}.`);
        const edits = (await provider.tools()).filter((tool) => tool.name.startsWith("edit_"));
        expect(edits.every((tool) => !tool.isError)).toBe(true);
        expect(await readWorkspace(folder, (db) => db.novelTitles())).toEqual([RENAMED]);
        expect(await readWorkspace(folder, (db) => db.chapters(RENAMED).map((chapter) => chapter.title))).toEqual([RENAMED_CHAPTER, "The Trial", "The Duel"]);
        await revealNovels(ui);
        await expect(ui.main.explorer.novel(RENAMED)).toBeVisible();
        await expect(ui.main.explorer.novel(SAMPLE_TITLE)).toHaveCount(0);
        await openChapters(ui, RENAMED);
        await expect(ui.main.chapters.rowAt(1)).toContainText(RENAMED_CHAPTER);
      });

      await test.step("returns the chat to read-only when I turn editing off", async () => {
        await composer.edit.click();
        await expect(confirm.panel).toBeHidden();
        await expect(composer.edit).toHaveAttribute("aria-pressed", "false");
        await expect(composer.editLabel).toHaveText(MODE_READ_ONLY);
        await expect(chat.editNotice).toBeHidden();
      });
    });
  });
});
