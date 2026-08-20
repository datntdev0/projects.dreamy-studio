import { Component, Input } from "@angular/core";
import { DialogItem } from "@app/core/dialog/dialog.models";
import { ProjectSummary } from "../project.models";
import { ProjectThumb } from "./thumb.component";

@Component({
  selector: "app-project-confirm-thumb",
  standalone: true,
  imports: [ProjectThumb],
  template: `<app-project-thumb size="md" [project]="project()" data-testid="project-confirm-thumb-image" />`,
  host: { "data-testid": "project-confirm-thumb" },
})
export class ProjectConfirmThumb {
  @Input() item: DialogItem = { name: "" };

  project(): ProjectSummary {
    return this.item.data as ProjectSummary;
  }
}
