import { Injectable, signal } from "@angular/core";
import { AnalyzeRequest, KnowledgeAnalyzeRequest, KnowledgeEditRequest, KnowledgeListKind } from "./novel.knowledge.models";

@Injectable({ providedIn: "root" })
export class NovelDialogsService {
  readonly createOpen = signal(false);
  readonly importOpen = signal(false);
  readonly addChapterNovelId = signal<number | null>(null);
  readonly analyze = signal<KnowledgeAnalyzeRequest | null>(null);
  readonly edit = signal<KnowledgeEditRequest | null>(null);

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

  openAnalyze(novelId: number, preset: Partial<AnalyzeRequest> = {}): void {
    this.analyze.set({ novelId, preset });
  }

  closeAnalyze(): void {
    this.analyze.set(null);
  }

  openEdit(novelId: number, ids: string[], issueId: string | null = null): void {
    this.edit.set({ novelId, ids, issueId, add: null });
  }

  openAdd(novelId: number, kind: KnowledgeListKind, ids: string[] = []): void {
    this.edit.set({ novelId, ids, issueId: null, add: kind });
  }

  closeEdit(): void {
    this.edit.set(null);
  }
}
