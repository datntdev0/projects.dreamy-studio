import { Component, HostListener, effect, inject } from "@angular/core";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { TabsService } from "../../../../layout/tabs.service";
import { NovelLang, NovelSummary, NovelViewMode } from "../novel.models";
import { NovelDialogsService } from "../novel.dialogs.service";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { displayName, formatCount, formatStamp, hasCustomName } from "../novel.rules";
import { NovelCover, coverBackground, coverColorsFor } from "./cover.component";
import { NovelProgressFrac } from "./progress-frac.component";

const INTERACTIVE_SELECTOR = "input,button";
const FIELD_SELECTOR = "input,textarea,select";

function isInside(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

@Component({
  selector: "app-novel-list",
  standalone: true,
  imports: [I18nPipe, NovelCover, NovelProgressFrac],
  templateUrl: "./list.component.html",
})
export class NovelList {
  private readonly i18n = inject(I18nService);
  private readonly tabs = inject(TabsService);
  private readonly reader = inject(NovelReaderService);
  private readonly dialogs = inject(NovelDialogsService);

  readonly novels = inject(NovelService);

  constructor() {
    effect(this.loadCovers.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  authorOf(novel: NovelSummary): string {
    return novel.author || this.i18n.translate("novel.author.unknown");
  }

  subtitleOf(novel: NovelSummary): string {
    const author = this.authorOf(novel);
    return hasCustomName(novel) ? `${novel.title} · ${author}` : author;
  }

  fmt(value: number): string {
    return formatCount(value);
  }

  stampOf(novel: NovelSummary): string {
    return formatStamp(novel.updatedAt);
  }

  colorsOf(novel: NovelSummary): string[] {
    return coverColorsFor(novel.id);
  }

  imageOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? "";
  }

  hasImage(novel: NovelSummary): boolean {
    return this.imageOf(novel) !== "";
  }

  backgroundOf(novel: NovelSummary): string {
    return coverBackground(this.colorsOf(novel), this.imageOf(novel));
  }

  isSelected(id: number): boolean {
    return this.novels.selectedSet().has(id);
  }

  isViewActive(mode: NovelViewMode): boolean {
    return this.novels.view() === mode;
  }

  setView(mode: NovelViewMode): void {
    this.novels.setView(mode);
  }

  onQuery(event: Event): void {
    this.novels.setQuery((event.target as HTMLInputElement).value);
  }

  onSelect(event: MouseEvent, id: number): void {
    this.novels.select(id, event);
  }

  onToggle(event: Event, id: number): void {
    event.stopPropagation();
    this.novels.toggleSelected(id);
  }

  onDoubleClick(event: MouseEvent, novel: NovelSummary): void {
    if (!isInside(event.target, INTERACTIVE_SELECTOR)) {
      this.open(novel);
    }
  }

  onEnter(event: Event, novel: NovelSummary): void {
    if (event.target === event.currentTarget) {
      this.open(novel);
    }
  }

  open(novel: NovelSummary): void {
    this.tabs.openNovel(novel.id, displayName(novel));
    void this.reader.openNovel(novel.id);
  }

  toggleLang(lang: NovelLang): void {
    this.novels.toggleLangFilter(lang);
  }

  toggleTag(tag: string): void {
    this.novels.toggleTagFilter(tag);
  }

  deleteSelected(): void {
    this.dialogs.openDelete(this.novels.selectedIds());
  }

  openCreate(): void {
    this.dialogs.openCreate();
  }

  openImport(): void {
    this.dialogs.openImport();
  }

  @HostListener("document:keydown", ["$event"])
  onDeleteKey(event: KeyboardEvent): void {
    if (event.key !== "Delete" || isInside(event.target, FIELD_SELECTOR)) {
      return;
    }
    if (this.isModalOpen() || this.novels.selectedIds().length === 0) {
      return;
    }
    this.deleteSelected();
  }

  private isModalOpen(): boolean {
    const dialogs = this.dialogs;
    const tracked = dialogs.createOpen() || dialogs.importOpen() || dialogs.deleteIds().length > 0;
    return tracked || document.querySelector(".modal") !== null;
  }

  private loadCovers(): void {
    for (const novel of this.novels.visible()) {
      this.novels.ensureCover(novel);
    }
  }
}
