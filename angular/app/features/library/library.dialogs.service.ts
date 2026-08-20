import { Injectable, signal } from "@angular/core";
import { AssetRef } from "./library.models";

@Injectable({ providedIn: "root" })
export class LibraryDialogsService {
  readonly createCollectionOpen = signal(false);
  readonly uploadOpen = signal(false);
  readonly uploadPaths = signal<string[]>([]);
  readonly uploadKind = signal<"image" | "sound" | "video" | "prompt">("image");
  readonly uploadMode = signal<"files" | "write">("files");
  readonly uploadCollectionId = signal<number | null>(null);
  readonly previewImageId = signal<number | null>(null);
  readonly previewSoundId = signal<number | null>(null);
  readonly previewVideoId = signal<number | null>(null);
  readonly previewPromptId = signal<number | null>(null);
  readonly previewSequence = signal<AssetRef[] | null>(null);
  openCreateCollection(): void { this.createCollectionOpen.set(true); }
  closeCreateCollection(): void { this.createCollectionOpen.set(false); }
  openUpload(paths: string[] = [], kind: "image" | "sound" | "video" | "prompt" = "image", collectionId: number | null = null, mode: "files" | "write" = "files"): void { this.uploadPaths.set([...paths]); this.uploadKind.set(kind); this.uploadCollectionId.set(collectionId); this.uploadMode.set(mode); this.uploadOpen.set(true); }
  closeUpload(): void { this.uploadOpen.set(false); this.uploadPaths.set([]); this.uploadKind.set("image"); this.uploadCollectionId.set(null); this.uploadMode.set("files"); }
  openPreview(id: number, sequence: AssetRef[] | null = null): void { this.previewImageId.set(id); this.previewSoundId.set(null); this.previewVideoId.set(null); this.previewPromptId.set(null); this.previewSequence.set(sequence); }
  openSoundPreview(id: number, sequence: AssetRef[] | null = null): void { this.previewImageId.set(null); this.previewSoundId.set(id); this.previewVideoId.set(null); this.previewPromptId.set(null); this.previewSequence.set(sequence); }
  openVideoPreview(id: number, sequence: AssetRef[] | null = null): void { this.previewImageId.set(null); this.previewSoundId.set(null); this.previewVideoId.set(id); this.previewPromptId.set(null); this.previewSequence.set(sequence); }
  openPromptPreview(id: number, sequence: AssetRef[] | null = null): void { this.previewImageId.set(null); this.previewSoundId.set(null); this.previewVideoId.set(null); this.previewPromptId.set(id); this.previewSequence.set(sequence); }
  openPreviewRef(ref: AssetRef, sequence: AssetRef[] | null = null): void { if (ref.kind === "sound") this.openSoundPreview(ref.id, sequence); else if (ref.kind === "video") this.openVideoPreview(ref.id, sequence); else if (ref.kind === "prompt") this.openPromptPreview(ref.id, sequence); else this.openPreview(ref.id, sequence); }
  closePreview(): void { this.previewImageId.set(null); this.previewSoundId.set(null); this.previewVideoId.set(null); this.previewPromptId.set(null); this.previewSequence.set(null); }
}
