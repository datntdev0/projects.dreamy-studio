import { Component, computed, inject, signal } from "@angular/core";
import { Button } from "../../../../components/button";
import { Dialog } from "../../../../components/dialog";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { libraryErrorKey } from "../library.rules";
import { LibraryPrompt } from "../library.prompts.models";
import { LibraryPromptService } from "../library.prompts.service";
function included(ids: Set<number>, prompt: LibraryPrompt): boolean { return ids.has(prompt.id); }
@Component({ selector: "app-library-prompt-delete-dialog", standalone: true, imports: [Button, Dialog, Icon, I18nPipe], templateUrl: "./prompt-delete.dialog.html", host: { "data-testid": "library-prompt-delete-dialog" } })
export class LibraryPromptDeleteDialog {
  private readonly dialogs = inject(LibraryDialogsService); private readonly prompts = inject(LibraryPromptService); private readonly i18n = inject(I18nService); private readonly toasts = inject(ToastService);
  readonly ids = this.dialogs.deletePromptIds; readonly items = computed(() => this.prompts.items().filter(included.bind(null, new Set(this.ids())))); readonly busy = signal(false);
  close(): void { this.dialogs.closeDeletePrompts(); }
  titleKey(): I18nKey { return this.ids().length === 1 ? "library.promptDelete.title.one" : "library.promptDelete.title.other"; }
  confirmKey(): I18nKey { return this.ids().length === 1 ? "library.promptDelete.confirm.one" : "library.promptDelete.confirm.other"; }
  async confirm(): Promise<void> { if (!this.ids().length || this.busy()) return; this.busy.set(true); try { const count = await this.prompts.remove(this.ids()); this.close(); this.toasts.show(this.i18n.translate(count === 1 ? "library.prompt.toast.deleted.one" : "library.prompt.toast.deleted.other", { count })); } catch (cause) { this.toasts.show(this.i18n.translate(libraryErrorKey(cause) as I18nKey), "danger"); } finally { this.busy.set(false); } }
}
