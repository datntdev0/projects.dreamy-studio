import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { KnowledgeEntity, KnowledgeFact, KnowledgeIssue, KnowledgeItem } from "../novel.knowledge.models";
import { predicateDef } from "../novel.knowledge.ontology";
import { NovelKnowledgeService } from "../novel.knowledge.service";
import { characterOf, factText, factsAbout, isEntity, isFact, issuesOfItem, mapOf, nameOf, personasOf, predicateLabel } from "../novel.knowledge.rules";
import { toNovelError } from "../novel.rules";
import { NovelKnowledgeType } from "./knowledge-type.component";

export interface DetailLine {
  id: string;
  pred: string;
  value: string;
  other: string | null;
  outgoing: boolean;
}

@Component({
  selector: "app-novel-knowledge-detail",
  standalone: true,
  imports: [Icon, CoreModule, NovelKnowledgeType],
  templateUrl: "./knowledge-detail.component.html",
})
export class NovelKnowledgeDetail {
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);

  readonly novelId = input.required<number>();
  readonly item = input.required<KnowledgeItem>();

  readonly entity = computed(this.buildEntity.bind(this));
  readonly fact = computed(this.buildFact.bind(this));
  readonly scalars = computed(this.buildScalars.bind(this));
  readonly relations = computed(this.buildRelations.bind(this));
  readonly personas = computed(this.buildPersonas.bind(this));
  readonly character = computed(this.buildCharacter.bind(this));
  readonly issues = computed(this.buildIssues.bind(this));
  readonly title = computed(this.buildTitle.bind(this));
  readonly factKind = computed(this.buildFactKind.bind(this));

  go(id: string | null): void {
    if (id) {
      this.knowledge.select(this.novelId(), id);
    }
  }

  edit(): void {
    this.dialogs.openEdit(this.novelId(), [this.item().id]);
  }

  addFact(): void {
    this.dialogs.openAdd(this.novelId(), "fact", [this.item().id]);
  }

  openReview(): void {
    this.knowledge.setTab(this.novelId(), "review");
  }

  async remove(): Promise<void> {
    try {
      await this.knowledge.confirmRemove(this.novelId(), [this.item().id], this.title());
    } catch (cause) {
      this.toasts.show(this.languageService.translate("novel.error.generic", { detail: toNovelError(cause).detail }), "danger");
    }
  }

  private text(key: LanguageKey): string {
    return this.languageService.translate(key);
  }

  private items(): KnowledgeItem[] {
    return this.knowledge.of(this.novelId()).items;
  }

  private lines(entity: KnowledgeEntity): DetailLine[] {
    const map = mapOf(this.items());
    const out: DetailLine[] = [];
    for (const fact of factsAbout(this.items(), entity.id)) {
      const outgoing = fact.subject === entity.id;
      const otherId = outgoing ? fact.object : fact.subject;
      const value = otherId === null ? (fact.value ?? "") : nameOf(map, otherId);
      out.push({ id: fact.id, pred: predicateLabel(fact.pred, this.text.bind(this)), value, other: otherId, outgoing });
    }
    return out;
  }

  private buildEntity(): KnowledgeEntity | null {
    const item = this.item();
    return isEntity(item) ? item : null;
  }

  private buildFact(): KnowledgeFact | null {
    const item = this.item();
    return isFact(item) ? item : null;
  }

  private buildScalars(): DetailLine[] {
    const entity = this.entity();
    return entity ? this.lines(entity).filter((line) => line.other === null) : [];
  }

  private buildRelations(): DetailLine[] {
    const entity = this.entity();
    return entity ? this.lines(entity).filter((line) => line.other !== null && !this.isPersonaLink(line.id)) : [];
  }

  private isPersonaLink(factId: string): boolean {
    const fact = this.items().find((item) => item.id === factId);
    return fact !== undefined && isFact(fact) && fact.pred === "persona_of";
  }

  private buildPersonas(): KnowledgeEntity[] {
    const entity = this.entity();
    return entity && entity.type === "character" ? personasOf(this.items(), entity.id) : [];
  }

  private buildCharacter(): KnowledgeEntity | null {
    const entity = this.entity();
    return entity && entity.type === "persona" ? (characterOf(this.items(), entity.id) ?? null) : null;
  }

  private buildIssues(): KnowledgeIssue[] {
    const open = this.knowledge.issuesOf(this.novelId());
    const item = this.item();
    const own = issuesOfItem(open, item.id);
    const related = isEntity(item) ? factsAbout(this.items(), item.id).flatMap((fact) => issuesOfItem(open, fact.id)) : [];
    return [...own, ...related.filter((issue) => !own.some((entry) => entry.id === issue.id))];
  }

  private buildTitle(): string {
    const item = this.item();
    return isEntity(item) ? item.name : factText(mapOf(this.items()), item, this.text.bind(this));
  }

  private buildFactKind(): LanguageKey {
    const fact = this.fact();
    const kind = fact ? (predicateDef(fact.pred)?.kind ?? (fact.object === null ? "scalar" : "relationship")) : "scalar";
    return kind === "scalar" ? "novel.knowledge.fact.scalar" : "novel.knowledge.fact.relationship";
  }

  endName(id: string | null): string {
    return nameOf(mapOf(this.items()), id);
  }

  predText(pred: string): string {
    return predicateLabel(pred, this.text.bind(this));
  }
}
