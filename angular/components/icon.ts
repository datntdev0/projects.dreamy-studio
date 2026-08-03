import { Component, Input } from "@angular/core";

@Component({
  selector: "ds-icon",
  standalone: true,
  templateUrl: "./icon.html",
})
export class Icon {
  @Input() name = "plus";
  @Input() size = 18;
  @Input() label = "";
}
