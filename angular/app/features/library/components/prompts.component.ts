import { Component, HostListener, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from "@components/datatable";
import { Icon } from "@components/icon";
import { DesktopDragDropEvent, DesktopIpcService, DesktopUnlisten } from "@app/core/desktop/desktop-ipc.service";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryConfirmService } from "../library.confirm.service";
import { AssetRef } from "../library.models";
import { formatBytes } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibraryPrompt, PromptSort } from "../library.prompts.models";
import { promptMeta } from "../library.prompts.rules";
import { LibraryPromptService } from "../library.prompts.service";
import { LibraryPromptMedia } from "./prompt-media.component";

const FIELD_SELECTOR = "input,textarea,select";

function isField(target: EventTarget | null): boolean { return target instanceof Element && target.closest(FIELD_SELECTOR) !== null; }
function toRef(prompt: LibraryPrompt): AssetRef { return { kind: "prompt", id: prompt.id }; }

@Component({ selector: "app-library-prompts", standalone: true, imports: [Datatable, DatatableCell, Icon, CoreModule, LibraryPromptMedia], templateUrl: "./prompts.component.html", host: { "data-testid": "library-prompts" } })
export class LibraryPrompts implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly prompts = inject(LibraryPromptService);
  readonly library = inject(LibraryService);
  private readonly languageService = inject(LanguageService);
  readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  readonly dragging = signal(false);
  private unlisten: DesktopUnlisten | null = null;

  ngOnInit(): void { void this.prompts.ensureLoaded(); void this.listenForDrops(); }
  ngOnDestroy(): void { this.unlisten?.(); }
  onQuery(event: Event): void { this.prompts.query.set((event.target as HTMLInputElement).value); }
  onSort(event: Event): void { this.prompts.sort.set((event.target as HTMLSelectElement).value as PromptSort); }
  setView(value: "grid" | "list"): void { this.library.setViewMode(value); }
  select(prompt: LibraryPrompt): void { this.prompts.select(this.selected(prompt) ? null : prompt.id); }
  open(prompt: LibraryPrompt): void { this.prompts.select(prompt.id); this.dialogs.openPromptPreview(prompt.id, this.prompts.visible().map(toRef)); }
  onKeydown(prompt: LibraryPrompt, event: KeyboardEvent): void { if (event.key === "Enter") { event.preventDefault(); this.open(prompt); } if (event.key === " ") { event.preventDefault(); this.select(prompt); } }
  openUpload(): void { this.dialogs.openUpload([], "prompt"); }
  openWrite(): void { this.dialogs.openUpload([], "prompt", null, "write"); }
  clear(): void { this.prompts.query.set(""); this.library.clearFilters(); }
  removeCollection(): void { this.library.setFilterCollection(null); }
  removeTag(tag: string): void { this.library.toggleFilterTag(tag); }
  size(prompt: LibraryPrompt): string { return formatBytes(prompt.size); }
  length(prompt: LibraryPrompt): number { return promptMeta(prompt); }
  selected(prompt: LibraryPrompt): boolean { return this.prompts.selectedId() === prompt.id; }
  active(): boolean { return this.prompts.query().trim().length > 0 || this.library.filtersActive(); }
  collection(prompt: LibraryPrompt): string { return prompt.collectionId === null ? "—" : this.library.collectionById(prompt.collectionId)?.name ?? "—"; }
  collectionFilterName(): string { const value = this.library.filterCollection(); return typeof value === "number" ? this.library.collectionById(value)?.name ?? "—" : ""; }
  collectionFilterIsKey(): boolean { return this.library.filterCollection() === "none"; }
  unfiledKey(): LanguageKey { return "library.explorer.filters.unfiled"; }

  readonly tableRowClass = (row: object): Record<string, boolean> => ({ "is-selected": this.selected(this.promptOf(row)) });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: "name", label: this.languageService.translate("library.video.column.name") },
      { key: "length", label: this.languageService.translate("library.prompt.column.length"), width: "120px" },
      { key: "size", label: this.languageService.translate("library.prompt.column.size"), align: "right", width: "110px" },
      { key: "collection", label: this.languageService.translate("library.video.column.collection"), width: "180px", ellipsis: true },
    ];
  }

  promptOf(row: object): LibraryPrompt {
    return row as LibraryPrompt;
  }

  onRowSelected(index: number): void {
    const item = this.prompts.visible()[index];
    if (item) {
      this.select(item);
    }
  }

  onRowDblClick(event: DatatableRowEvent): void {
    this.open(this.promptOf(event.row));
  }

  onRowEnter(event: DatatableRowEvent): void {
    this.open(this.promptOf(event.row));
  }

  @HostListener("document:keydown", ["$event"])
  onDelete(event: KeyboardEvent): void { const id = this.prompts.selectedId(); if (event.key !== "Delete" || isField(event.target) || id === null || this.dialogs.uploadOpen() || this.dialogOpen()) return; this.confirms.deletePrompts([id]); }

  private async listenForDrops(): Promise<void> { this.unlisten = await this.ipc.onDragDrop(this.handleDrop.bind(this)); }
  private handleDrop(event: DesktopDragDropEvent): void { if (this.dialogs.uploadOpen()) { this.dragging.set(false); return; } if (event.type === "enter" || event.type === "over") { this.dragging.set(true); return; } if (event.type === "leave") { this.dragging.set(false); return; } if (event.type === "drop") { this.dragging.set(false); this.dialogs.openUpload(event.paths, "prompt"); } }
  private dialogOpen(): boolean { return this.dialogs.previewPromptId() !== null || document.querySelector(".modal") !== null; }
}