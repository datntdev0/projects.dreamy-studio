import { Component, Input } from "@angular/core";

let tooltipId = 0;

@Component({
  selector: "ds-tooltip",
  standalone: true,
  templateUrl: "./tooltip.html",
})
export class Tooltip {
  @Input() text = "";
  @Input() position: "top" | "bottom" | "right" = "bottom";
  readonly id = `ds-tooltip-${++tooltipId}`;
}
