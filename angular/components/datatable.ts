import { Component, Directive, ElementRef, EventEmitter, HostBinding, Input, Output, TemplateRef, ViewChild, contentChildren } from "@angular/core";
import { NgClass, NgTemplateOutlet } from "@angular/common";

export type DatatableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
  ellipsis?: boolean;
};

export type DatatableRow = object;

export type DatatableVariant = "card" | "fill";

export type DatatableRowEvent = { row: DatatableRow; event: Event };

type DatatableCellContext = { $implicit: DatatableRow };

@Directive({ selector: "ng-template[dsCell]", standalone: true })
export class DatatableCell {
  @Input("dsCell") key = "";

  constructor(readonly template: TemplateRef<DatatableCellContext>) {}
}

@Directive({ selector: "ng-template[dsEmpty]", standalone: true })
export class DatatableEmpty {
  constructor(readonly template: TemplateRef<unknown>) {}
}

@Component({
  selector: "ds-datatable",
  standalone: true,
  imports: [NgClass, NgTemplateOutlet],
  templateUrl: "./datatable.html",
})
export class Datatable {
  @Input() columns: DatatableColumn[] = [];
  @Input() rows: DatatableRow[] = [];
  @Input() trackKey: string | null = null;
  @Input() selectedIndex = -1;
  @Input() emptyMessage = "No data";
  @Input() rowClass: ((row: DatatableRow) => Record<string, boolean>) | null = null;
  @Input() rowTestId = "datatable-row";
  @Input() minWidth = "";
  @Input() variant: DatatableVariant = "card";
  @Output() rowSelected = new EventEmitter<number>();
  @Output() rowClick = new EventEmitter<DatatableRowEvent>();
  @Output() rowDblClick = new EventEmitter<DatatableRowEvent>();
  @Output() rowEnter = new EventEmitter<DatatableRowEvent>();
  @Output() rowPointerDown = new EventEmitter<DatatableRowEvent>();

  @ViewChild("header") private header?: ElementRef<HTMLElement>;

  private readonly cellTemplates = contentChildren(DatatableCell);
  private readonly emptyTemplates = contentChildren(DatatableEmpty);

  @HostBinding("class.is-fill")
  get isFill(): boolean {
    return this.variant === "fill";
  }

  cellTemplate(key: string): TemplateRef<DatatableCellContext> | null {
    for (const cell of this.cellTemplates()) {
      if (cell.key === key) {
        return cell.template;
      }
    }
    return null;
  }

  emptyTemplate(): TemplateRef<unknown> | null {
    return this.emptyTemplates()[0]?.template ?? null;
  }

  cellValue(row: DatatableRow, key: string): unknown {
    return Reflect.get(row, key);
  }

  trackRow(index: number, row: DatatableRow): unknown {
    return this.trackKey ? this.cellValue(row, this.trackKey) ?? index : index;
  }

  rowClasses(row: DatatableRow): Record<string, boolean> {
    return this.rowClass?.(row) ?? {};
  }

  onPointerDown(row: DatatableRow, event: PointerEvent): void {
    this.rowPointerDown.emit({ row, event });
  }

  select(index: number): void {
    this.rowSelected.emit(index);
  }

  onRowClick(row: DatatableRow, index: number, event: MouseEvent): void {
    this.select(index);
    this.rowClick.emit({ row, event });
  }

  onRowDblClick(row: DatatableRow, event: MouseEvent): void {
    this.rowDblClick.emit({ row, event });
  }

  onRowEnter(row: DatatableRow, index: number, event: Event): void {
    this.select(index);
    this.rowEnter.emit({ row, event });
  }

  onRowSpace(index: number, event: Event): void {
    this.select(index);
    event.preventDefault();
  }

  syncHeaderScroll(event: Event): void {
    if (this.header) {
      this.header.nativeElement.scrollLeft = (event.target as HTMLElement).scrollLeft;
    }
  }
}
