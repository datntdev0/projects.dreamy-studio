import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "ds-slider",
  standalone: true,
  templateUrl: "./slider.html",
})
export class Slider {
  @Input() label = "Value";
  @Input() min = 0;
  @Input() max = 100;
  @Input() step = 1;
  @Input() value = 0;
  @Output() valueChange = new EventEmitter<number>();

  onInput(event: Event): void {
    this.value = Number((event.target as HTMLInputElement).value);
    this.valueChange.emit(this.value);
  }
}
