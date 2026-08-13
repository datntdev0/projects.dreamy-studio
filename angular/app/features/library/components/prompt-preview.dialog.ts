import { Component, HostListener, computed, inject } from "@angular/core";
import { Button } from "../../../../components/button";
import { Dialog } from "../../../../components/dialog";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { AssetRef, AssetRights } from "../library.models";
import { formatBytes } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibraryPrompt } from "../library.prompts.models";
import { promptCode, promptMeta, promptSegments } from "../library.prompts.rules";
import { LibraryPromptService } from "../library.prompts.service";
const RIGHTS: Record<AssetRights, I18nKey> = { own: "library.rights.own", licensed: "library.rights.licensed", free: "library.rights.free", other: "library.rights.other" };
@Component({ selector: "app-library-prompt-preview-dialog", standalone: true, imports: [Button, Dialog, Icon, I18nPipe], templateUrl: "./prompt-preview.dialog.html", host: { "data-testid": "library-prompt-preview-dialog" } })
export class LibraryPromptPreviewDialog {
  private readonly dialogs = inject(LibraryDialogsService); readonly prompts = inject(LibraryPromptService); readonly library = inject(LibraryService); private readonly i18n = inject(I18nService); private readonly toasts = inject(ToastService);
  readonly prompt = computed(() => this.prompts.items().find(item => item.id === this.dialogs.previewPromptId()) ?? null);
  readonly open = computed(() => this.prompt() !== null);
  readonly sequence = computed(() => this.dialogs.previewSequence() ?? this.prompts.visible().map(item => ({ kind: "prompt" as const, id: item.id })));
  readonly position = computed(() => { const item = this.prompt(); const sequence = this.sequence(); return { index: item ? sequence.findIndex(ref => ref.kind === "prompt" && ref.id === item.id) : -1, total: sequence.length }; });
  code(item: LibraryPrompt): string { return promptCode(item.id); } meta(item: LibraryPrompt): number { return promptMeta(item); } size(item: LibraryPrompt): string { return formatBytes(item.size); } rights(item: LibraryPrompt): I18nKey { return RIGHTS[item.rights]; } kind(item: LibraryPrompt): I18nKey { return `library.prompt.kind.${item.kind}` as I18nKey; } segments(item: LibraryPrompt) { return promptSegments(item.text); }
  collection(item: LibraryPrompt): string { return item.collectionId === null ? "" : this.library.collectionById(item.collectionId)?.name ?? "—"; }
  close(): void { this.dialogs.closePreview(); }
  previous(): void { this.move(-1); } next(): void { this.move(1); }
  async copy(item: LibraryPrompt): Promise<void> { if (await this.prompts.copy(item.id)) this.toasts.show(this.i18n.translate("library.prompt.toast.copied")); else this.toasts.show(this.i18n.translate("library.prompt.toast.copyFailed"), "warning"); }
  @HostListener("document:keydown", ["$event"]) onKeydown(event: KeyboardEvent): void { if (!this.open()) return; if (event.key === "Escape") { event.preventDefault(); this.close(); } if (event.key === "ArrowLeft") { event.preventDefault(); this.previous(); } if (event.key === "ArrowRight") { event.preventDefault(); this.next(); } }
  private move(offset: number): void { const ref = this.sequence()[this.position().index + offset]; if (ref) this.dialogs.openPreviewRef(ref as AssetRef, this.sequence()); }
}
