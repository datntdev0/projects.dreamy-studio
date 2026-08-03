import { Component, Input } from "@angular/core";

@Component({
  selector: "ds-badge",
  standalone: true,
  templateUrl: "./badge.html",
})
export class Badge {
  @Input() tone: "default" | "primary" | "running" | "success" | "warning" | "danger" | "info" = "default";
}
