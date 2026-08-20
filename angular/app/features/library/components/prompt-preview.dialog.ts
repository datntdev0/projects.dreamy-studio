import { Component, HostListener, computed, inject } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { AssetRef, AssetRights } from "../library.models";
import { formatBytes } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibraryPrompt } from "../library.prompts.models";
import { promptCode, promptMeta, promptSegments } from "../library.prompts.rules";
import { LibraryPromptService } from "../library.prompts.service";
const RIGHTS: Record<AssetRights, LanguageKey> = { own: "library.rights.own", licensed: "library.rights.licensed", free: "library.rights.free", other: "library.rights.other" };
@Component({ selector: "app-library-prompt-preview-dialog", standalone: true, imports: [Button, Icon, CoreModule], templateUrl: "./prompt-preview.dialog.html", host: { "data-testid": "library-prompt-preview-dialog" } })
export class LibraryPromptPreviewDialog {
  private readonly dialogs = inject(LibraryDialogsService); readonly prompts = inject(LibraryPromptService); readonly library = inject(LibraryService); private readonly languageService = inject(LanguageService); private readonly toasts = inject(ToastService);
  readonly prompt = computed(() => this.prompts.items().find(item => item.id === this.dialogs.previewPromptId()) ?? null);
  readonly open = computed(() => this.prompt() !== null);
  readonly sequence = computed(() => this.dialogs.previewSequence() ?? this.prompts.visible().map(item => ({ kind: "prompt" as const, id: item.id })));
  readonly position = computed(() => { const item = this.prompt(); const sequence = this.sequence(); return { index: item ? sequence.findIndex(ref => ref.kind === "prompt" && ref.id === item.id) : -1, total: sequence.length }; });
  code(item: LibraryPrompt): string { return promptCode(item.id); } meta(item: LibraryPrompt): number { return promptMeta(item); } size(item: LibraryPrompt): string { return formatBytes(item.size); } rights(item: LibraryPrompt): LanguageKey { return RIGHTS[item.rights]; } kind(item: LibraryPrompt): LanguageKey { return `library.prompt.kind.${item.kind}` as LanguageKey; } segments(item: LibraryPrompt) { return promptSegments(item.text); }
  collection(item: LibraryPrompt): string { return item.collectionId === null ? "" : this.library.collectionById(item.collectionId)?.name ?? "—"; }
  close(): void { this.dialogs.closePreview(); }
  previous(): void { this.move(-1); } next(): void { this.move(1); }
  async copy(item: LibraryPrompt): Promise<void> { if (await this.prompts.copy(item.id)) this.toasts.show(this.languageService.translate("library.prompt.toast.copied")); else this.toasts.show(this.languageService.translate("library.prompt.toast.copyFailed"), "warning"); }
  @HostListener("document:keydown", ["$event"]) onKeydown(event: KeyboardEvent): void { if (!this.open()) return; if (event.key === "Escape") { event.preventDefault(); this.close(); } if (event.key === "ArrowLeft") { event.preventDefault(); this.previous(); } if (event.key === "ArrowRight") { event.preventDefault(); this.next(); } }
  private move(offset: number): void { const ref = this.sequence()[this.position().index + offset]; if (ref) this.dialogs.openPreviewRef(ref as AssetRef, this.sequence()); }
}
