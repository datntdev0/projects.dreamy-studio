import { Component, computed, inject } from "@angular/core";
import { Icon } from "@components/icon";
import { SegmentOption, Segments } from "@components/segments";
import { Slider } from "@components/slider";
import { CoreModule } from "@core/core.module";
import { LanguageService } from "@core/language/language.service";
import { TabsService } from "@layout/tabs.service";
import { KnowledgeView } from "../novel.knowledge.models";
import { NovelKnowledgeService } from "../novel.knowledge.service";
import { ChapterRow, NovelSummary } from "../novel.models";
import { NovelService } from "../novel.service";
import { displayName } from "../novel.rules";

export interface OmniscientTick {
  seq: number;
  analyzed: boolean;
  hidden: boolean;
  cursor: boolean;
  title: string;
}

type OmniscientMode = "omniscient" | "chapter";

@Component({
  selector: "app-novel-omniscient",
  standalone: true,
  imports: [Icon, Segments, Slider, CoreModule],
  templateUrl: "./knowledge-omniscient.component.html",
})
export class NovelOmniscient {
  private readonly tabs = inject(TabsService);
  private readonly novels = inject(NovelService);
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly languageService = inject(LanguageService);

  readonly novelId = computed(this.buildNovelId.bind(this));
  readonly novel = computed(this.findNovel.bind(this));
  readonly chapters = computed(this.buildChapters.bind(this));
  readonly view = computed(this.buildView.bind(this));
  readonly total = computed(this.buildTotal.bind(this));
  readonly modes = computed(this.buildModes.bind(this));
  readonly ticks = computed(this.buildTicks.bind(this));
  readonly cursor = computed(this.buildCursor.bind(this));

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  titleOf(row: ChapterRow): string {
    return this.languageService.translate("novel.knowledge.omniscient.chapter", { n: row.seq, title: row.title });
  }

  onMode(value: string): void {
    const id = this.novelId();
    if (id !== null) {
      this.knowledge.patchView(id, { spoiler: value === "chapter", upTo: this.cursor() });
    }
  }

  onSlider(value: number): void {
    this.setUpTo(value);
  }

  onSelect(event: Event): void {
    this.setUpTo(Number((event.target as HTMLSelectElement).value));
  }

  step(delta: number): void {
    this.setUpTo(this.cursor() + delta);
  }

  jump(seq: number): void {
    this.setUpTo(seq);
  }

  private setUpTo(value: number): void {
    const id = this.novelId();
    if (id !== null) {
      this.knowledge.patchView(id, { upTo: Math.min(Math.max(1, Math.round(value)), Math.max(1, this.total())) });
    }
  }

  private buildNovelId(): number | null {
    const tab = this.tabs.active();
    return tab.kind === "knowledge" ? tab.novelId : null;
  }

  private findNovel(): NovelSummary | null {
    const id = this.novelId();
    return id === null ? null : (this.novels.novelById(id) ?? null);
  }

  private buildChapters(): ChapterRow[] {
    const id = this.novelId();
    return id === null ? [] : this.novels.chaptersOf(id);
  }

  private buildView(): KnowledgeView {
    const id = this.novelId();
    return this.knowledge.viewOf(id ?? 0);
  }

  private buildTotal(): number {
    return this.chapters().length;
  }

  private buildCursor(): number {
    return Math.min(Math.max(1, this.view().upTo), Math.max(1, this.total()));
  }

  private buildModes(): SegmentOption[] {
    return [
      { value: "omniscient", label: this.languageService.translate("novel.knowledge.omniscient.mode.omniscient") },
      { value: "chapter", label: this.languageService.translate("novel.knowledge.omniscient.mode.chapter") },
    ];
  }

  private buildTicks(): OmniscientTick[] {
    const id = this.novelId();
    const analyzed = id === null ? {} : this.knowledge.of(id).analyzed;
    const spoiler = this.view().spoiler;
    const cursor = this.cursor();
    return this.chapters().map((row) => ({ seq: row.seq, analyzed: analyzed[row.seq] !== undefined, hidden: spoiler && row.seq > cursor, cursor: spoiler && row.seq === cursor, title: this.titleOf(row) }));
  }

}
