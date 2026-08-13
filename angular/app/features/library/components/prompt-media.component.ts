import { Component, input } from "@angular/core";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { LibraryPrompt } from "../library.prompts.models";
import { promptExcerpt } from "../library.prompts.rules";

@Component({ selector: "app-library-prompt-media", standalone: true, imports: [I18nPipe], templateUrl: "./prompt-media.component.html", host: { "data-testid": "library-prompt-media" } })
export class LibraryPromptMedia {
  readonly prompt = input.required<LibraryPrompt>();
  excerpt(): string { return promptExcerpt(this.prompt().text); }
  kindKey(): I18nKey { return `library.prompt.kind.${this.prompt().kind}` as I18nKey; }
}
