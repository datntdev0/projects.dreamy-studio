import { Injectable, signal } from "@angular/core";

export interface TagConfirmation { kind: "merge" | "delete"; tag: string; target: string; }
@Injectable({ providedIn: "root" })
export class LibraryDialogsService {
  readonly createCollectionOpen = signal(false);
  readonly deleteCollectionId = signal<number | null>(null);
  readonly tagConfirmation = signal<TagConfirmation | null>(null);
  readonly uploadOpen = signal(false);
  readonly uploadPaths = signal<string[]>([]);
  readonly previewImageId = signal<number | null>(null);
  readonly deleteImageIds = signal<number[]>([]);
  openCreateCollection(): void { this.createCollectionOpen.set(true); }
  closeCreateCollection(): void { this.createCollectionOpen.set(false); }
  openDeleteCollection(id: number): void { this.deleteCollectionId.set(id); }
  closeDeleteCollection(): void { this.deleteCollectionId.set(null); }
  openTagConfirmation(value: TagConfirmation): void { this.tagConfirmation.set(value); }
  closeTagConfirmation(): void { this.tagConfirmation.set(null); }
  openUpload(paths: string[] = []): void { this.uploadPaths.set([...paths]); this.uploadOpen.set(true); }
  closeUpload(): void { this.uploadOpen.set(false); this.uploadPaths.set([]); }
  openPreview(id: number): void { this.previewImageId.set(id); }
  closePreview(): void { this.previewImageId.set(null); }
  openDeleteImages(ids: number[]): void { this.deleteImageIds.set([...ids]); }
  closeDeleteImages(): void { this.deleteImageIds.set([]); }
}
