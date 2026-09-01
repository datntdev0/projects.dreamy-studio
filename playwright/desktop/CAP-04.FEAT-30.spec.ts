// prettier-ignore
import { CHECK_DUPLICATE, CHECK_EVIDENCE_NONE, CHECK_EVIDENCE_QUOTE, CHECK_SIGNATURE, CHECK_STALE, CLEAN_NOVEL, cleanCase, expectIssueRules, FIX_ANALYSES, MIXED_ANALYSES, MIXED_NOVEL, MIXED_RULES, openKnowledge, readKnowledgeState, removeMessage, REVIEW_DONE_CREATED, REVIEW_DONE_KEPT, REVIEW_DONE_MERGED, REVIEW_DONE_MOVED, REVIEW_DONE_REMOVED, REVIEW_EMPTY, reviewNovel, reviewPage, reviewSeed, ruleCases, STALE_ANALYSES, STALE_RULES } from '../scripts/knowledge.ts';
import { expect, test } from '../scripts/provider.ts';

const FIX_NOVEL = 'Fix Chronicle';
const STALE_NOVEL = 'Stale Chronicle';

test.describe('CAP-04 Content Intelligence', () => {
  test.describe('FEAT-30 Knowledge Consistency Review', () => {
    test('US-0085 lists knowledge conflicts as rule cards', async ({ ui, picker, sandbox }) => {
      await openKnowledge(
        ui,
        picker,
        sandbox,
        reviewSeed([{ novel: MIXED_NOVEL, analyses: MIXED_ANALYSES }, cleanCase()]),
        'review',
      );
      const review = reviewPage(ui);

      await test.step('shows one card per conflict labelled with its violated rule and totals them on the tab', async () => {
        await expectIssueRules(review, MIXED_RULES);
        await expect(ui.main.knowledge.reviewCount).toHaveText(String(MIXED_RULES.length));
      });

      await test.step('shows only the cards of the chosen rule when filtering', async () => {
        await review.rule.selectOption('evidence');

        await expect(review.issues).toHaveCount(2);
        await expect(review.issuesOf('evidence')).toHaveCount(2);

        await review.rule.selectOption('entity_duplicate');

        await expect(review.issues).toHaveCount(1);
        await expect(review.issuesOf('entity_duplicate')).toHaveCount(1);
      });

      await test.step('shows the no-conflicts state when the knowledge has no conflict', async () => {
        const clean = await reviewNovel(ui, CLEAN_NOVEL);

        await expect(clean.issues).toHaveCount(0);
        await expect(clean.empty).toBeVisible();
        await expect(clean.emptyTitle).toHaveText(REVIEW_EMPTY);
        await expect(ui.main.knowledge.reviewCount).toHaveCount(0);
      });
    });

    test('US-0086 detects the common kinds of contradiction', async ({ ui, picker, sandbox }) => {
      await openKnowledge(ui, picker, sandbox, reviewSeed(ruleCases()), 'review');

      await test.step('reports a duplicate entity conflict for same-type entities whose names match without diacritics or contain each other', async () => {
        const review = await reviewNovel(ui, 'Duplicate Chronicle');

        await expectIssueRules(review, ['entity_duplicate']);
        await expect(review.card('entity_duplicate').message).toContainText(CHECK_DUPLICATE);
      });

      await test.step('reports a source-changed conflict for the knowledge of a chapter edited after analysis', async () => {
        const review = await reviewNovel(ui, 'Stale Chronicle');

        await expectIssueRules(review, STALE_RULES);
        await expect(review.issuesOf('source_stale').filter({ hasText: CHECK_STALE })).toHaveCount(
          STALE_RULES.length,
        );
      });

      await test.step('reports evidence that no longer matches the text', async () => {
        const review = await reviewNovel(ui, 'Evidence Chronicle');

        await expectIssueRules(review, ['evidence', 'evidence']);
        await expect(review.issues.filter({ hasText: CHECK_EVIDENCE_NONE })).toHaveCount(1);
        await expect(review.issues.filter({ hasText: CHECK_EVIDENCE_QUOTE })).toHaveCount(1);
      });

      await test.step('reports a relation whose entity types violate its signature', async () => {
        const review = await reviewNovel(ui, 'Signature Chronicle');

        await expectIssueRules(review, ['relation_signature']);
        await expect(review.card('relation_signature').message).toContainText(CHECK_SIGNATURE);
      });
    });

    test('US-0087 fixes conflicts quickly on the card', async ({ ui, picker, sandbox }) => {
      const { folder } = await openKnowledge(
        ui,
        picker,
        sandbox,
        reviewSeed([{ novel: FIX_NOVEL, analyses: FIX_ANALYSES }]),
        'review',
      );
      const review = reviewPage(ui);
      await expectIssueRules(review, [
        'character_predicate',
        'persona_link',
        'entity_duplicate',
        'evidence',
        ...STALE_RULES,
      ]);

      await test.step('merges the duplicate entities, announces it and clears the conflict', async () => {
        await review.card('entity_duplicate').merge.click();

        await expect(ui.main.toast(REVIEW_DONE_MERGED)).toBeVisible();
        await expect(review.issuesOf('entity_duplicate')).toHaveCount(0);
        const state = await readKnowledgeState(folder, FIX_NOVEL);
        expect(
          state.entities.filter((entity) => entity.type === 'persona' && /feng/i.test(entity.name)),
        ).toHaveLength(1);
      });

      await test.step('moves a predicate to the persona or creates a character for a persona, announces it and clears the conflict', async () => {
        await review.card('character_predicate').move.click();

        await expect(ui.main.toast(REVIEW_DONE_MOVED)).toBeVisible();
        await expect(review.issuesOf('character_predicate')).toHaveCount(0);

        await review.card('persona_link').create.click();

        await expect(ui.main.toast(REVIEW_DONE_CREATED)).toBeVisible();
        await expect(review.issuesOf('persona_link')).toHaveCount(0);
        const state = await readKnowledgeState(folder, FIX_NOVEL);
        expect(
          state.entities.some(
            (entity) => entity.type === 'character' && entity.name === 'Master Chen',
          ),
        ).toBe(true);
      });

      await test.step('deletes the item after confirming in the confirmation dialog, announces it and clears the conflict', async () => {
        await review.card('evidence').remove.click();

        await expect(ui.main.confirm.panel).toBeVisible();
        await expect(ui.main.confirm.panel).toContainText(removeMessage('Azure City'));
        await ui.main.confirm.accept.click();

        await expect(ui.main.toast(REVIEW_DONE_REMOVED)).toBeVisible();
        await expect(review.issuesOf('evidence')).toHaveCount(0);
        const state = await readKnowledgeState(folder, FIX_NOVEL);
        expect(state.entities.some((entity) => entity.name === 'Azure City')).toBe(false);
      });

      await test.step('keeps a changed source as it is, announces it is done and clears the conflict', async () => {
        await review.card('source_stale').keep.click();

        await expect(ui.main.toast(REVIEW_DONE_KEPT)).toBeVisible();
        await expect(review.issuesOf('source_stale')).toHaveCount(0);
        expect((await readKnowledgeState(folder, FIX_NOVEL)).stale).toEqual([]);
        await expect(review.issues).toHaveCount(0);
        await expect(review.empty).toBeVisible();
      });
    });

    test('US-0088 reopens the analysis for a chapter whose source changed', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openKnowledge(
        ui,
        picker,
        sandbox,
        reviewSeed([{ novel: STALE_NOVEL, analyses: STALE_ANALYSES }]),
        'review',
      );
      const review = reviewPage(ui);
      const dialog = ui.main.knowledge.analyzeDialog;

      await test.step('opens the analyze dialog scoped to that chapter with overwrite already checked', async () => {
        await expectIssueRules(review, STALE_RULES);

        await review.card('source_stale').reanalyze.click();

        await expect(dialog.panel).toBeVisible();
        await expect(dialog.mode('range').getByRole('radio')).toBeChecked();
        await expect(dialog.from).toHaveValue('2');
        await expect(dialog.to).toHaveValue('2');
        await expect(dialog.overwrite).toBeChecked();
      });
    });
  });
});
