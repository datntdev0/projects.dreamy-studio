import { Component, Input } from "@angular/core";
import { Icon } from "../../../../components/icon";

@Component({
  selector: "app-novel-progress-frac",
  standalone: true,
  imports: [Icon],
  templateUrl: "./progress-frac.component.html",
})
export class NovelProgressFrac {
  @Input() icon = "lang";
  @Input() done = 0;
  @Input() total = 0;
  @Input() label = "";

  get isFull(): boolean {
    return this.total > 0 && this.done >= this.total;
  }

  get isPart(): boolean {
    return !this.isFull && this.done > 0;
  }
}
