import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class NovelDialogsService {
  readonly createOpen = signal(false);
  readonly importOpen = signal(false);
  readonly addChapterNovelId = signal<number | null>(null);

  openCreate(): void {
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  openImport(): void {
    this.importOpen.set(true);
  }

  closeImport(): void {
    this.importOpen.set(false);
  }

  openAddChapter(novelId: number): void {
    this.addChapterNovelId.set(novelId);
  }

  closeAddChapter(): void {
    this.addChapterNovelId.set(null);
  }
}
