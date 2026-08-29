import { Component, EventEmitter, Input, Output } from "@angular/core";
import { Icon } from "@components/icon";

@Component({
  selector: "ds-toast",
  standalone: true,
  imports: [Icon],
  templateUrl: "./toast.component.html",
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
