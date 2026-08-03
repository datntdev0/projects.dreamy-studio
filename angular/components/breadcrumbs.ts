import { Component, EventEmitter, Input, Output } from "@angular/core";
import { Icon } from "./icon";

export type BreadcrumbItem = { label: string; icon?: string };

@Component({
  selector: "ds-breadcrumbs",
  standalone: true,
  imports: [Icon],
  templateUrl: "./breadcrumbs.html",
})
export class Breadcrumbs {
  @Input() items: BreadcrumbItem[] = [];
  @Output() navigate = new EventEmitter<number>();
}
