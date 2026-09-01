// prettier-ignore
import { appliedToast, askKnowledge, ASSISTANT_PROVIDER, behaviorOf, changesMeta, conflictSeed, invalidText, knowledgeReply, OP_LABELS, STATUS_APPLIED, STATUS_REJECTED, unsafeChanges, validChanges, validText } from '../scripts/assistant.ts';
// prettier-ignore
import { expectIssueRules, findEntity, openKnowledge, readKnowledgeState, reviewPage } from '../scripts/knowledge.ts';
import { expect, test } from '../scripts/provider.ts';
import { SAMPLE_TITLE } from '../scripts/translation.ts';

test.describe('CAP-11 Assistant', () => {
  test.describe('FEAT-40 Assistant Knowledge Fixes', () => {
    test.use({ providerOptions: ASSISTANT_PROVIDER });

    test('US-0110 asks the assistant to propose fixes for the knowledge conflicts', async ({
      ui,
      picker,
      sandbox,
      provider,
    }) => {
      const opened = await openKnowledge(ui, picker, sandbox, conflictSeed(), 'review');
      const changes = validChanges(opened);
      await provider.setBehavior(
        behaviorOf(knowledgeReply(opened.novelId, 'Sửa xung đột tri thức', changes)),
      );
      const { chat, changes: card, askKnowledgeFixes } = ui.main.assistant;
      const conflicts = await reviewPage(ui).issues.count();
      expect(conflicts).toBeGreaterThan(0);

      await test.step('opens a chat asking for fixes for exactly the number of conflicts the knowledge has', async () => {
        await askKnowledgeFixes.click();
        await expect(chat.root).toBeVisible();
        await expect(chat.userTexts).toHaveText(askKnowledge(conflicts));
        await expect(chat.scopeChip).toHaveText(SAMPLE_TITLE);
        const [run] = await provider.waitForRuns(1, 'assistant');
        expect(run?.prompt).toContain('## Skill: review_knowledgebase');
        expect(run?.prompt).toContain(`selected ${conflicts} issue(s)`);
      });

      await test.step('shows the number of changes and lists every operation with its value before and after', async () => {
        await expect(card.root).toBeVisible();
        await expect(card.title).toContainText('Sửa xung đột tri thức');
        await expect(card.title).toContainText(changesMeta(changes.length, changes.length));
        await expect(card.changes).toHaveCount(changes.length);
        for (const change of changes) {
          const row = card.change(change.op);
          await expect(row).toHaveCount(1);
          await expect(card.opLabel(row)).toHaveText(OP_LABELS[change.op] ?? '');
          await expect(card.target(row)).toHaveText(change.target);
          if (change.before === null) {
            await expect(card.before(row)).toHaveCount(0);
          } else {
            await expect(card.before(row)).toContainText(change.before);
          }
          if (change.after === null) {
            await expect(card.after(row)).toHaveCount(0);
          } else {
            await expect(card.after(row)).toContainText(change.after);
          }
        }
      });
    });

    test('US-0111 checks that a proposal is safe before I apply or dismiss it', async ({
      ui,
      picker,
      sandbox,
      provider,
    }) => {
      const opened = await openKnowledge(ui, picker, sandbox, conflictSeed(), 'review');
      const { chat, changes: card, history, askKnowledgeFixes } = ui.main.assistant;
      const review = reviewPage(ui);
      await expectIssueRules(review, [
        'character_predicate',
        'entity_duplicate',
        'evidence',
        'relation_unique',
      ]);
      await provider.setBehavior(
        behaviorOf(knowledgeReply(opened.novelId, 'Sửa xung đột hợp lệ', validChanges(opened))),
      );

      await test.step('reports the proposal is valid against the ontology with the number of conflicts it resolves', async () => {
        await askKnowledgeFixes.click();
        await expect(card.root).toBeVisible();
        await expect(card.valid).toBeVisible();
        await expect(card.valid).toContainText(validText(3));
        await expect(card.invalid).toHaveCount(0);
        await expect(chat.replyTexts).toHaveText('Đề xuất sẽ giải quyết 3 xung đột.');
      });

      await test.step('reports the number of new conflicts a proposal would create and lists them', async () => {
        await provider.setBehavior(
          behaviorOf(
            knowledgeReply(opened.novelId, 'Sửa xung đột không an toàn', unsafeChanges(opened)),
          ),
        );
        await askKnowledgeFixes.click();
        await expect(card.title).toContainText('Sửa xung đột không an toàn');
        await expect(card.invalid).toContainText(invalidText(1));
        await expect(card.invalidItems).toHaveCount(1);
        await expect(card.invalidItems.first()).not.toBeEmpty();
        await expect(card.valid).toHaveCount(0);
      });

      await test.step('applies every change of the pending proposal at once and shows the new knowledge', async () => {
        await chat.history.click();
        await expect(history.sessions).toHaveCount(2);
        await history.open(history.sessions.nth(1)).click();
        await expect(card.title).toContainText('Sửa xung đột hợp lệ');
        await card.apply.click();
        await expect(ui.main.toast(appliedToast(1))).toBeVisible();
        await expect(card.status).toHaveText(STATUS_APPLIED);
        const state = await readKnowledgeState(opened.folder, SAMPLE_TITLE);
        expect(findEntity(state, 'Feng', 'persona')).toBeUndefined();
        expect(findEntity(state, 'sect banner', 'term')).toBeDefined();
        expect(findEntity(state, 'banner', 'term')).toBeUndefined();
        expect(findEntity(state, 'courtyard', 'location')).toBeDefined();
        expect(findEntity(state, 'Su Yan', 'persona')?.aliases).toContain('White Lotus');
        expect(findEntity(state, 'Azure City')?.evidence.length).toBeGreaterThan(0);
        expect(findEntity(state, 'duel', 'event')).toBeDefined();
        expect(state.facts.some((fact) => fact.pred === 'participates_in')).toBe(true);
        expect(state.facts.some((fact) => fact.pred === 'enemy_of')).toBe(true);
        expect(state.facts.some((fact) => fact.pred === 'ally_of' || fact.pred === 'owns')).toBe(
          false,
        );
        await expectIssueRules(review, ['relation_unique']);
      });

      await test.step('keeps the knowledge unchanged and marks the proposal dismissed when I dismiss it', async () => {
        await chat.history.click();
        await history.open(history.sessions.nth(0)).click();
        await expect(card.title).toContainText('Sửa xung đột không an toàn');
        const before = await readKnowledgeState(opened.folder, SAMPLE_TITLE);
        await card.reject.click();
        await expect(card.status).toHaveText(STATUS_REJECTED);
        expect(await readKnowledgeState(opened.folder, SAMPLE_TITLE)).toEqual(before);
        await expectIssueRules(review, ['relation_unique']);
      });
    });
  });
});
