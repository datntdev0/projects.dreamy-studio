import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { Toast } from "./toast.component";
import { ToastHost } from "./toast-host.component";
import { ToastService } from "./toast.service";

describe("Toast", () => {
  it("renders the tone role and dismisses", () => {
    const fixture = TestBed.createComponent(Toast);
    fixture.componentRef.setInput("message", "Hi");
    fixture.componentRef.setInput("tone", "danger");
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("[data-testid='toast']")?.getAttribute("role")).toBe("alert");
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed += 1));
    (root.querySelector("button.close") as HTMLElement).click();
    fixture.detectChanges();
    expect(dismissed).toBe(1);
    expect(root.querySelector("[data-testid='toast']")).toBeNull();
  });

  it("uses the status role for non-danger tones", () => {
    const fixture = TestBed.createComponent(Toast);
    fixture.componentRef.setInput("dismissible", false);
    fixture.detectChanges();
    const toast = (fixture.nativeElement as HTMLElement).querySelector("[data-testid='toast']");
    expect(toast?.getAttribute("role")).toBe("status");
    expect((fixture.nativeElement as HTMLElement).querySelector("button.close")).toBeNull();
  });
});

describe("ToastHost", () => {
  it("renders queued toasts and dismisses by id", () => {
    const toasts = TestBed.inject(ToastService);
    const fixture = TestBed.createComponent(ToastHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("[data-testid='toast-stack']")).toBeNull();
    toasts.show("one");
    fixture.detectChanges();
    expect(root.querySelectorAll("[data-testid='toast-item']")).toHaveLength(1);
    fixture.componentInstance.dismiss(toasts.items()[0].id);
    fixture.detectChanges();
    expect(root.querySelector("[data-testid='toast-stack']")).toBeNull();
  });
});
