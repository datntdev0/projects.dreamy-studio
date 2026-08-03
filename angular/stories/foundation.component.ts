import { Component, ElementRef, OnDestroy, OnInit, inject, signal } from "@angular/core";

@Component({
  selector: "app-foundation",
  templateUrl: "./foundation.component.html",
})
export class FoundationComponent implements OnInit, OnDestroy {
  readonly theme = signal<"dark" | "light">("dark");
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private observer?: MutationObserver;

  ngOnInit(): void {
    const root = document.documentElement;
    this.syncTheme();
    this.observer = new MutationObserver(() => this.syncTheme());
    this.observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  toggleTheme(): void {
    const next = this.theme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ds.theme", JSON.stringify(next));
  }

  scrollToSection(sectionId: string): void {
    const section = this.host.querySelector<HTMLElement>(`#${sectionId}`);
    if (!section) return;

    const top = section.getBoundingClientRect().top - this.host.getBoundingClientRect().top + this.host.scrollTop;
    this.host.scrollTo({ top, behavior: "smooth" });
  }

  private syncTheme(): void {
    this.theme.set(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }
}
