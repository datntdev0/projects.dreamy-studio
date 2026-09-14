import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue } from '@shared/utils/dom';

import { NovelDialogsService } from '../novel.dialogs.service';
// prettier-ignore
import { KnowledgeEdit, KnowledgeEvidence, KnowledgeIssue, KnowledgeItem, KnowledgeView, RuleCount, RuleDef, RuleId } from '../novel.knowledge.models';
// prettier-ignore
import { chaptersOfItem, isEntity, isFact, itemText, mapOf, ruleCounts } from '../novel.knowledge.rules';
import { NovelKnowledgeService } from '../novel.knowledge.service';
import { toNovelError } from '../novel.rules';

export interface IssueChip {
  id: string;
  label: string;
  type: string;
}

export interface IssueOption {
  id: string;
  label: string;
}

export interface IssueCard {
  issue: KnowledgeIssue;
  rule: RuleDef;
  chips: IssueChip[];
  personas: IssueOption[];
  pair: IssueOption[];
  evidence: KnowledgeEvidence[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-knowledge-review',
  imports: [Icon, CoreModule],
  templateUrl: './knowledge-review.component.html',
  host: { 'data-testid': 'novel-knowledge-review' },
})
export class NovelKnowledgeReview {
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);

  readonly novelId = input.required<number>();

  readonly view = computed(this.buildView.bind(this));
  readonly items = computed(this.buildItems.bind(this));
  readonly issues = computed(this.buildIssues.bind(this));
  readonly counts = computed(this.buildCounts.bind(this));
  readonly cards = computed(this.buildCards.bind(this));

  onRule(event: Event): void {
    this.knowledge.patchView(this.novelId(), {
      rule: fieldValue(event) as RuleId | 'all',
    });
  }

  select(id: string | undefined): void {
    if (id) {
      this.knowledge.select(this.novelId(), id);
    }
  }

  edit(issue: KnowledgeIssue): void {
    this.dialogs.openEdit(this.novelId(), issue.ids, issue.id);
  }

  async remove(issue: KnowledgeIssue): Promise<void> {
    const item = this.items().find((entry) => entry.id === issue.ids[0]);
    if (item) {
      const name = itemText(
        this.knowledge.ontology(),
        mapOf(this.items()),
        item,
        this.text.bind(this),
      );
      await this.guard(
        this.knowledge.confirmRemove(this.novelId(), [item.id], name),
        'novel.knowledge.review.done.removed',
      );
    }
  }

  async moveToPersona(issue: KnowledgeIssue, personaId: string): Promise<void> {
    const fact = this.items().find((item) => item.id === issue.ids[0]);
    if (!fact || !isFact(fact)) {
      return;
    }
    const subject = mapOf(this.items()).get(fact.subject);
    const onSubject = subject && isEntity(subject) && subject.type === 'character';
    const edit: KnowledgeEdit = onSubject
      ? { k: 'fact', id: fact.id, subject: personaId }
      : { k: 'fact', id: fact.id, object: personaId };
    await this.commitEdits([edit], 'novel.knowledge.review.done.moved');
  }

  async createCharacter(issue: KnowledgeIssue): Promise<void> {
    const persona = this.items().find((item) => item.id === issue.ids[0]);
    if (persona && isEntity(persona)) {
      await this.commitEdits(
        [{ k: 'character', persona: persona.id }],
        'novel.knowledge.review.done.created',
      );
    }
  }

  async merge(keep: string, drop: string): Promise<void> {
    await this.commitEdits(
      [{ k: 'merge', sources: [keep, drop], target: keep }],
      'novel.knowledge.review.done.merged',
    );
  }

  async keepStale(issue: KnowledgeIssue): Promise<void> {
    await this.guard(
      this.knowledge.staleAccept(this.novelId(), this.staleChaptersOf(issue)),
      'novel.knowledge.review.done.kept',
    );
  }

  reanalyze(issue: KnowledgeIssue): void {
    const item = this.items().find((entry) => entry.id === issue.ids[0]);
    const chapters = item ? chaptersOfItem(item) : [];
    if (chapters.length > 0) {
      this.dialogs.openAnalyze(this.novelId(), {
        mode: 'range',
        from: chapters[0],
        to: chapters[chapters.length - 1],
        overwrite: true,
      });
    }
  }

  private staleChaptersOf(issue: KnowledgeIssue): number[] {
    const seqs = new Set<number>();
    for (const item of this.items()) {
      if (issue.ids.includes(item.id)) {
        item.stale.forEach(seqs.add.bind(seqs));
      }
    }
    return [...seqs].sort((a, b) => a - b);
  }

  private async commitEdits(edits: KnowledgeEdit[], done: LanguageKey): Promise<void> {
    await this.guard(this.knowledge.apply(this.novelId(), edits), done);
  }

  private async guard(job: Promise<unknown>, done: LanguageKey): Promise<void> {
    try {
      await job;
      this.toasts.show(this.languageService.translate(done));
    } catch (cause) {
      this.toasts.show(
        this.languageService.translate('novel.error.generic', {
          detail: toNovelError(cause).detail,
        }),
        'danger',
      );
    }
  }

  private text(key: LanguageKey): string {
    return this.languageService.translate(key);
  }

  private optionOf(map: Map<string, KnowledgeItem>, id: string): IssueOption {
    const item = map.get(id);
    return {
      id,
      label: item
        ? itemText(
            this.knowledge.ontology(),
            map,
            item,
            this.languageService.translate.bind(this.languageService),
          )
        : id,
    };
  }

  private chipOf(map: Map<string, KnowledgeItem>, id: string): IssueChip {
    const option = this.optionOf(map, id);
    const item = map.get(id);
    return { id, label: option.label, type: item && isEntity(item) ? item.type : '' };
  }

  private buildView(): KnowledgeView {
    return this.knowledge.viewOf(this.novelId());
  }

  private buildItems(): KnowledgeItem[] {
    return this.knowledge.of(this.novelId()).items;
  }

  private buildIssues(): KnowledgeIssue[] {
    return this.knowledge.issuesOf(this.novelId());
  }

  private buildCounts(): RuleCount[] {
    return ruleCounts(this.knowledge.ontology(), this.issues());
  }

  private buildCards(): IssueCard[] {
    const view = this.view();
    const map = mapOf(this.items());
    const ontology = this.knowledge.ontology();
    const out: IssueCard[] = [];
    for (const issue of this.issues()) {
      if (view.rule !== 'all' && issue.rule !== view.rule) {
        continue;
      }
      const first = map.get(issue.ids[0]);
      out.push({
        issue,
        rule: ontology.ruleDef(issue.rule),
        chips: issue.ids.map(this.chipOf.bind(this, map)),
        personas:
          issue.rule === 'character_predicate'
            ? issue.values.map(this.optionOf.bind(this, map))
            : [],
        pair: issue.rule === 'entity_duplicate' ? issue.ids.map(this.optionOf.bind(this, map)) : [],
        evidence: issue.rule === 'evidence' && first ? first.ev : [],
      });
    }
    return out;
  }
}
