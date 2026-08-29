import { Component } from "@angular/core";
import { CoreModule } from "@core/core.module";

@Component({ selector: "app-library-prompts-panel", standalone: true, imports: [CoreModule], templateUrl: "./prompts.panel.html", host: { "data-testid": "library-prompts-panel" } })
export class LibraryPromptsPanel {}
