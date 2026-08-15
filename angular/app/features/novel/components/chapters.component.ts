import { Component, computed, effect, inject, input, signal } from "@angular/core";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nService } from "../../../core/i18n/i18n.service";
import { Datatable, DatatableCell, DatatableColumn, DatatableEmpty, DatatableRowEvent } from "../../../../components/datatable";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { ToastService } from "../../../core/toast/toast.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { ChapterRow } from "../novel.models";
import { NovelSummary } from "../novel.models";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { displayName } from "../novel.rules";
import { filterChapters } from "../novel.rules";
import { formatCount } from "../novel.rules";
import { isChapterLocked } from "../novel.rules";
import { toNovelError } from "../novel.rules";
import { Cover } from "../../../../components/cover";
import { NovelProgressFrac } from "./progress-frac.component";

type DropSide = "before" | "after";

interface DropTarget {
  id: string;
  side: DropSide;
}

@Component({
  selector: "app-novel-chapters",
  standalone: true,
  imports: [Datatable, DatatableCell, DatatableEmpty, Icon, I18nPipe, Cover, NovelProgressFrac],
  templateUrl: "./chapters.component.html",
})
export class NovelChapters {
  private readonly novels = inject(NovelService);
  private readonly reader = inject(NovelReaderService);
  private readonly i18n = inject(I18nService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly toasts = inject(ToastService);

  readonly novelId = input.required<number>();
  readonly query = this.novels.chapterQuery;
  readonly count = formatCount;

  readonly novel = computed(this.findNovel.bind(this));
  readonly all = computed(this.buildAll.bind(this));
  readonly rows = computed(this.buildRows.bind(this));
  readonly resumeSeq = computed(this.buildResumeSeq.bind(this));
  readonly cover = computed(this.buildCover.bind(this));
  readonly dragId = signal<string | null>(null);
  readonly dropTarget = signal<DropTarget | null>(null);
  readonly filtered = computed(this.buildFiltered.bind(this));
  readonly tableRowClass = (row: object): Record<string, boolean> => {
    const id = this.chapterOf(row).id;
    const drop = this.dropTarget();
    return {
      "is-current": this.resumeSeq() === this.chapterOf(row).seq,
      "is-dragging": this.dragId() === id,
      "is-drop-before": drop?.id === id && drop.side === "before",
      "is-drop-after": drop?.id === id && drop.side === "after",
    };
  };
  readonly tableRowDraggable = (row: object): boolean => this.canMove(this.chapterOf(row));

  get tableColumns(): DatatableColumn[] {
    return [
      { key: "seq", label: this.i18n.translate("novel.chapters.col.number"), width: "56px" },
      { key: "title", label: this.i18n.translate("novel.chapters.col.title"), ellipsis: true },
      { key: "wordCount", label: this.i18n.translate("novel.chapters.col.words"), align: "right", width: "80px" },
      { key: "translationStatus", label: this.i18n.translate("novel.chapters.col.translation"), align: "center", width: "104px" },
      { key: "analysisStatus", label: this.i18n.translate("novel.chapters.col.knowledge"), align: "center", width: "104px" },
      { key: "actions", label: "", align: "right", width: "112px" },
    ];
  }

  constructor() {
    effect(this.syncCover.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  numberOf(row: ChapterRow): string {
    return String(row.seq).padStart(2, "0");
  }

  onQuery(event: Event): void {
    this.novels.setChapterQuery((event.target as HTMLInputElement).value);
  }

  read(): void {
    void this.reader.openReader(this.novelId(), this.resumeSeq());
  }

  open(seq: number): void {
    void this.reader.openReader(this.novelId(), seq);
  }

  add(): void {
    this.dialogs.openAddChapter(this.novelId());
  }

  isLocked(row: ChapterRow): boolean {
    return isChapterLocked(row);
  }

  canMove(row: ChapterRow): boolean {
    return !this.filtered() && !isChapterLocked(row);
  }

  upOff(row: ChapterRow): boolean {
    const previous = this.all()[row.seq - 2];
    return !this.canMove(row) || row.seq === 1 || (previous !== undefined && isChapterLocked(previous));
  }

  downOff(row: ChapterRow): boolean {
    return !this.canMove(row) || row.seq === this.all().length;
  }

  tipKey(row: ChapterRow): I18nKey {
    return isChapterLocked(row) ? "novel.chapters.locked" : "novel.chapters.reorderBlocked";
  }

  moveUp(row: ChapterRow, event: Event): void {
    event.stopPropagation();
    void this.moveTo(row, row.seq - 1);
  }

  moveDown(row: ChapterRow, event: Event): void {
    event.stopPropagation();
    void this.moveTo(row, row.seq + 1);
  }

  remove(row: ChapterRow, event: Event): void {
    event.stopPropagation();
    this.dialogs.openDeleteChapter(this.novelId(), row.id);
  }

  onDragStart(event: DatatableRowEvent): void {
    const effect = (event.event as DragEvent).dataTransfer;
    if (effect) {
      effect.effectAllowed = "move";
    }
    this.dragId.set(this.chapterOf(event.row).id);
  }

  onDragOver(event: DatatableRowEvent): void {
    const target = this.chapterOf(event.row);
    if (this.dragId() === null || !this.canMove(target)) {
      return;
    }
    event.event.preventDefault();
    this.dropTarget.set(this.dragId() === target.id ? null : { id: target.id, side: this.sideOf(event.event as DragEvent) });
  }

  onDrop(event: DatatableRowEvent): void {
    const target = this.chapterOf(event.row);
    const dragged = this.draggedRow();
    const side = this.sideOf(event.event as DragEvent);
    this.clearDrag();
    if (!dragged || dragged.id === target.id || !this.canMove(target)) {
      return;
    }
    event.event.preventDefault();
    const before = side === "after" ? target.seq + 1 : target.seq;
    void this.moveTo(dragged, before > dragged.seq ? before - 1 : before);
  }

  onDragEnd(): void {
    this.clearDrag();
  }

  chapterOf(row: object): ChapterRow {
    return row as ChapterRow;
  }

  onTableEnter(event: DatatableRowEvent): void {
    this.open(this.chapterOf(event.row).seq);
  }

  private draggedRow(): ChapterRow | null {
    for (const row of this.all()) {
      if (row.id === this.dragId()) {
        return row;
      }
    }
    return null;
  }

  private async moveTo(row: ChapterRow, toSeq: number): Promise<void> {
    try {
      await this.reader.moveChapter(this.novelId(), row.id, toSeq);
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
    }
  }

  private sideOf(event: DragEvent): DropSide {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
  }

  private clearDrag(): void {
    this.dragId.set(null);
    this.dropTarget.set(null);
  }

  private buildFiltered(): boolean {
    return this.novels.chapterQuery().trim() !== "";
  }

  private findNovel(): NovelSummary | null {
    return this.novels.novelById(this.novelId()) ?? null;
  }

  private buildAll(): ChapterRow[] {
    return this.novels.chaptersOf(this.novelId());
  }

  private buildRows(): ChapterRow[] {
    return filterChapters(this.all(), this.novels.chapterQuery());
  }

  private buildResumeSeq(): number {
    return this.reader.resumeSeq(this.novelId());
  }

  private buildCover(): string {
    const novel = this.novel();
    return novel ? (this.novels.coverUrl(novel) ?? "") : "";
  }

  private syncCover(): void {
    const novel = this.novel();
    if (novel) {
      this.novels.ensureCover(novel);
    }
  }
}
