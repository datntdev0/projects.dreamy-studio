import { Component, computed, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { TabsService } from "../../../../layout/tabs.service";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryCollection } from "../library.models";
import { formatBytes } from "../library.rules";
import { LibraryService } from "../library.service";
import { PROMPT_EXTENSIONS, PROMPT_MAX_BYTES } from "../library.prompts.models";
import { LibraryPromptService } from "../library.prompts.service";
@Component({ selector: "app-library-prompts-panel", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./prompts.panel.html", host: { "data-testid": "library-prompts-panel" } })
export class LibraryPromptsPanel {
  readonly library = inject(LibraryService); readonly prompts = inject(LibraryPromptService); private readonly dialogs = inject(LibraryDialogsService); private readonly tabs = inject(TabsService); readonly totalSize = computed(() => formatBytes(this.prompts.items().reduce((total, item) => total + item.size, 0))); readonly formats = PROMPT_EXTENSIONS.map(extension => `.${extension}`); readonly limit = formatBytes(PROMPT_MAX_BYTES); readonly collections = computed(() => this.library.collections().filter(this.hasPrompts));
  openUpload(): void { this.dialogs.openUpload([], "prompt"); } openWrite(): void { this.dialogs.openUpload([], "prompt", null, "write"); } toggleTag(tag: string): void { this.library.toggleFilterTag(tag); } openCollection(id: number, name: string): void { this.tabs.openCollection(id, name); }
  private hasPrompts(collection: LibraryCollection): boolean { return collection.counts.prompt > 0; }
}
