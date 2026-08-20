import { Component, HostListener, effect, inject } from "@angular/core";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { TabsService } from "@layout/tabs.service";
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from "@components/datatable";
import { NovelLang, NovelSummary, NovelViewMode } from "../novel.models";
import { NovelDialogsService } from "../novel.dialogs.service";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { displayName, formatCount, hasCustomName } from "../novel.rules";
import { Cover, coverBackground } from "@components/cover";
import { Icon } from "@components/icon";
import { NovelProgressFrac } from "./progress-frac.component";

const INTERACTIVE_SELECTOR = "button";
const FIELD_SELECTOR = "input,textarea,select";

function isInside(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

@Component({
  selector: "app-novel-list",
  standalone: true,
  imports: [Datatable, DatatableCell, Icon, I18nPipe, Cover, NovelProgressFrac],
  templateUrl: "./list.component.html",
})
export class NovelList {
  private readonly i18n = inject(I18nService);
  private readonly tabs = inject(TabsService);
  private readonly reader = inject(NovelReaderService);
  private readonly dialogs = inject(NovelDialogsService);

  readonly novels = inject(NovelService);

  readonly tableRowClass = (row: object): Record<string, boolean> => ({
    "is-selected": this.novels.selectedId() === this.novelOf(row).id,
  });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: "title", label: this.i18n.translate("novel.list.col.novel"), ellipsis: true },
      { key: "source", label: this.i18n.translate("novel.list.col.source"), width: "64px" },
      { key: "chapters", label: this.i18n.translate("novel.list.col.chapters"), align: "right", width: "80px" },
      { key: "words", label: this.i18n.translate("novel.list.col.words"), align: "right", width: "88px" },
      { key: "progress", label: this.i18n.translate("novel.list.col.progress"), width: "120px" },
    ];
  }

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

  imageOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? "";
  }

  hasImage(novel: NovelSummary): boolean {
    return this.imageOf(novel) !== "";
  }

  backgroundOf(novel: NovelSummary): string {
    return coverBackground(this.imageOf(novel));
  }

  isSelected(id: number): boolean {
    return this.novels.selectedId() === id;
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

  onSelect(id: number, event: Event): void {
    const second = event instanceof MouseEvent && event.detail >= 2;
    this.novels.select(!second && this.novels.selectedId() === id ? null : id);
  }

  novelOf(row: object): NovelSummary {
    return row as NovelSummary;
  }

  onTableDoubleClick(event: DatatableRowEvent): void {
    this.onDoubleClick(event.event as MouseEvent, this.novelOf(event.row));
  }

  onTableEnter(event: DatatableRowEvent): void {
    this.onEnter(event.event, this.novelOf(event.row));
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
    const id = this.novels.selectedId();
    if (this.isModalOpen() || id === null) {
      return;
    }
    this.dialogs.openDelete([id]);
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
