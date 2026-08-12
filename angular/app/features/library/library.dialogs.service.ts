import { Injectable, signal } from "@angular/core";
import { AssetRef } from "./library.models";

export interface TagConfirmation { kind: "merge" | "delete"; tag: string; target: string; }
@Injectable({ providedIn: "root" })
export class LibraryDialogsService {
  readonly createCollectionOpen = signal(false);
  readonly deleteCollectionId = signal<number | null>(null);
  readonly tagConfirmation = signal<TagConfirmation | null>(null);
  readonly uploadOpen = signal(false);
  readonly uploadPaths = signal<string[]>([]);
  readonly uploadKind = signal<"image" | "sound" | "video">("image");
  readonly uploadCollectionId = signal<number | null>(null);
  readonly previewImageId = signal<number | null>(null);
  readonly previewSoundId = signal<number | null>(null);
  readonly previewVideoId = signal<number | null>(null);
  readonly previewSequence = signal<AssetRef[] | null>(null);
  readonly deleteImageIds = signal<number[]>([]);
  readonly deleteSoundIds = signal<number[]>([]);
  readonly deleteVideoIds = signal<number[]>([]);
  openCreateCollection(): void { this.createCollectionOpen.set(true); }
  closeCreateCollection(): void { this.createCollectionOpen.set(false); }
  openDeleteCollection(id: number): void { this.deleteCollectionId.set(id); }
  closeDeleteCollection(): void { this.deleteCollectionId.set(null); }
  openTagConfirmation(value: TagConfirmation): void { this.tagConfirmation.set(value); }
  closeTagConfirmation(): void { this.tagConfirmation.set(null); }
  openUpload(paths: string[] = [], kind: "image" | "sound" | "video" = "image", collectionId: number | null = null): void { this.uploadPaths.set([...paths]); this.uploadKind.set(kind); this.uploadCollectionId.set(collectionId); this.uploadOpen.set(true); }
  closeUpload(): void { this.uploadOpen.set(false); this.uploadPaths.set([]); this.uploadKind.set("image"); this.uploadCollectionId.set(null); }
  openPreview(id: number, sequence: AssetRef[] | null = null): void { this.previewImageId.set(id); this.previewSoundId.set(null); this.previewVideoId.set(null); this.previewSequence.set(sequence); }
  openSoundPreview(id: number, sequence: AssetRef[] | null = null): void { this.previewImageId.set(null); this.previewSoundId.set(id); this.previewVideoId.set(null); this.previewSequence.set(sequence); }
  openVideoPreview(id: number, sequence: AssetRef[] | null = null): void { this.previewImageId.set(null); this.previewSoundId.set(null); this.previewVideoId.set(id); this.previewSequence.set(sequence); }
  openPreviewRef(ref: AssetRef, sequence: AssetRef[] | null = null): void { if (ref.kind === "sound") this.openSoundPreview(ref.id, sequence); else if (ref.kind === "video") this.openVideoPreview(ref.id, sequence); else this.openPreview(ref.id, sequence); }
  closePreview(): void { this.previewImageId.set(null); this.previewSoundId.set(null); this.previewVideoId.set(null); this.previewSequence.set(null); }
  openDeleteImages(ids: number[]): void { this.deleteImageIds.set([...ids]); }
  closeDeleteImages(): void { this.deleteImageIds.set([]); }
  openDeleteSounds(ids: number[]): void { this.deleteSoundIds.set([...ids]); }
  closeDeleteSounds(): void { this.deleteSoundIds.set([]); }
  openDeleteVideos(ids: number[]): void { this.deleteVideoIds.set([...ids]); }
  closeDeleteVideos(): void { this.deleteVideoIds.set([]); }
}
