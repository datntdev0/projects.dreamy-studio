import { Component, ViewChild, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { allById, byId } from "@testing/dom";
import { Datatable, DatatableAction, DatatableCell, DatatableColumn, DatatableEmpty } from "./datatable";

@Component({
  selector: "app-table-host",
  imports: [Datatable, DatatableCell, DatatableEmpty],
  template: `<ds-datatable #table [columns]="columns" [rows]="rows()" trackKey="id" [selectedIndex]="selected" [actions]="actions()" [variant]="variant()" [canEdit]="canEdit()" [rowClass]="rowClass" (rowSelected)="events.push('select')" (rowClick)="events.push('click')" (rowDblClick)="events.push('dbl')" (rowEnter)="events.push('enter')" (cellEdit)="edits.push($event.value)">
    <ng-template dsCell="name" let-row><b data-testid="custom-cell">{{ row.name }}</b></ng-template>
    <ng-template dsEmpty><i data-testid="custom-empty">nothing</i></ng-template>
  </ds-datatable>`,
})
class Host {
  @ViewChild("table", { static: true }) table!: Datatable;
  columns: DatatableColumn[] = [
    { key: "name", label: "Name", editable: true, editor: "text" },
    { key: "kind", label: "Kind", editable: true, editor: "select", options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }], align: "right" },
    { key: "size", label: "Size", align: "center", ellipsis: true },
  ];
  rows = signal<object[]>([{ id: 1, name: "one", kind: "a", size: 1 }, { id: 2, name: "two", kind: "b", size: 2 }]);
  selected = 0;
  variant = signal<"card" | "fill">("card");
  events: string[] = [];
  edits: string[] = [];
  handler = vi.fn();
  actions = signal<DatatableAction[] | ((row: object) => DatatableAction[]) | null>([{ key: "open", label: "Open", icon: "x", handler: this.handler }, { key: "del", label: "Delete", danger: true, handler: this.handler }, { key: "off", label: "Off", disabled: true, handler: this.handler }]);
  canEdit = signal<((row: object, column: DatatableColumn) => boolean) | null>(null);
  rowClass: ((row: object) => Record<string, boolean>) | null = (row) => ({ "is-selected": (row as { id: number }).id === 2 });
}

function mount() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, host: fixture.componentInstance };
}

function refresh(fixture: ComponentFixture<Host>): void {
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges();
}

function key(target: Element, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("Datatable", () => {
  it("renders rows with display values, custom cells and selection", () => {
    const { root } = mount();
    expect(allById(root, "datatable-row")).toHaveLength(2);
    expect(allById(root, "custom-cell")).toHaveLength(2);
    expect(root.textContent).toContain("Alpha");
    expect(allById(root, "datatable-row")[0].getAttribute("aria-selected")).toBe("true");
    expect(allById(root, "datatable-row")[1].classList.contains("is-selected")).toBe(true);
  });

  it("renders the empty state and the fill variant", () => {
    const { fixture, root, host } = mount();
    host.rows.set([]);
    host.variant.set("fill");
    refresh(fixture);
    expect(byId(root, "custom-empty")).not.toBeNull();
    expect(root.querySelector("ds-datatable")?.classList.contains("is-fill")).toBe(true);
    expect(host.table.isFill).toBe(true);
  });

  it("emits row events", () => {
    const { fixture, root, host } = mount();
    const row = allById(root, "datatable-row")[1];
    row.click();
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    key(row, "Enter");
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    row.dispatchEvent(space);
    fixture.detectChanges();
    expect(host.events).toEqual(expect.arrayContaining(["select", "click", "dbl", "enter"]));
    host.table.syncHeaderScroll({ target: { scrollLeft: 5 } } as unknown as Event);
  });

  it("edits text cells and commits on enter, cancels on escape", () => {
    const { fixture, root, host } = mount();
    const cell = root.querySelectorAll("tbody tr")[0].querySelectorAll("td")[0];
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    fixture.detectChanges();
    const input = byId(root, "datatable-cell-input") as HTMLInputElement;
    input.value = "changed";
    input.dispatchEvent(new Event("input"));
    key(input, "Enter");
    fixture.detectChanges();
    expect(host.edits).toEqual(["changed"]);
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    fixture.detectChanges();
    const again = byId(root, "datatable-cell-input") as HTMLInputElement;
    again.value = "nope";
    again.dispatchEvent(new Event("input"));
    key(again, "Escape");
    fixture.detectChanges();
    expect(host.edits).toEqual(["changed"]);
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    fixture.detectChanges();
    (byId(root, "datatable-cell-input") as HTMLInputElement).dispatchEvent(new Event("blur"));
    fixture.detectChanges();
    expect(byId(root, "datatable-cell-input")).toBeNull();
  });

  it("edits select cells and respects canEdit", () => {
    const { fixture, root, host } = mount();
    const cell = root.querySelectorAll("tbody tr")[1].querySelectorAll("td")[1];
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    fixture.detectChanges();
    const select = byId(root, "datatable-cell-input") as HTMLSelectElement;
    select.dispatchEvent(new Event("click"));
    select.value = "a";
    select.dispatchEvent(new Event("change"));
    fixture.detectChanges();
    expect(host.edits).toEqual(["a"]);
    host.canEdit.set(() => false);
    refresh(fixture);
    expect(host.table.isEditable(host.rows()[0], host.columns[0])).toBe(false);
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(byId(root, "datatable-cell-input")).toBeNull();
    expect(host.table.isEditable(host.rows()[0], host.columns[2])).toBe(false);
  });

  it("starts editing with F2 on the row itself", () => {
    const { fixture, root } = mount();
    const row = allById(root, "datatable-row")[0];
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(byId(root, "datatable-cell-input")).not.toBeNull();
    const inner = root.querySelector("tbody td") as HTMLElement;
    inner.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
  });

  it("opens the action menu, runs actions and closes it", () => {
    const { fixture, root, host } = mount();
    const trigger = allById(root, "datatable-row-menu")[0];
    trigger.click();
    fixture.detectChanges();
    const items = allById(root, "datatable-menu-item");
    expect(items).toHaveLength(3);
    const menu = byId(root, "datatable-menu") as HTMLElement;
    key(menu, "ArrowDown");
    key(menu, "ArrowUp");
    key(menu, "x");
    items[0].click();
    expect(host.handler).toHaveBeenCalledTimes(1);
    trigger.click();
    fixture.detectChanges();
    trigger.click();
    fixture.detectChanges();
    expect(allById(root, "datatable-menu-item")).toHaveLength(0);
    trigger.click();
    fixture.detectChanges();
    allById(root, "datatable-menu-item")[2].click();
    expect(host.handler).toHaveBeenCalledTimes(1);
    trigger.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    trigger.click();
    fixture.detectChanges();
    key(byId(root, "datatable-menu") as HTMLElement, "Tab");
    trigger.click();
    fixture.detectChanges();
    window.dispatchEvent(new Event("resize"));
    host.table.runAction({ key: "x", label: "X", handler: host.handler });
  });

  it("supports action factories and hides the menu without actions", () => {
    const { fixture, root, host } = mount();
    host.actions.set((row) => ((row as { id: number }).id === 1 ? [{ key: "a", label: "A", handler: host.handler }] : []));
    refresh(fixture);
    expect(allById(root, "datatable-row-menu")).toHaveLength(1);
    host.actions.set(null);
    refresh(fixture);
    expect(host.table.hasActions).toBe(false);
    expect(host.table.actionsFor({})).toEqual([]);
    expect(host.table.trackRow(3, {})).toBe(3);
  });
});
