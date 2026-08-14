import { Component } from "@angular/core";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";

@Component({ selector: "app-library-prompts-panel", standalone: true, imports: [I18nPipe], templateUrl: "./prompts.panel.html", host: { "data-testid": "library-prompts-panel" } })
export class LibraryPromptsPanel {}
