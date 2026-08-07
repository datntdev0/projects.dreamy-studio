import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class NovelDialogsService {
  readonly createOpen = signal(false);
  readonly importOpen = signal(false);
  readonly deleteIds = signal<number[]>([]);

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
}
