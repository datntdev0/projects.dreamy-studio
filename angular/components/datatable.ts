import { Component, EventEmitter, Input, Output } from "@angular/core";

export type DatatableColumn = { key: string; label: string; align?: "left" | "right" };
export type DatatableRow = Record<string, string | number | null>;

@Component({
  selector: "ds-datatable",
  standalone: true,
  templateUrl: "./datatable.html",
})
export class Datatable {
  @Input() columns: DatatableColumn[] = [];
  @Input() rows: DatatableRow[] = [];
  @Input() selectedIndex = -1;
  @Input() emptyMessage = "Không có dữ liệu";
  @Output() rowSelected = new EventEmitter<number>();

  select(index: number): void {
    this.selectedIndex = index;
    this.rowSelected.emit(index);
  }
}
