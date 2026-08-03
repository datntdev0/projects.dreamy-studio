import { Component, EventEmitter, Input, Output } from "@angular/core";
import { Icon } from "./icon";

@Component({
  selector: "ds-toast",
  standalone: true,
  imports: [Icon],
  templateUrl: "./toast.html",
})
export class Toast {
  @Input() message = "";
  @Input() tone: "success" | "warning" | "danger" | "info" = "success";
  @Input() dismissible = true;
  @Input() visible = true;
  @Output() dismissed = new EventEmitter<void>();

  dismiss(): void {
    this.visible = false;
    this.dismissed.emit();
  }
}
