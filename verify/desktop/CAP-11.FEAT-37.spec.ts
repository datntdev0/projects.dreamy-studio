import { expect, test } from "../scripts/provider.ts";
import { ASSISTANT_PROVIDER, AZURE, HISTORY_LOAD_FAILED, SEND_FAILED, THINKING, WORKING, activitiesText, behaviorOf, chooseScope, openAssistant, qaSeed, restoreHistory, scopeSeed, sendMessage, showAssistant } from "../scripts/assistant.ts";
import { readKnowledgeState } from "../scripts/knowledge.ts";
import { PROVIDER_NOT_SET, SAMPLE_TITLE, taggedCopy } from "../scripts/translation.ts";
import { readParagraphs, readWorkspace } from "../scripts/workspaces.ts";

const DELAY_MS = 2500;

test.describe("CAP-11 Assistant", () => {
  test.describe("FEAT-37 Assistant Q&A", () => {
    test.use({ providerOptions: ASSISTANT_PROVIDER });

    test("US-0104 asks the assistant about the workspace content", async ({ ui, picker, sandbox, provider }) => {
      const { folder, novelIds } = await openAssistant(ui, picker, sandbox, qaSeed());
      const novelId = novelIds[SAMPLE_TITLE] ?? 0;
      const state = await readKnowledgeState(folder, SAMPLE_TITLE);
      const chapter = await readWorkspace(folder, (db) => db.chapters(SAMPLE_TITLE)[0]);
      const source = await readParagraphs(folder, novelId, chapter?.id ?? "");
      await provider.setBehavior(
        behaviorOf(
          { ask: "xin chào", delayMs: DELAY_MS, text: "Xin chào! Tôi có thể giúp gì cho bạn?" },
          {
            ask: "tổng quan",
            delayMs: DELAY_MS,
            tools: [{ name: "list_novel" }, { name: "read_novel", arguments: { novelId } }],
            text: "Trong phạm vi này có {{0.length}} novel: {{1.title}} gồm {{1.chapterCount}} chương.",
          },
          {
            ask: "chi tiết",
            tools: [
              { name: "read_novel_chapter", arguments: { novelId, chapter: 1 } },
              { name: "read_translation", arguments: { novelId, target: "VI", chapter: 1 } },
              { name: "read_translation_guide", arguments: { novelId, target: "VI" } },
              { name: "read_novel_knowledge", arguments: { novelId, lang: "src" } },
            ],
            text: "Chương 1 là {{0.title}}. Đoạn đầu: {{0.paragraphs.0.text}} Bản dịch: {{1.paragraphs.0.translation}} Từ điển: {{2.dictionary.0.src}} = {{2.dictionary.0.dst}}. Tri thức có {{3.total}} thực thể.",
          },
        ),
      );
      await showAssistant(ui);
      await chooseScope(ui, SAMPLE_TITLE);
      const { chat, composer } = ui.main.assistant;

      await test.step("shows my message at once with an indicator that the assistant is replying when I send with Enter", async () => {
        await composer.field.fill("Xin chào");
        await composer.field.press("Enter");
        await expect(chat.pending).toHaveText("Xin chào");
        await expect(chat.typing).toBeVisible();
        await expect(chat.typingLabel).toHaveText(THINKING);
        await expect(chat.replies).toHaveCount(1);
        await expect(chat.replyTexts).toHaveText("Xin chào! Tôi có thể giúp gì cho bạn?");
        await expect(chat.typing).toBeHidden();
        await expect(chat.userTexts).toHaveText("Xin chào");
      });

      await test.step("shows that it is searching the workspace while it reads and counts the tool calls it ran in the answer", async () => {
        await sendMessage(ui, "Cho tôi tổng quan về phạm vi này");
        await expect(chat.liveLabel).toContainText(WORKING);
        await expect(chat.liveCount).toContainText("2");
        await expect(chat.replies).toHaveCount(2);
        await expect(chat.replyTexts.last()).toHaveText(`Trong phạm vi này có 1 novel: ${SAMPLE_TITLE} gồm 3 chương.`);
        await expect(chat.activitySummary).toHaveText(activitiesText(2));
        await expect(chat.activities).toHaveText([/list_novel/, /read_novel\(/]);
      });

      await test.step("breaks the line without sending when I press Shift+Enter", async () => {
        const runs = (await provider.runs("assistant")).length;
        await composer.field.fill("Dòng một");
        await composer.field.press("Shift+Enter");
        await composer.field.pressSequentially("Dòng hai");
        await expect(composer.field).toHaveValue("Dòng một\nDòng hai");
        await expect(chat.pending).toHaveCount(0);
        await expect(chat.userMessages).toHaveCount(2);
        expect((await provider.runs("assistant")).length).toBe(runs);
        await composer.field.fill("");
      });

      await test.step("answers from the chapters, translation, dictionary and knowledge of the novel in scope", async () => {
        await sendMessage(ui, "Cho tôi xem chi tiết chương 1, bản dịch, từ điển và tri thức");
        await expect(chat.replies).toHaveCount(3);
        const answer = chat.replyTexts.last();
        await expect(answer).toContainText("Chương 1 là The Arrival.");
        await expect(answer).toContainText(source[0] ?? "");
        await expect(answer).toContainText(taggedCopy("VI", source[0] ?? ""));
        await expect(answer).toContainText("Lin Feng = Lâm Phong");
        await expect(answer).toContainText(`Tri thức có ${state.entities.length} thực thể.`);
        const tools = await provider.tools();
        expect(tools.slice(-4).map((tool) => tool.name)).toEqual(["read_novel_chapter", "read_translation", "read_translation_guide", "read_novel_knowledge"]);
        expect(tools.every((tool) => !tool.isError)).toBe(true);
      });
    });

    test("US-0105 explains when the assistant cannot answer so I can handle or retry", async ({ ui, app, picker, sandbox, provider }) => {
      await provider.clearSelection(["assistant"]);
      await app.restart();
      await expect(ui.splash.root).toBeVisible();
      const { folder } = await openAssistant(ui, picker, sandbox, scopeSeed(), { historyBroken: true });
      await showAssistant(ui);
      const { start, history, chat, composer } = ui.main.assistant;

      await test.step("reports why the history could not be loaded and loads it again with the retry button", async () => {
        await start.history.click();
        await expect(history.error).toBeVisible();
        await expect(history.error).toContainText(HISTORY_LOAD_FAILED);
        await expect(history.error).toContainText("ws_assistant_sessions");
        restoreHistory(folder);
        await history.retry.click();
        await expect(history.error).toBeHidden();
        await expect(history.empty).toBeVisible();
      });

      await test.step("reports that the message cannot be sent with the reason when no provider is selected and lets me close the notice", async () => {
        await history.back.click();
        await chooseScope(ui, AZURE);
        await composer.field.fill("Xin chào");
        await composer.field.press("Enter");
        await expect(chat.error).toBeVisible();
        await expect(chat.error).toContainText(SEND_FAILED);
        await expect(chat.error).toContainText(PROVIDER_NOT_SET);
        await chat.errorDismiss.click();
        await expect(chat.error).toBeHidden();
        expect(await provider.runs()).toHaveLength(0);
      });
    });
  });
});
