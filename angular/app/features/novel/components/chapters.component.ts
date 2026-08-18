import { Component, OnDestroy, computed, effect, inject, input, signal } from "@angular/core";
import { I18nService } from "@app/core/i18n/i18n.service";
import { Datatable, DatatableCell, DatatableColumn, DatatableEmpty, DatatableRowEvent } from "@components/datatable";
import { Icon } from "@components/icon";
import { NovelToolKind } from "@layout/layout.models";
import { TabsService } from "@layout/tabs.service";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { ToastService } from "@app/core/toast/toast.service";
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
import { Cover } from "@components/cover";
import { NovelProgressFrac } from "./progress-frac.component";

const DRAG_THRESHOLD = 5;

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
export class NovelChapters implements OnDestroy {
  private readonly novels = inject(NovelService);
  private readonly reader = inject(NovelReaderService);
  private readonly i18n = inject(I18nService);
  private readonly tabs = inject(TabsService);
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
  private pressed: { id: string; y: number } | null = null;
  private suppressClick = false;
  private readonly moveListener = this.onPointerMove.bind(this);
  private readonly releaseListener = this.onPointerRelease.bind(this);

  readonly dragId = signal<string | null>(null);
  readonly dropTarget = signal<DropTarget | null>(null);
  readonly filtered = computed(this.buildFiltered.bind(this));
  readonly tableRowClass = (row: object): Record<string, boolean> => {
    const id = this.chapterOf(row).id;
    const drop = this.dropTarget();
    return {
      "is-current": this.resumeSeq() === this.chapterOf(row).seq,
      "is-reorderable": this.canMove(this.chapterOf(row)),
      "is-dragging": this.dragId() === id,
      "is-drop-before": drop?.id === id && drop.side === "before",
      "is-drop-after": drop?.id === id && drop.side === "after",
    };
  };

  get tableColumns(): DatatableColumn[] {
    return [
      { key: "seq", label: this.i18n.translate("novel.chapters.col.number"), width: "56px" },
      { key: "title", label: this.i18n.translate("novel.chapters.col.title"), ellipsis: true },
      { key: "wordCount", label: this.i18n.translate("novel.chapters.col.words"), align: "right", width: "80px" },
      { key: "translationStatus", label: this.i18n.translate("novel.chapters.col.translation"), align: "center", width: "104px" },
      { key: "analysisStatus", label: this.i18n.translate("novel.chapters.col.knowledge"), align: "center", width: "104px" },
      { key: "actions", label: "", align: "right", width: "48px" },
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

  openTool(kind: NovelToolKind): void {
    const novel = this.novel();
    if (novel) {
      this.tabs.openNovelTool(kind, novel.id, displayName(novel));
    }
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

  remove(row: ChapterRow, event: Event): void {
    event.stopPropagation();
    this.dialogs.openDeleteChapter(this.novelId(), row.id);
  }

  onRowClick(event: DatatableRowEvent): void {
    if (!this.suppressClick) {
      this.open(this.chapterOf(event.row).seq);
    }
  }

  onPointerDown(event: DatatableRowEvent): void {
    const pointer = event.event as PointerEvent;
    const row = this.chapterOf(event.row);
    if (pointer.button !== 0 || !this.canMove(row) || (pointer.target as Element).closest("button")) {
      return;
    }
    this.pressed = { id: row.id, y: pointer.clientY };
    document.addEventListener("pointermove", this.moveListener);
    document.addEventListener("pointerup", this.releaseListener);
    document.addEventListener("pointercancel", this.releaseListener);
  }

  ngOnDestroy(): void {
    this.stopTracking();
  }

  chapterOf(row: object): ChapterRow {
    return row as ChapterRow;
  }

  onTableEnter(event: DatatableRowEvent): void {
    this.open(this.chapterOf(event.row).seq);
  }

  private draggedRow(): ChapterRow | null {
    const id = this.dragId();
    return id === null ? null : this.rowById(id);
  }

  private async moveTo(row: ChapterRow, toSeq: number): Promise<void> {
    try {
      await this.reader.moveChapter(this.novelId(), row.id, toSeq);
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.pressed === null) {
      return;
    }
    if (this.dragId() === null) {
      if (Math.abs(event.clientY - this.pressed.y) < DRAG_THRESHOLD) {
        return;
      }
      this.dragId.set(this.pressed.id);
    }
    this.dropTarget.set(this.targetAt(event.clientX, event.clientY));
  }

  private onPointerRelease(): void {
    const dragged = this.draggedRow();
    const drop = this.dropTarget();
    const moved = dragged !== null && drop !== null;
    this.stopTracking();
    this.clearDrag();
    if (moved) {
      this.suppressClick = true;
      setTimeout(this.allowClick.bind(this), 0);
      this.dropRow(dragged, drop);
    }
  }

  private dropRow(dragged: ChapterRow, drop: DropTarget): void {
    const target = this.rowById(drop.id);
    if (target) {
      const before = drop.side === "after" ? target.seq + 1 : target.seq;
      void this.moveTo(dragged, before > dragged.seq ? before - 1 : before);
    }
  }

  private targetAt(x: number, y: number): DropTarget | null {
    const element = document.elementFromPoint(x, y)?.closest("tr[data-row-key]");
    const target = element ? this.rowById(element.getAttribute("data-row-key") ?? "") : null;
    if (!element || !target || target.id === this.dragId() || !this.canMove(target)) {
      return null;
    }
    const bounds = element.getBoundingClientRect();
    return { id: target.id, side: y > bounds.top + bounds.height / 2 ? "after" : "before" };
  }

  private rowById(id: string): ChapterRow | null {
    for (const row of this.all()) {
      if (row.id === id) {
        return row;
      }
    }
    return null;
  }

  private allowClick(): void {
    this.suppressClick = false;
  }

  private stopTracking(): void {
    this.pressed = null;
    document.removeEventListener("pointermove", this.moveListener);
    document.removeEventListener("pointerup", this.releaseListener);
    document.removeEventListener("pointercancel", this.releaseListener);
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
