import { expect, test } from "../scripts/fixtures.ts";
import { goToStep, openTranslation, selectTarget, showTranslation, EMPTY_NOVEL, EMPTY_TITLE, EN_NOVEL, STEP_LABELS, SUMMARY_DICT_ONE, SUMMARY_DICT_TWO, SUMMARY_GUIDE_EMPTY, SUMMARY_GUIDE_WRITTEN, SUMMARY_REVIEWED, SUMMARY_TRANS, SUMMARY_WARN_NONE, TARGET_LABELS, VI_NOVEL, ZH_NOVEL, workspacePage, workspaceSeed } from "../scripts/translation.ts";
import { TRANSLATION_STEPS } from "../pages/translation.ts";

test.describe("CAP-03 Content Translation", () => {
  test.describe("FEAT-20 Translation Workspace", () => {
    test("US-0053 opens the translation workspace and chooses a target language", async ({ ui, picker, sandbox }) => {
      await openTranslation(ui, picker, sandbox, workspaceSeed(), undefined, { target: "VI" });
      const translation = ui.main.translation;
      const extra = workspacePage(ui);

      await test.step("shows the five-step flow Dictionary, Guidelines, Translate, Result, Warnings, each with a progress summary", async () => {
        await expect(translation.flow).toBeVisible();
        await expect(translation.steps).toHaveCount(5);
        for (const step of TRANSLATION_STEPS) {
          await expect(translation.step(step).locator("b")).toHaveText(STEP_LABELS[step]);
        }
        await expect(translation.stepSummary("dict")).toHaveText(SUMMARY_DICT_TWO);
        await expect(translation.stepSummary("guide")).toHaveText(SUMMARY_GUIDE_WRITTEN);
        await expect(translation.stepSummary("trans")).toHaveText(SUMMARY_TRANS);
        await expect(translation.stepSummary("result")).toHaveText(SUMMARY_REVIEWED);
        await expect(translation.stepSummary("warn")).toHaveText(SUMMARY_WARN_NONE);
        await expect(translation.empty).toHaveCount(0);
      });

      await test.step("offers only Vietnamese and English as targets and never the novel's own language", async () => {
        await expect(translation.targetOptions).toHaveText([TARGET_LABELS.VI, TARGET_LABELS.EN]);

        await showTranslation(ui, VI_NOVEL);
        await expect(translation.title).toContainText(VI_NOVEL);
        await expect(translation.targetOptions).toHaveText([TARGET_LABELS.EN]);

        await showTranslation(ui, EN_NOVEL);
        await expect(translation.title).toContainText(EN_NOVEL);
        await expect(translation.targetOptions).toHaveText([TARGET_LABELS.VI]);
      });

      await test.step("shows the summaries of the new target when the target changes", async () => {
        await showTranslation(ui, ZH_NOVEL);
        await expect(translation.title).toContainText(ZH_NOVEL);
        await goToStep(ui, "trans");

        await selectTarget(ui, "EN");

        await expect(extra.rows).toHaveCount(3);
        await expect(translation.stepSummary("dict")).toHaveText(SUMMARY_DICT_ONE);
        await expect(translation.stepSummary("guide")).toHaveText(SUMMARY_GUIDE_EMPTY);
      });
    });

    test("US-0054 shows an empty state instead of the flow for a novel without chapters", async ({ ui, picker, sandbox }) => {
      await openTranslation(ui, picker, sandbox, workspaceSeed(), undefined, { novel: EMPTY_NOVEL });
      const translation = ui.main.translation;

      await test.step("shows the empty state and no translation flow", async () => {
        await expect(translation.empty).toBeVisible();
        await expect(translation.emptyTitle).toHaveText(EMPTY_TITLE);
        await expect(translation.flow).toHaveCount(0);
        await expect(translation.steps).toHaveCount(0);
        await expect(translation.foot).toHaveCount(0);
      });
    });
  });
});
