import { Component, computed, effect, inject, input, untracked } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { NovelDialogsService } from "../novel.dialogs.service";
import { KnowledgeTab, KnowledgeView } from "../novel.knowledge.models";
import { NovelKnowledgeService } from "../novel.knowledge.service";
import { errorCount } from "../novel.knowledge.rules";
import { NovelSummary } from "../novel.models";
import { NovelService } from "../novel.service";
import { NovelKnowledgeGraph } from "./knowledge-graph.component";
import { NovelKnowledgeList } from "./knowledge-list.component";
import { NovelKnowledgeReview } from "./knowledge-review.component";
import { NovelProgressFrac } from "./progress-frac.component";

const TABS: KnowledgeTab[] = ["graph", "list", "review"];
const TAB_ICONS: Record<KnowledgeTab, string> = { graph: "nodes", list: "list", review: "shield" };
const TAB_KEYS: Record<KnowledgeTab, LanguageKey> = { graph: "novel.knowledge.tab.graph", list: "novel.knowledge.tab.list", review: "novel.knowledge.tab.review" };

@Component({
  selector: "app-novel-knowledge",
  standalone: true,
  imports: [Icon, CoreModule, NovelProgressFrac, NovelKnowledgeGraph, NovelKnowledgeList, NovelKnowledgeReview],
  templateUrl: "./knowledge.component.html",
})
export class NovelKnowledge {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);

  readonly knowledge = inject(NovelKnowledgeService);
  readonly novelId = input.required<number>();
  readonly tabs = TABS;

  readonly novel = computed(this.findNovel.bind(this));
  readonly view = computed(this.buildView.bind(this));
  readonly total = computed(this.buildTotal.bind(this));
  readonly analyzed = computed(this.buildAnalyzed.bind(this));
  readonly open = computed(this.buildOpen.bind(this));
  readonly errors = computed(this.buildErrors.bind(this));
  readonly blank = computed(this.buildBlank.bind(this));
  readonly running = computed(this.buildRunning.bind(this));

  constructor() {
    effect(this.syncNovel.bind(this));
  }

  tabIcon(tab: KnowledgeTab): string {
    return TAB_ICONS[tab];
  }

  tabKey(tab: KnowledgeTab): LanguageKey {
    return TAB_KEYS[tab];
  }

  go(tab: KnowledgeTab): void {
    this.knowledge.setTab(this.novelId(), tab);
  }

  analyze(): void {
    this.dialogs.openAnalyze(this.novelId());
  }

  private findNovel(): NovelSummary | null {
    return this.novels.novelById(this.novelId()) ?? null;
  }

  private buildView(): KnowledgeView {
    return this.knowledge.viewOf(this.novelId());
  }

  private buildTotal(): number {
    return this.novels.chaptersOf(this.novelId()).length;
  }

  private buildAnalyzed(): number {
    return this.knowledge.analyzedCountOf(this.novelId());
  }

  private buildOpen(): number {
    return this.knowledge.issuesOf(this.novelId()).length;
  }

  private buildErrors(): number {
    return errorCount(this.knowledge.issuesOf(this.novelId()));
  }

  private buildBlank(): boolean {
    return this.analyzed() === 0 && this.knowledge.of(this.novelId()).items.length === 0;
  }

  private buildRunning(): boolean {
    return this.knowledge.isRunning(this.novelId());
  }

  private syncNovel(): void {
    const id = this.novelId();
    untracked(this.openNovel.bind(this, id));
  }

  private openNovel(id: number): void {
    void this.knowledge.ensure(id);
  }
}
