import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { blankEntity, blankFact } from "../novel.knowledge.draft";
import { KnowledgeEdit, KnowledgeEvidence, KnowledgeFact, KnowledgeIssue, KnowledgeItem, KnowledgeView, RuleCount, RuleDef, RuleId } from "../novel.knowledge.models";
import { PERSONA_PREDICATE, ruleDef } from "../novel.knowledge.ontology";
import { NovelKnowledgeService } from "../novel.knowledge.service";
import { chaptersOfItem, isEntity, isFact, itemText, mapOf, ruleCounts } from "../novel.knowledge.rules";
import { toNovelError } from "../novel.rules";

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
  selector: "app-novel-knowledge-review",
  standalone: true,
  imports: [Icon, CoreModule],
  templateUrl: "./knowledge-review.component.html",
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
    this.knowledge.patchView(this.novelId(), { rule: (event.target as HTMLSelectElement).value as RuleId | "all" });
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
      const name = itemText(mapOf(this.items()), item, this.text.bind(this));
      await this.guard(this.knowledge.confirmRemove(this.novelId(), [item.id], name), "novel.knowledge.review.done.removed");
    }
  }

  async moveToPersona(issue: KnowledgeIssue, personaId: string): Promise<void> {
    const fact = this.items().find((item) => item.id === issue.ids[0]);
    if (!fact || !isFact(fact)) {
      return;
    }
    const subject = mapOf(this.items()).get(fact.subject);
    const side = subject && isEntity(subject) && subject.type === "character" ? "subject" : "object";
    await this.commitEdits([{ k: "edit", id: fact.id, patch: { [side]: personaId } }], "novel.knowledge.review.done.moved");
  }

  async createCharacter(issue: KnowledgeIssue): Promise<void> {
    const persona = this.items().find((item) => item.id === issue.ids[0]);
    if (!persona || !isEntity(persona)) {
      return;
    }
    const base = this.items();
    const character = { ...blankEntity(base, [], "character"), name: persona.name, ev: structuredClone(persona.ev) };
    const created: KnowledgeEdit[] = [{ k: "add", item: character }];
    const link: KnowledgeFact = { ...blankFact(base, created, persona.id, character.id), pred: PERSONA_PREDICATE, value: null, ev: structuredClone(persona.ev) };
    await this.commitEdits([...created, { k: "add", item: link }], "novel.knowledge.review.done.created");
  }

  async keepValue(issue: KnowledgeIssue, value: string): Promise<void> {
    const drop: string[] = [];
    for (const item of this.items()) {
      if (issue.ids.includes(item.id) && isFact(item) && item.value !== value) {
        drop.push(item.id);
      }
    }
    await this.guard(this.knowledge.remove(this.novelId(), drop), "novel.knowledge.review.done.kept");
  }

  async merge(keep: string, drop: string): Promise<void> {
    await this.commitEdits([{ k: "merge", sources: [keep, drop], target: keep }], "novel.knowledge.review.done.merged");
  }

  async keepStale(issue: KnowledgeIssue): Promise<void> {
    await this.guard(this.knowledge.clearStale(this.novelId(), issue.ids), "novel.knowledge.review.done.kept");
  }

  reanalyze(issue: KnowledgeIssue): void {
    const item = this.items().find((entry) => entry.id === issue.ids[0]);
    const chapters = item ? chaptersOfItem(item) : [];
    if (chapters.length > 0) {
      this.dialogs.openAnalyze(this.novelId(), { mode: "range", from: chapters[0], to: chapters[chapters.length - 1], overwrite: true });
    }
  }

  private async commitEdits(edits: KnowledgeEdit[], done: LanguageKey): Promise<void> {
    await this.guard(this.knowledge.apply(this.novelId(), edits), done);
  }

  private async guard(job: Promise<unknown>, done: LanguageKey): Promise<void> {
    try {
      await job;
      this.toasts.show(this.languageService.translate(done));
    } catch (cause) {
      this.toasts.show(this.languageService.translate("novel.error.generic", { detail: toNovelError(cause).detail }), "danger");
    }
  }

  private text(key: LanguageKey): string {
    return this.languageService.translate(key);
  }

  private optionOf(map: Map<string, KnowledgeItem>, id: string): IssueOption {
    const item = map.get(id);
    return { id, label: item ? itemText(map, item, this.languageService.translate.bind(this.languageService)) : id };
  }

  private chipOf(map: Map<string, KnowledgeItem>, id: string): IssueChip {
    const option = this.optionOf(map, id);
    const item = map.get(id);
    return { id, label: option.label, type: item && isEntity(item) ? item.type : "" };
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
    return ruleCounts(this.issues());
  }

  private buildCards(): IssueCard[] {
    const view = this.view();
    const map = mapOf(this.items());
    const out: IssueCard[] = [];
    for (const issue of this.issues()) {
      if (view.rule !== "all" && issue.rule !== view.rule) {
        continue;
      }
      const first = map.get(issue.ids[0]);
      out.push({
        issue,
        rule: ruleDef(issue.rule),
        chips: issue.ids.map(this.chipOf.bind(this, map)),
        personas: issue.rule === "character_predicate" ? issue.values.map(this.optionOf.bind(this, map)) : [],
        pair: issue.rule === "entity_duplicate" ? issue.ids.map(this.optionOf.bind(this, map)) : [],
        evidence: issue.rule === "evidence" && first ? first.ev : [],
      });
    }
    return out;
  }
}
