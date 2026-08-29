import { Component, effect, inject, input, untracked } from "@angular/core";
import { NovelReaderService } from "../novel.reader.service";
import { NovelChapters } from "./chapters.component";
import { NovelReader } from "./reader.component";

@Component({
  selector: "app-novel-view",
  standalone: true,
  imports: [NovelChapters, NovelReader],
  templateUrl: "./novel-view.component.html",
  host: { "data-testid": "novel-view" },
})
export class NovelView {
  readonly reader = inject(NovelReaderService);
  readonly novelId = input.required<number>();

  constructor() {
    effect(this.syncNovel.bind(this));
  }

  private syncNovel(): void {
    const id = this.novelId();
    untracked(this.ensureOpen.bind(this, id));
  }

  private ensureOpen(id: number): void {
    if (this.reader.novelId() === id) {
      return;
    }
    if (this.reader.screenOf(id) === "reading") {
      void this.reader.openReader(id);
      return;
    }
    void this.reader.openNovel(id);
  }
}
