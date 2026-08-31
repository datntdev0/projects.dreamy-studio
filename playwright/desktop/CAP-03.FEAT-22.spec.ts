import { expect, test } from "../scripts/fixtures.ts";
import { openTranslation, GUIDELINES_SAVED, guidelinesOf, reopenGuidelines, saveGuidelines, readGuidelines, GUIDE_UNCHANGED, sampleNovel, SAMPLE_TITLE } from "../scripts/translation.ts";

const VI_GUIDELINES = "Dịch giọng trung tính, xưng hô anh/chị.";
const EN_GUIDELINES = "Translate in a formal tone and keep honorifics.";
const EDITED_GUIDELINES = "Dịch giọng cổ trang, giữ nguyên tên môn phái.";

const SEED = {
  novels: [sampleNovel()],
  translations: [
    { novel: SAMPLE_TITLE, target: "VI" as const, guidelines: VI_GUIDELINES },
    { novel: SAMPLE_TITLE, target: "EN" as const, guidelines: EN_GUIDELINES },
  ],
};

test.describe("CAP-03 Content Translation", () => {
  test.describe("FEAT-22 Translation Guidelines", () => {
    test("US-0058 edits translation guidelines per target language and saves them", async ({ ui, app, picker, sandbox }) => {
      const { folder, novelId } = await openTranslation(ui, picker, sandbox, SEED, "guide", { target: "VI" });
      let guide = guidelinesOf(app.page);
      await expect(guide.prompt).toHaveValue(VI_GUIDELINES);

      await test.step("saves the edited guidelines, shows them again after reopening and announces they are saved", async () => {
        await saveGuidelines(guide, EDITED_GUIDELINES);

        await expect(ui.main.toast(GUIDELINES_SAVED)).toBeVisible();
        expect(await readGuidelines(folder, novelId, "VI")).toBe(EDITED_GUIDELINES);
        expect(await readGuidelines(folder, novelId, "EN")).toBe(EN_GUIDELINES);

        guide = await reopenGuidelines(ui, app, picker, folder, SAMPLE_TITLE, "VI");

        await expect(guide.prompt).toHaveValue(EDITED_GUIDELINES);
      });

      await test.step("reports no changes when the guidelines are saved unchanged", async () => {
        await saveGuidelines(guide);

        await expect(ui.main.toast(GUIDE_UNCHANGED)).toBeVisible();
        await expect(ui.main.toast(GUIDELINES_SAVED)).toBeHidden();
        expect(await readGuidelines(folder, novelId, "VI")).toBe(EDITED_GUIDELINES);
      });

      await test.step("shows the guidelines of the selected target language when the target changes", async () => {
        await ui.main.translation.target.selectOption("EN");
        await expect(guide.prompt).toHaveValue(EN_GUIDELINES);

        await ui.main.translation.target.selectOption("VI");
        await expect(guide.prompt).toHaveValue(EDITED_GUIDELINES);
      });
    });
  });
});
