import { ChangeDetectorRef, Component, Directive, ElementRef, EventEmitter, HostBinding, HostListener, Input, OnChanges, Output, SimpleChanges, TemplateRef, ViewChild, contentChildren, inject, signal } from "@angular/core";
import { NgClass, NgTemplateOutlet } from "@angular/common";
import { FormOption } from "./form";
import { Icon } from "./icon";

export type DatatableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
  ellipsis?: boolean;
  editable?: boolean;
  editor?: "text" | "select";
  options?: FormOption[];
};

export type DatatableRow = object;

export type DatatableVariant = "card" | "fill";

export type DatatableRowEvent = { row: DatatableRow; event: Event };

export type DatatableCellEdit = { row: DatatableRow; key: string; value: string; previousValue: unknown };

export type DatatableAction = {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  handler: (row: DatatableRow) => void;
};

export type DatatableActions = DatatableAction[] | ((row: DatatableRow) => DatatableAction[]);

const MENU_GAP = 4;

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
  imports: [NgClass, NgTemplateOutlet, Icon],
  templateUrl: "./datatable.html",
})
export class Datatable implements OnChanges {
  @Input() columns: DatatableColumn[] = [];
  @Input() rows: DatatableRow[] = [];
  @Input() trackKey: string | null = null;
  @Input() selectedIndex = -1;
  @Input() emptyMessage = "No data";
  @Input() rowClass: ((row: DatatableRow) => Record<string, boolean>) | null = null;
  @Input() rowTestId = "datatable-row";
  @Input() minWidth = "";
  @Input() variant: DatatableVariant = "card";
  @Input() actions: DatatableActions | null = null;
  @Input() actionsLabel = "Actions";
  @Input() canEdit: ((row: DatatableRow, column: DatatableColumn) => boolean) | null = null;
  @Output() rowSelected = new EventEmitter<number>();
  @Output() rowClick = new EventEmitter<DatatableRowEvent>();
  @Output() rowDblClick = new EventEmitter<DatatableRowEvent>();
  @Output() rowEnter = new EventEmitter<DatatableRowEvent>();
  @Output() rowPointerDown = new EventEmitter<DatatableRowEvent>();
  @Output() cellEdit = new EventEmitter<DatatableCellEdit>();

  @ViewChild("header") private header?: ElementRef<HTMLElement>;
  @ViewChild("menu", { static: true }) private menu!: ElementRef<HTMLElement>;

  private readonly changes = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private editDraft = "";
  private menuTrigger: HTMLElement | null = null;

  readonly menuRow = signal<DatatableRow | null>(null);
  readonly menuActions = signal<DatatableAction[]>([]);
  readonly editing = signal<{ row: DatatableRow; key: string } | null>(null);

  private readonly cellTemplates = contentChildren(DatatableCell);
  private readonly emptyTemplates = contentChildren(DatatableEmpty);

