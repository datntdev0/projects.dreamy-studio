import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { ASSET_RIGHTS, AssetRights } from "../library.models";
import { formatBytes, libraryErrorKey, normalizeTag } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibraryPrompt, PromptKind } from "../library.prompts.models";
import { charCount, promptCode, promptVariables } from "../library.prompts.rules";
import { LibraryPromptService } from "../library.prompts.service";
const MAX_TAGS = 12; const RIGHTS: Record<AssetRights, I18nKey> = { own: "library.rights.own", licensed: "library.rights.licensed", free: "library.rights.free", other: "library.rights.other" };
@Component({ selector: "app-library-prompt-panel", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./prompt.panel.html", host: { "data-testid": "library-prompt-panel" } })
export class LibraryPromptPanel {
  readonly promptId = input<number | undefined>(); readonly prompts = inject(LibraryPromptService); readonly library = inject(LibraryService); private readonly dialogs = inject(LibraryDialogsService); private readonly i18n = inject(I18nService); private readonly toasts = inject(ToastService); readonly rights = ASSET_RIGHTS; readonly kinds: PromptKind[] = ["image", "video", "voice", "general"]; readonly prompt = computed(() => { const id = this.promptId(); return id === undefined ? this.prompts.selected() : this.prompts.items().find(item => item.id === id) ?? null; });
  code(item: LibraryPrompt): string { return promptCode(item.id); } length(item: LibraryPrompt): number { return charCount(item.text); } variables(item: LibraryPrompt): string[] { return promptVariables(item.text); } size(item: LibraryPrompt): string { return formatBytes(item.size); } rightKey(right: AssetRights): I18nKey { return RIGHTS[right]; } kindKey(kind: PromptKind): I18nKey { return `library.prompt.kind.${kind}` as I18nKey; }
  nameBlur(item: LibraryPrompt, event: Event): void { const field = event.target as HTMLInputElement; const name = field.value.trim(); if (!name || name === item.name) { field.value = item.name; return; } void this.save(item, { name }, true); }
  setKind(item: LibraryPrompt, event: Event): void { void this.save(item, { kind: (event.target as HTMLSelectElement).value as PromptKind }); }
  textChange(item: LibraryPrompt, event: Event): void { const field = event.target as HTMLTextAreaElement; if (!field.value.trim()) { field.value = item.text; this.toasts.show(this.i18n.translate("library.prompt.toast.emptyText"), "warning"); return; } void this.save(item, { text: field.value }); }
  removeTag(item: LibraryPrompt, tag: string): void { void this.save(item, { tags: item.tags.filter(value => value !== tag) }); }
  addTag(item: LibraryPrompt, event: KeyboardEvent): void { if (event.key !== "Enter") return; event.preventDefault(); const field = event.target as HTMLInputElement; const tag = normalizeTag(field.value); if (!tag || item.tags.includes(tag) || item.tags.length >= MAX_TAGS) return; field.value = ""; void this.save(item, { tags: [...item.tags, tag] }); }
  setCollection(item: LibraryPrompt, event: Event): void { const value = (event.target as HTMLSelectElement).value; if (value === "__new") { this.dialogs.openCreateCollection(); return; } void this.save(item, { collectionId: value ? Number(value) : null }); }
  setRights(item: LibraryPrompt, event: Event): void { void this.save(item, { rights: (event.target as HTMLSelectElement).value as AssetRights }); }
  view(item: LibraryPrompt): void { this.dialogs.openPromptPreview(item.id); } remove(item: LibraryPrompt): void { this.dialogs.openDeletePrompts([item.id]); }
  async copy(item: LibraryPrompt): Promise<void> { this.toasts.show(this.i18n.translate(await this.prompts.copy(item.id) ? "library.prompt.toast.copied" : "library.prompt.toast.copyFailed")); }
  private async save(item: LibraryPrompt, patch: { name?: string; kind?: PromptKind; text?: string; tags?: string[]; collectionId?: number | null; rights?: AssetRights }, renamed = false): Promise<void> { try { const updated = await this.prompts.update(item.id, patch); if (renamed && updated.name !== patch.name) this.toasts.show(this.i18n.translate("library.video.toast.renamed", { name: updated.name }), "warning"); } catch (cause) { this.toasts.show(this.i18n.translate(libraryErrorKey(cause) as I18nKey), "danger"); } }
}
