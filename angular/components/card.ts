import { Component, Input } from "@angular/core";

@Component({
  selector: "ds-card",
  standalone: true,
  templateUrl: "./card.html",
})
export class Card {
  @Input() selected = false;
  @Input() spacious = false;
}
