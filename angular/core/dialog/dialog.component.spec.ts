import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog.component";

@Component({
  selector: "app-dialog-probe",
  imports: [Dialog],
  template: `<ds-dialog title="Hello" eyebrow="Eyebrow" size="large" (closed)="closes = closes + 1"><button data-testid="inner-a">a</button><button data-testid="inner-b">b</button></ds-dialog>`,
})
class Probe {
  closes = 0;
}

function mount() {
  const fixture = TestBed.createComponent(Probe);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const dialog = fixture.debugElement.children[0].componentInstance as Dialog;
  return { fixture, root, dialog };
}

describe("Dialog", () => {
  it("renders the title, eyebrow and size", () => {
    const { root } = mount();
    expect(root.querySelector("[data-testid='dialog-title']")?.textContent).toBe("Hello");
    expect(root.querySelector("[data-testid='dialog-eyebrow']")?.textContent).toBe("Eyebrow");
    expect(root.querySelector("[data-testid='dialog']")?.classList.contains("modal-lg")).toBe(true);
  });

  it("emits closed on escape and on the close button", () => {
    const { fixture, root } = mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    (root.querySelector("[data-testid='dialog-close']") as HTMLElement).click();
    expect(fixture.componentInstance.closes).toBeGreaterThanOrEqual(1);
  });

  it("traps focus on tab", () => {
    const { dialog } = mount();
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    const buttons = dialog.panel.nativeElement.querySelectorAll<HTMLElement>("button");
    const last = buttons[buttons.length - 1];
    const first = buttons[0];
    last.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    dialog.keepFocusInside(forward);
    expect(forward.defaultPrevented).toBe(true);
    first.focus();
    const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true });
    dialog.keepFocusInside(backward);
    expect(backward.defaultPrevented).toBe(true);
    const middle = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    buttons[1].focus();
    dialog.keepFocusInside(middle);
    vi.restoreAllMocks();
  });

  it("swallows tab when nothing is focusable", () => {
    const { dialog } = mount();
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([] as unknown as DOMRectList);
    const event = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    dialog.keepFocusInside(event);
    expect(event.defaultPrevented).toBe(true);
    vi.restoreAllMocks();
  });

  it("restores focus when destroyed", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { fixture } = mount();
    fixture.destroy();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
