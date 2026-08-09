import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ProjectDialogsService {
  readonly createOpen = signal(false);
  readonly deleteIds = signal<number[]>([]);

  openCreate(): void {
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  openDelete(ids: number[]): void {
    this.deleteIds.set(ids);
  }

  closeDelete(): void {
    this.deleteIds.set([]);
  }
}
