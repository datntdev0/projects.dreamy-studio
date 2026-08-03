import { Component, EventEmitter, Input, Output } from "@angular/core";

export type SegmentOption = { value: string; label: string; disabled?: boolean };

@Component({
  selector: "ds-segments",
  standalone: true,
  templateUrl: "./segments.html",
})
export class Segments {
  @Input() label = "Options";
  @Input() options: SegmentOption[] = [];
  @Input() value = "";
  @Output() valueChange = new EventEmitter<string>();

  select(value: string): void {
    this.value = value;
    this.valueChange.emit(value);
  }
}
