import { Injectable, signal } from "@angular/core";

export interface TagConfirmation { kind: "merge" | "delete"; tag: string; target: string; }
@Injectable({ providedIn: "root" })
export class LibraryDialogsService {
  readonly createCollectionOpen = signal(false);
  readonly deleteCollectionId = signal<number | null>(null);
  readonly tagConfirmation = signal<TagConfirmation | null>(null);
  openCreateCollection(): void { this.createCollectionOpen.set(true); }
  closeCreateCollection(): void { this.createCollectionOpen.set(false); }
  openDeleteCollection(id: number): void { this.deleteCollectionId.set(id); }
  closeDeleteCollection(): void { this.deleteCollectionId.set(null); }
  openTagConfirmation(value: TagConfirmation): void { this.tagConfirmation.set(value); }
  closeTagConfirmation(): void { this.tagConfirmation.set(null); }
}
