import { Component, computed, effect, inject, signal } from "@angular/core";
import { CoreModule } from "@core/core.module";
import { NovelToolKind, novelTabId, novelToolTabId } from "@layout/layout.models";
import { TabsService } from "@layout/tabs.service";
import { NovelSummary } from "../novel.models";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { displayName, passesFilters } from "../novel.rules";
import { Cover } from "@components/cover";

@Component({
  selector: "app-novel-explorer",
  standalone: true,
  imports: [CoreModule, Cover],
  templateUrl: "./explorer.component.html",
})
export class NovelExplorer {
  private readonly reader = inject(NovelReaderService);

  readonly novels = inject(NovelService);
  readonly tabs = inject(TabsService);
  readonly filtersOpen = signal(true);
  readonly shown = computed(this.buildShown.bind(this));

  constructor() {
    effect(this.loadCovers.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  imageOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? "";
  }

  isOpen(novel: NovelSummary): boolean {
    return !this.novels.collapsedIds().includes(novel.id);
  }

  isChaptersActive(novel: NovelSummary): boolean {
    return this.tabs.isActive(novelTabId(novel.id));
  }

  isToolActive(kind: NovelToolKind, novel: NovelSummary): boolean {
    return this.tabs.isActive(novelToolTabId(kind, novel.id));
  }

  isTagOn(tag: string): boolean {
    return this.novels.filters().tags.includes(tag);
  }

  isLangOn(lang: string): boolean {
    return this.novels.filters().langs.some((item) => item === lang);
  }

  openNovels(): void {
    this.tabs.openNovels();
  }

  openNovel(novel: NovelSummary): void {
    this.tabs.openNovel(novel.id, displayName(novel));
    void this.reader.openNovel(novel.id);
  }

  openTool(kind: NovelToolKind, novel: NovelSummary): void {
    this.tabs.openNovelTool(kind, novel.id, displayName(novel));
  }

  toggleGroup(novel: NovelSummary): void {
    this.novels.toggleCollapsed(novel.id);
  }

  toggleFilters(): void {
    this.filtersOpen.set(!this.filtersOpen());
  }

  private buildShown(): NovelSummary[] {
    const filters = this.novels.filters();
    const out: NovelSummary[] = [];
    for (const novel of this.novels.novels()) {
      if (passesFilters(novel, filters)) {
        out.push(novel);
      }
    }
    return out;
  }

  private loadCovers(): void {
    for (const novel of this.novels.novels()) {
      this.novels.ensureCover(novel);
    }
  }
}
