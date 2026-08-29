import { Component, input } from "@angular/core";
import { CoreModule } from "@core/core.module";
import { LanguageKey } from "@core/language/language.models";
import { LibraryPrompt } from "../library.prompts.models";
import { promptExcerpt } from "../library.prompts.rules";

@Component({ selector: "app-library-prompt-media", standalone: true, imports: [CoreModule], templateUrl: "./prompt-media.component.html", host: { "data-testid": "library-prompt-media" } })
export class LibraryPromptMedia {
  readonly prompt = input.required<LibraryPrompt>();
  excerpt(): string { return promptExcerpt(this.prompt().text); }
  kindKey(): LanguageKey { return `library.prompt.kind.${this.prompt().kind}` as LanguageKey; }
}
