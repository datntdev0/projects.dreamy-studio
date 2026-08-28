import { expect, test } from "../scripts/provider.ts";
import { goToTab, openKnowledge, BASELINE_SEED, MERGE_SEED, PREVIEW_SEED, TOWER_EVIDENCE, addEvidence, appliedCount, cancelEditing, confirmEditing, editingOf, expectPreview, leftCount, openAddFromList, openEditFromList, openIssueEdit, readState, setName, findEntity, BACKEND_NAME_NOT_FOUND, BACKEND_QUOTE_NOT_FOUND, EDIT_APPLIED, EDIT_APPLIED_LEFT, EDIT_EVIDENCE_INVALID, EDIT_EVIDENCE_REQUIRED, EDIT_MERGE_TYPE, EDIT_NAME_REQUIRED, EDIT_PREVIEW_CLEAN, EDIT_PREVIEW_INVALID, EDIT_PREVIEW_OPEN, EDIT_PREVIEW_RESOLVED, EDIT_PREVIEW_WARN, EDIT_STATE_MERGED, EDIT_TYPE_REFUSED, REMOVE_TITLE, REMOVE_WARNING, addChange, editChange, mergeChange, removeMessage } from "../scripts/knowledge.ts";

test.describe("CAP-04 Content Intelligence", () => {
  test.describe("FEAT-29 Knowledge Editing", () => {
    test("US-0080 edits an entity", async ({ ui, picker, sandbox }) => {
      const { folder } = await openKnowledge(ui, picker, sandbox, BASELINE_SEED, "list");
      const editing = editingOf(ui);

      await test.step("applies a valid rename, shows it in the list and reports how many changes were applied", async () => {
        await openEditFromList(ui, "Sky Sword Sect");
        await setName(ui, 0, "Sword Sect");
        await confirmEditing(ui);

        await expect(ui.main.toast(appliedCount(1))).toBeVisible();
        await expect(ui.main.toast(EDIT_APPLIED)).toBeVisible();
        await expect(editing.listRow("Sword Sect")).toHaveCount(1);
        await expect(editing.listRow("Sky Sword Sect")).toHaveCount(0);
        const state = await readState(folder);
        expect(findEntity(state, "Sword Sect", "organization")).toBeDefined();
        expect(findEntity(state, "Sky Sword Sect")).toBeUndefined();
      });

      await test.step("saves the new titles and aliases of a persona", async () => {
        await openEditFromList(ui, "Su Yan", "persona");
        const card = editing.entityCardAt(0);
        await card.list("titles").input.fill("healer");
        await card.list("titles").add.click();
        await card.list("aliases").input.fill("Yan");
        await card.list("aliases").add.click();
        await editing.changesToggle.click();
        await expect(editing.changes).toHaveCount(1);
        await expect(editing.changes.first()).toHaveText(editChange("Su Yan", ["titles", "aliases"]));
        await confirmEditing(ui);

        await expect(ui.main.toast(appliedCount(1)).last()).toBeVisible();
        const persona = findEntity(await readState(folder), "Su Yan", "persona");
        expect(persona?.titles).toEqual(["healer"]);
        expect([...(persona?.aliases ?? [])].sort()).toEqual(["White Lotus", "Yan"]);
      });

      await test.step("refuses a type change of a persona and keeps the old type", async () => {
        const before = await readState(folder);
        await openEditFromList(ui, "Su Yan", "persona");
        await editing.entityCardAt(0).type.selectOption("location");

        await expect(editing.entityCardAt(0).typeError).toHaveText(EDIT_TYPE_REFUSED);
        await expectPreview(ui, "invalid");
        await expect(editing.confirm).toBeDisabled();
        await expect(ui.main.toast(EDIT_TYPE_REFUSED)).toHaveCount(0);
        await editing.changesToggle.click();
        await expect(editing.changes.first()).toHaveText(editChange("Su Yan", ["type"]));
        await cancelEditing(ui);
        const after = await readState(folder);
        expect(findEntity(after, "Su Yan", "persona")).toBeDefined();
        expect(findEntity(after, "Su Yan", "location")).toBeUndefined();
        expect(after.entities).toEqual(before.entities);
      });
    });

    test("US-0081 adds an entity with a quote", async ({ ui, picker, sandbox }) => {
      const { folder } = await openKnowledge(ui, picker, sandbox, BASELINE_SEED, "list");
      const editing = editingOf(ui);
      const initial = await readState(folder);

      await test.step("shows the new entity in the list with the quote that was entered", async () => {
        await openAddFromList(ui);
        await setName(ui, 0, "Tower");
        await editing.entityCardAt(0).type.selectOption("location");
        await addEvidence(ui, 0, TOWER_EVIDENCE);
        await editing.changesToggle.click();
        await expect(editing.changes).toHaveCount(1);
        await expect(editing.changes.first()).toHaveText(addChange("Tower"));
        await confirmEditing(ui);

        await expect(ui.main.toast(EDIT_APPLIED)).toBeVisible();
        await expect(editing.listRow("Tower", "location")).toHaveCount(1);
        await editing.listRow("Tower", "location").click();
        await expect(editing.detailEvidence).toContainText(TOWER_EVIDENCE.quote);
        const tower = findEntity(await readState(folder), "Tower", "location");
        expect(tower?.evidence).toEqual([{ chapter: 1, p: 2, q: TOWER_EVIDENCE.quote }]);
      });

      await test.step("refuses an empty name or a missing quote and adds nothing", async () => {
        const before = await readState(folder);
        await openAddFromList(ui);
        const card = editing.entityCardAt(0);

        await expect(card.nameError).toHaveText(EDIT_NAME_REQUIRED);
        await expect(card.evidenceRequired).toHaveText(EDIT_EVIDENCE_REQUIRED);
        await expectPreview(ui, "invalid");
        await expect(editing.confirm).toBeDisabled();
        await setName(ui, 0, "Gate");
        await expect(card.nameError).toHaveCount(0);
        await expect(card.evidenceRequired).toBeVisible();
        await expect(editing.confirm).toBeDisabled();
        await cancelEditing(ui);
        expect((await readState(folder)).entities).toEqual(before.entities);
      });

      await test.step("warns that the chapter, the paragraph and the quote are all needed", async () => {
        await openAddFromList(ui);
        const card = editing.entityCardAt(0);

        await card.evidenceAdd.click();
        await expect(ui.main.toast(EDIT_EVIDENCE_INVALID)).toBeVisible();
        await card.evidenceQuote.fill("the tower");
        await card.evidenceAdd.click();
        await expect(ui.main.toast(EDIT_EVIDENCE_INVALID)).toHaveCount(2);
        await expect(card.evidenceItems).toHaveCount(0);
        await expect(card.evidenceRequired).toBeVisible();
        await cancelEditing(ui);
      });

      await test.step("rejects a name or a quote that is not in the chapter text and adds nothing", async () => {
        const before = await readState(folder);
        await openAddFromList(ui);
        const card = editing.entityCardAt(0);

        await setName(ui, 0, "Dragon");
        await addEvidence(ui, 0, TOWER_EVIDENCE);
        await editing.confirm.click();
        await expect(ui.main.toast(BACKEND_NAME_NOT_FOUND)).toBeVisible();
        await expect(editing.panel).toBeVisible();
        expect((await readState(folder)).entities).toEqual(before.entities);

        await setName(ui, 0, "Gate");
        await card.evidenceItems.first().getByTestId("novel-knowledge-edit-evidence-remove").click();
        await expect(card.evidenceItems).toHaveCount(0);
        await addEvidence(ui, 0, { ...TOWER_EVIDENCE, quote: "A dragon descended on the tower." });
        await editing.confirm.click();
        await expect(ui.main.toast(BACKEND_QUOTE_NOT_FOUND)).toBeVisible();
        await expect(editing.panel).toBeVisible();
        await cancelEditing(ui);
        const after = await readState(folder);
        expect(after.entities).toEqual(before.entities);
        expect(after.entities.length).toBe(initial.entities.length + 1);
      });
    });

    test("US-0082 deletes an entity after a warning", async ({ ui, picker, sandbox }) => {
      const { folder } = await openKnowledge(ui, picker, sandbox, BASELINE_SEED, "list");
      const editing = editingOf(ui);
      const initial = await readState(folder);
      const blade = findEntity(initial, "Frost Blade");

      await test.step("names the entity and warns that facts pointing to it are deleted too and it cannot be undone", async () => {
        await editing.listRow("Frost Blade").click();
        await editing.detailDelete.click();

        await expect(ui.main.confirm.panel).toContainText(REMOVE_TITLE);
        await expect(editing.removeMessage).toHaveText(removeMessage("Frost Blade"));
        await expect(ui.main.confirm.warning).toHaveText(REMOVE_WARNING);
      });

      await test.step("removes the entity and the facts that point to it", async () => {
        const dependent = initial.facts.filter((fact) => fact.subject === blade?.id || fact.object === blade?.id);
        expect(dependent.length).toBeGreaterThan(0);

        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(editing.listRow("Frost Blade")).toHaveCount(0);
        const after = await readState(folder);
        expect(findEntity(after, "Frost Blade")).toBeUndefined();
        expect(after.facts.filter((fact) => fact.subject === blade?.id || fact.object === blade?.id)).toHaveLength(0);
        expect(after.facts).toHaveLength(initial.facts.length - dependent.length);
        expect(after.entities).toHaveLength(initial.entities.length - 1);
      });

      await test.step("keeps the knowledge unchanged when the confirmation is cancelled", async () => {
        const before = await readState(folder);
        await editing.listRow("Azure City").click();
        await editing.detailDelete.click();
        await expect(ui.main.confirm.panel).toBeVisible();

        await ui.main.confirm.cancel.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(editing.listRow("Azure City")).toHaveCount(1);
        const after = await readState(folder);
        expect(after.entities).toEqual(before.entities);
        expect(after.facts).toEqual(before.facts);
      });
    });

    test("US-0083 merges duplicate entities", async ({ ui, picker, sandbox }) => {
      const { folder } = await openKnowledge(ui, picker, sandbox, MERGE_SEED, "review");
      const editing = editingOf(ui);
      const initial = await readState(folder);

      await test.step("refuses to merge entities of different types and changes nothing", async () => {
        await openIssueEdit(ui, "character_predicate");
        const types = await editing.entityCards.getByTestId("novel-knowledge-edit-select").count();
        expect(types).toBeGreaterThanOrEqual(2);
        await editing.entityCardAt(0).select.check();

        await expect(editing.entityCardAt(1).select).toBeDisabled();
        await expect(editing.entityCardAt(1).select).toHaveAttribute("data-tip", EDIT_MERGE_TYPE);
        await expect(editing.merge).toBeDisabled();
        await cancelEditing(ui);
        const after = await readState(folder);
        expect(after.entities).toEqual(initial.entities);
        expect(after.facts).toEqual(initial.facts);
      });

      await test.step("keeps the evidence of both entities and re-points the old facts to the kept one", async () => {
        const feng = findEntity(initial, "Feng", "persona");
        const linFeng = findEntity(initial, "Lin Feng", "persona");
        await openIssueEdit(ui, "entity_duplicate");
        await editing.entityCard("Feng").select.first().check();
        await editing.entityCard("Lin Feng").select.first().check();
        await expect(editing.merge).toBeEnabled();
        await editing.merge.click();
        await editing.mergeTarget.selectOption({ label: "Lin Feng" });
        await editing.mergeApply.click();

        await expectPreview(ui, "resolved");
        await editing.changesToggle.click();
        await expect(editing.changes).toHaveCount(1);
        await expect(editing.changes.first()).toHaveText(mergeChange(["Feng"], "Lin Feng"));
        await expect(editing.entityCard("Feng").root.first().locator(".badge").last()).toHaveText(EDIT_STATE_MERGED);
        await confirmEditing(ui);

        await expect(ui.main.toast(EDIT_APPLIED_LEFT)).toBeVisible();
        await expect(ui.main.toast(leftCount(1))).toBeVisible();
        const state = await readState(folder);
        expect(findEntity(state, "Feng", "persona")).toBeUndefined();
        const kept = findEntity(state, "Lin Feng", "persona");
        expect(kept?.chapters).toEqual([1, 2]);
        expect(kept?.evidence).toEqual(expect.arrayContaining([...(feng?.evidence ?? []), ...(linFeng?.evidence ?? [])]));
        expect(state.facts.some((fact) => fact.subject === feng?.id || fact.object === feng?.id)).toBe(false);
        const link = state.facts.find((fact) => fact.pred === "persona_of" && fact.subject === kept?.id);
        expect(link?.chapters).toEqual([1, 2]);
      });
    });

    test("US-0084 previews the edit before applying it", async ({ ui, picker, sandbox }) => {
      const { folder } = await openKnowledge(ui, picker, sandbox, PREVIEW_SEED, "list");
      const editing = editingOf(ui);

      await test.step("shows the list of changes and the preview state: invalid, no conflicts or conflicts remaining", async () => {
        await openEditFromList(ui, "Azure City");
        await expectPreview(ui, "idle");
        await editing.entityCardAt(0).name.fill("");
        await expect(editing.preview).toContainText(EDIT_PREVIEW_INVALID);
        await expectPreview(ui, "invalid");
        await setName(ui, 0, "Azure");
        await expect(editing.preview).toContainText(EDIT_PREVIEW_CLEAN);
        await expectPreview(ui, "clean");
        await editing.changesToggle.click();
        await expect(editing.changes).toHaveCount(1);
        await expect(editing.changes.first()).toHaveText(editChange("Azure", ["name"]));
        await cancelEditing(ui);

        await openEditFromList(ui, "Sky Sword Sect");
        await editing.entityCardAt(0).type.selectOption("location");
        await expect(editing.preview).toContainText(EDIT_PREVIEW_WARN);
        await expectPreview(ui, "warn");
        await editing.changesToggle.click();
        await expect(editing.changes).toHaveCount(1);
        await expect(editing.changes.first()).toHaveText(editChange("Sky Sword Sect", ["type"]));
        await cancelEditing(ui);

        await goToTab(ui, "review");
        await openIssueEdit(ui, "entity_duplicate");
        const kept = editing.entityCard("Lin Feng");
        await kept.list("aliases").input.fill("Feng");
        await kept.list("aliases").add.click();
        await expect(editing.preview).toContainText(EDIT_PREVIEW_OPEN);
        await expectPreview(ui, "open");
        await editing.entityCard("Feng").remove.click();
        await expect(editing.preview).toContainText(EDIT_PREVIEW_RESOLVED);
        await expectPreview(ui, "resolved");
        await cancelEditing(ui);
      });

      await test.step("applies a valid change that leaves conflicts and warns how many conflicts remain", async () => {
        await goToTab(ui, "list");
        await openEditFromList(ui, "Sky Sword Sect");
        await editing.entityCardAt(0).type.selectOption("location");
        await expectPreview(ui, "warn");

        await confirmEditing(ui);

        await expect(ui.main.toast(EDIT_APPLIED_LEFT)).toBeVisible();
        await expect(ui.main.toast(leftCount(2))).toBeVisible();
        expect(findEntity(await readState(folder), "Sky Sword Sect", "location")).toBeDefined();
      });

      await test.step("leaves the knowledge unchanged when the edit dialog is cancelled", async () => {
        const before = await readState(folder);
        await openEditFromList(ui, "Azure City");
        await setName(ui, 0, "Azure");
        await expectPreview(ui, "clean");

        await cancelEditing(ui);

        await expect(editing.listRow("Azure City")).toHaveCount(1);
        const after = await readState(folder);
        expect(after.entities).toEqual(before.entities);
        expect(after.facts).toEqual(before.facts);
      });
    });
  });
});
