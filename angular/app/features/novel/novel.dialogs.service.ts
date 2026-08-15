import { Injectable, signal } from "@angular/core";

export interface ChapterTarget {
  novelId: number;
  chapterId: string;
}

@Injectable({ providedIn: "root" })
export class NovelDialogsService {
  readonly createOpen = signal(false);
  readonly importOpen = signal(false);
  readonly deleteIds = signal<number[]>([]);
  readonly addChapterNovelId = signal<number | null>(null);
  readonly deleteChapterTarget = signal<ChapterTarget | null>(null);

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

  openDelete(ids: number[]): void {
    this.deleteIds.set(ids);
  }

  closeDelete(): void {
    this.deleteIds.set([]);
  }

  openAddChapter(novelId: number): void {
    this.addChapterNovelId.set(novelId);
  }

  closeAddChapter(): void {
    this.addChapterNovelId.set(null);
  }

  openDeleteChapter(novelId: number, chapterId: string): void {
    this.deleteChapterTarget.set({ novelId, chapterId });
  }

  closeDeleteChapter(): void {
    this.deleteChapterTarget.set(null);
  }
}