  @HostBinding("class.is-fill")
  get isFill(): boolean {
    return this.variant === "fill";
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["rows"] || changes["actions"]) {
      this.closeMenu();
    }
    const edit = this.editing();
    if (changes["rows"] && edit && !this.rows.includes(edit.row)) {
      this.finishEdit(false, null);
    }
  }

  get hasActions(): boolean {
    return this.actions !== null;
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

  displayValue(row: DatatableRow, column: DatatableColumn): unknown {
    const value = this.cellValue(row, column.key);
    return column.options?.find((option) => option.value === value)?.label ?? value;
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

  isEditable(row: DatatableRow, column: DatatableColumn): boolean {
    return !!column.editable && (this.canEdit?.(row, column) ?? true);
  }

  isEditing(row: DatatableRow, key: string): boolean {
    const edit = this.editing();
    return edit?.row === row && edit.key === key;
  }

  onCellDblClick(row: DatatableRow, column: DatatableColumn, event: MouseEvent): void {
    if (!this.isEditable(row, column)) {
      return;
    }
    event.stopPropagation();
    this.startEdit(row, column.key);
  }

  onRowEdit(row: DatatableRow, event: Event): void {
    const column = this.columns.find((item) => this.isEditable(row, item));
    if (!column || event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    this.startEdit(row, column.key);
  }

  onEditInput(event: Event): void {
    this.editDraft = (event.target as HTMLInputElement).value;
  }

  onEditSelect(event: Event): void {
    this.editDraft = (event.target as HTMLSelectElement).value;
    this.finishEdit(true, event.target as HTMLElement);
  }

  onEditKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      this.finishEdit(event.key === "Enter", event.currentTarget as HTMLElement);
    }
  }

  onEditBlur(): void {
    this.finishEdit(true, null);
  }

  stopEditEvent(event: Event): void {
    event.stopPropagation();
  }

  actionsFor(row: DatatableRow): DatatableAction[] {
    if (!this.actions) {
      return [];
    }
    return typeof this.actions === "function" ? this.actions(row) : this.actions;
  }

  toggleMenu(row: DatatableRow, event: Event): void {
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLElement;
    const wasOpen = this.menuTrigger === trigger;
    this.closeMenu();
    if (wasOpen) {
      return;
    }
    this.menuTrigger = trigger;
    this.menuRow.set(row);
    this.menuActions.set(this.actionsFor(row));
    this.changes.detectChanges();
    this.placeMenu(trigger);
  }

  stopRowEvent(event: Event): void {
    event.stopPropagation();
  }

  runAction(action: DatatableAction): void {
    const row = this.menuRow();
    const trigger = this.menuTrigger;
    this.closeMenu();
    if (!row || action.disabled) {
      return;
    }
    trigger?.focus();
    action.handler(row);
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      this.closeMenu();
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const items = Array.from(this.menu.nativeElement.querySelectorAll<HTMLElement>("button:not([disabled])"));
    const current = items.indexOf(document.activeElement as HTMLElement);
    items[(current + step + items.length) % items.length]?.focus();
  }

  @HostListener("document:keydown.escape")
  closeMenuOnEscape(): void {
    const trigger = this.menuTrigger;
    this.closeMenu();
    trigger?.focus();
  }

  @HostListener("document:click")
  @HostListener("window:resize")
  closeMenu(): void {
    if (!this.menuTrigger) {
      return;
    }
    this.menuTrigger = null;
    this.menuRow.set(null);
    this.menuActions.set([]);
    this.menu.nativeElement.hidePopover();
  }

  private placeMenu(trigger: HTMLElement): void {
    const menu = this.menu.nativeElement;
    menu.showPopover();
    const anchor = trigger.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    const fitsBelow = anchor.bottom + MENU_GAP + size.height <= window.innerHeight;
    const fitsAbove = anchor.top - MENU_GAP - size.height >= 0;
    const top = fitsBelow || !fitsAbove ? anchor.bottom + MENU_GAP : anchor.top - MENU_GAP - size.height;
    const left = Math.max(MENU_GAP, Math.min(anchor.right - size.width, window.innerWidth - size.width - MENU_GAP));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.querySelector<HTMLElement>("button:not([disabled])")?.focus();
  }

  private startEdit(row: DatatableRow, key: string): void {
    this.finishEdit(true, null);
    this.closeMenu();
    this.editDraft = String(this.cellValue(row, key) ?? "");
    this.editing.set({ row, key });
    this.changes.detectChanges();
    const input = this.host.nativeElement.querySelector<HTMLInputElement | HTMLSelectElement>('[data-testid="datatable-cell-input"]');
    input?.focus();
    if (input instanceof HTMLInputElement) {
      input.select();
    } else {
      input?.showPicker();
    }
  }

  private finishEdit(commit: boolean, input: HTMLElement | null): void {
    const edit = this.editing();
    if (!edit) {
      return;
    }
    this.editing.set(null);
    const previousValue = this.cellValue(edit.row, edit.key);
    if (commit && this.editDraft !== String(previousValue ?? "")) {
      this.cellEdit.emit({ row: edit.row, key: edit.key, value: this.editDraft, previousValue });
    }
    input?.closest("tr")?.focus();
  }
}
