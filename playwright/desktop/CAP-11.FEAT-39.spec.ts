import { expect, test } from "../scripts/provider.ts";
import { ASK_TRANSLATION, ASSISTANT_PROVIDER, CATEGORY_DICT, CATEGORY_NAME, CATEGORY_OMISSION, CATEGORY_STYLE, LATE_FINDING, PROPOSAL_STALE, REVIEW_DICTIONARY, REVIEW_FINDINGS, REVIEW_FINISHED, SEVERITY_ERROR, SEVERITY_INFO, SEVERITY_WARNING, STATUS_APPLIED, STATUS_REJECTED, appliedToast, behaviorOf, progressText, reviewMeta, reviewReply } from "../scripts/assistant.ts";
import { FIRST_CHAPTER, REVIEW_SEED, editTranslatedParagraph, goToStep, openTranslation, readDictionary, review as resultPage, storedParagraphs } from "../scripts/translation.ts";
import { TranslationDictionaryPage } from "../pages/translation.ts";

test.describe("CAP-11 Assistant", () => {
  test.describe("FEAT-39 Assistant Translation Review", () => {
    test.use({ providerOptions: ASSISTANT_PROVIDER });

    test("US-0108 asks the assistant to review a translated chapter", async ({ ui, picker, sandbox, provider }) => {
      const opened = await openTranslation(ui, picker, sandbox, REVIEW_SEED, "result", { target: "VI" });
      await provider.setBehavior(behaviorOf(reviewReply(opened.novelId, REVIEW_FINDINGS, REVIEW_DICTIONARY)));
      const { chat, review, askTranslationReview } = ui.main.assistant;

      await test.step("opens a chat asking to review the proper names, dictionary, meaning and omissions of the chapter", async () => {
        await askTranslationReview.click();
        await expect(chat.root).toBeVisible();
        await expect(chat.userTexts).toHaveText(ASK_TRANSLATION);
        await expect(chat.scopeChip).toHaveText("Azure Chronicle");
        const [run] = await provider.waitForRuns(1, "assistant");
        expect(run?.prompt).toContain("## Skill: review_translation");
        expect(run?.prompt).toContain('chapter 1 "The Arrival"');
      });

      await test.step("shows the checked passages, issue count, target language and the issues by severity and category", async () => {
        await expect(review.root).toBeVisible();
        await expect(review.title).toContainText(reviewMeta(4, 4, "VI"));
        await expect(review.errors).toHaveText(/^(1 lỗi|Errors: 1)$/i);
        await expect(review.warnings).toHaveText(/^(2 cảnh báo|Warnings: 2)$/i);
        await expect(review.infos).toHaveText(/^(1 gợi ý|Suggestions: 1)$/i);
        await expect(review.findings).toHaveCount(4);
        const expected = [
          ["f1", SEVERITY_ERROR, CATEGORY_NAME],
          ["f2", SEVERITY_WARNING, CATEGORY_DICT],
          ["f3", SEVERITY_INFO, CATEGORY_STYLE],
          ["f4", SEVERITY_WARNING, CATEGORY_OMISSION],
        ] as const;
        for (const [id, severity, category] of expected) {
          await expect(review.severity(review.finding(id))).toHaveText(severity);
          await expect(review.category(review.finding(id))).toHaveText(category);
        }
        await expect(chat.replyTexts).toHaveText("Đã rà soát: 4 vấn đề và 2 mục từ.");
      });

      await test.step("shows the current translation next to the suggested fix of an issue", async () => {
        const first = review.finding("f1");
        await expect(review.ref(first)).toHaveText("¶1");
        await expect(review.current(first)).toContainText(FIRST_CHAPTER[0]);
        await expect(review.suggested(first)).toContainText(FIRST_CHAPTER[0].replace("Lam Phong", "Lâm Phong"));
        await expect(review.suggested(first)).not.toContainText(FIRST_CHAPTER[0]);
      });
    });

    test("US-0109 reviews each proposal of the assistant and applies only what I agree with", async ({ ui, app, picker, sandbox, provider }) => {
      const opened = await openTranslation(ui, picker, sandbox, REVIEW_SEED, "result", { target: "VI" });
      await provider.setBehavior(behaviorOf(reviewReply(opened.novelId, REVIEW_FINDINGS, REVIEW_DICTIONARY)));
      const { chat, review, askTranslationReview } = ui.main.assistant;
      await askTranslationReview.click();
      await expect(review.root).toBeVisible();
      await expect(review.progress).toHaveText(progressText(0, 6));
      const result = resultPage(app);

      await test.step("fixes the passage, marks the proposal applied and updates the progress when I apply it", async () => {
        await review.apply(review.finding("f1")).click();
        await expect(review.status(review.finding("f1"))).toHaveText(STATUS_APPLIED);
        await expect(review.progress).toHaveText(progressText(1, 6));
        await expect.poll(async () => (await storedParagraphs(opened, 1))[0]?.text).toBe("Lâm Phong den cong Thanh Lam luc binh minh.");
        await expect(result.text(1)).toHaveText("Lâm Phong den cong Thanh Lam luc binh minh.");
      });

      await test.step("adds the suggested term to the translation dictionary of the novel", async () => {
        await review.entryApply(review.entry("d1")).click();
        await expect(review.entryStatus(review.entry("d1"))).toHaveText(STATUS_APPLIED);
        await expect(review.progress).toHaveText(progressText(2, 6));
        await expect.poll(async () => (await readDictionary(opened.folder, opened.novel, "VI")).map((entry) => `${entry.src}|${entry.dst}|${entry.type}`)).toContain("Sky Sword Sect|Thien Kiem Mon|org");
        await goToStep(ui, "dict");
        await expect(new TranslationDictionaryPage(app.page).row("Sky Sword Sect")).toBeVisible();
        await goToStep(ui, "result");
      });

      await test.step("marks a dismissed proposal and keeps the translation unchanged", async () => {
        await review.reject(review.finding("f2")).click();
        await expect(review.status(review.finding("f2"))).toHaveText(STATUS_REJECTED);
        await expect(review.progress).toHaveText(progressText(3, 6));
        expect((await storedParagraphs(opened, 1))[1]?.text).toBe(FIRST_CHAPTER[1]);
      });

      await test.step("handles every remaining proposal, announces how many and shows all are handled when I apply them all", async () => {
        await expect(review.applyAll).toContainText("3");
        await review.applyAll.click();
        await expect(ui.main.toast(appliedToast(3))).toBeVisible();
        await expect(review.finished).toHaveText(REVIEW_FINISHED);
        await expect(review.progress).toHaveText(progressText(6, 6));
        await expect(review.applyAll).toHaveCount(0);
        const paragraphs = await storedParagraphs(opened, 1);
        expect(paragraphs[2]?.text).toBe("Mot thanh kiem bang la di vật cua cha cau.");
        expect(paragraphs[3]?.text).toBe("Cau hai muoi tuoi va lam nghe ren tu nho.");
        expect((await readDictionary(opened.folder, opened.novel, "VI")).map((entry) => entry.src)).toContain("Frost Blade");
      });

      await test.step("reports that the proposal no longer applies and keeps the translation when the passage was edited after the proposal", async () => {
        await provider.setBehavior(behaviorOf(reviewReply(opened.novelId, [LATE_FINDING], [])));
        await goToStep(ui, "result");
        await askTranslationReview.click();
        await expect(review.findings).toHaveCount(1);
        await expect(chat.replyTexts).toHaveText("Đã rà soát: 1 vấn đề và 0 mục từ.");
        await editTranslatedParagraph(ui, 1, 1, "Lâm Phong đã đến cổng thành.");
        await review.apply(review.finding("f1")).click();
        await expect(ui.main.toast(PROPOSAL_STALE)).toBeVisible();
        await expect(review.apply(review.finding("f1"))).toBeVisible();
        await expect(review.status(review.finding("f1"))).toHaveCount(0);
        expect((await storedParagraphs(opened, 1))[0]?.text).toBe("Lâm Phong đã đến cổng thành.");
      });
    });
  });
});
