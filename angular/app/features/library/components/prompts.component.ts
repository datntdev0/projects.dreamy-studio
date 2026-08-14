import { Component, HostListener, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { DesktopDragDropEvent, DesktopIpcService, DesktopUnlisten } from "../../../core/desktop/desktop-ipc.service";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
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

@Component({ selector: "app-library-prompts", standalone: true, imports: [Icon, I18nPipe, LibraryPromptMedia], templateUrl: "./prompts.component.html", host: { "data-testid": "library-prompts" } })
export class LibraryPrompts implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly prompts = inject(LibraryPromptService);
  readonly library = inject(LibraryService);
  readonly dialogs = inject(LibraryDialogsService);
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
  unfiledKey(): I18nKey { return "library.explorer.filters.unfiled"; }

  @HostListener("document:keydown", ["$event"])
  onDelete(event: KeyboardEvent): void { const id = this.prompts.selectedId(); if (event.key !== "Delete" || isField(event.target) || id === null || this.dialogs.uploadOpen() || this.dialogOpen()) return; this.dialogs.openDeletePrompts([id]); }

  private async listenForDrops(): Promise<void> { this.unlisten = await this.ipc.onDragDrop(this.handleDrop.bind(this)); }
  private handleDrop(event: DesktopDragDropEvent): void { if (this.dialogs.uploadOpen()) { this.dragging.set(false); return; } if (event.type === "enter" || event.type === "over") { this.dragging.set(true); return; } if (event.type === "leave") { this.dragging.set(false); return; } if (event.type === "drop") { this.dragging.set(false); this.dialogs.openUpload(event.paths, "prompt"); } }
  private dialogOpen(): boolean { return this.dialogs.previewPromptId() !== null || this.dialogs.deletePromptIds().length > 0 || document.querySelector(".modal") !== null; }
}