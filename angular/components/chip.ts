import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "ds-chip",
  standalone: true,
  templateUrl: "./chip.html",
})
export class Chip {
  @Input() label = "";
  @Input() selected = false;
  @Input() removable = false;
  @Input() disabled = false;
  @Output() selectedChange = new EventEmitter<boolean>();
  @Output() removed = new EventEmitter<void>();

  toggle(): void {
    this.selected = !this.selected;
    this.selectedChange.emit(this.selected);
  }
}
