import { Component } from "@angular/core";
import { LanguagePipe } from "@app/core/language/language.pipe";

@Component({ selector: "app-library-prompts-panel", standalone: true, imports: [LanguagePipe], templateUrl: "./prompts.panel.html", host: { "data-testid": "library-prompts-panel" } })
export class LibraryPromptsPanel {}
