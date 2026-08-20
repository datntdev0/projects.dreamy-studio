import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let nextDialogId = 0;

function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

@Component({
  selector: "ds-dialog",
  standalone: true,
  imports: [Button, Icon],
  templateUrl: "./dialog.component.html",
})
export class Dialog implements AfterViewInit, OnDestroy {
  @Input() title = "";
  @Input() eyebrow = "";
  @Input() size: "default" | "large" | "xl" = "default";
  @Input() closeLabel = "Close";
  @Output() closed = new EventEmitter<void>();
  @ViewChild("panel", { static: true }) panel!: ElementRef<HTMLElement>;
  @ViewChild("foot", { static: true }) foot!: ElementRef<HTMLElement>;

  readonly titleId = `ds-dialog-title-${nextDialogId++}`;
  private readonly previousFocus = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void {
    if (this.foot.nativeElement.childElementCount > 0) {
      this.foot.nativeElement.setAttribute("role", "contentinfo");
    }
    this.panel.nativeElement.focus();
  }

  ngOnDestroy(): void {
    const target = this.previousFocus;
    if (target && target.isConnected) {
      target.focus();
    }
  }

  @HostListener("document:keydown.escape", ["$event"])
  closeOnEscape(event: Event): void {
    event.preventDefault();
    this.close();
  }

  @HostListener("keydown.tab", ["$event"])
  keepFocusInside(event: Event): void {
    const keyboard = event as KeyboardEvent;
    const items = focusableIn(this.panel.nativeElement);
    if (items.length === 0) {
      keyboard.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (keyboard.shiftKey && (active === first || active === this.panel.nativeElement)) {
      keyboard.preventDefault();
      last.focus();
    } else if (!keyboard.shiftKey && active === last) {
      keyboard.preventDefault();
      first.focus();
    }
  }

  close(): void {
    this.closed.emit();
  }
}
