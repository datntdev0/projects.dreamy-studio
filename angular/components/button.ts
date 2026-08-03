import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "ds-button",
  standalone: true,
  templateUrl: "./button.html",
})
export class Button {
  @Input() variant: "primary" | "outline" | "ghost" | "danger" = "outline";
  @Input() size: "medium" | "small" = "medium";
  @Input() type: "button" | "submit" | "reset" = "button";
  @Input() label = "";
  @Input() iconOnly = false;
  @Input() block = false;
  @Input() active = false;
  @Input() disabled = false;
  @Output() pressed = new EventEmitter<void>();
}
