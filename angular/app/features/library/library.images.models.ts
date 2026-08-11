export type ImageRights = "own" | "licensed" | "free" | "other";
export type ImageSort = "new" | "name" | "size";
export type ImageViewMode = "grid" | "list";
export type ImageCheckStatus = "ok" | "warn" | "error";

export interface LibraryImage {
  id: number;
  name: string;
  ext: string;
  size: number;
  width: number;
  height: number;
  rights: ImageRights;
  origin: string;
  collectionId: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ImageCheck {
  path: string;
  name: string;
  size: number;
  status: ImageCheckStatus;
  code?: "empty" | "unsupported" | "too_large" | "not_found" | "duplicate_name";
}

export interface ImagePatch {
  name?: string;
  rights?: ImageRights;
  collectionId?: number | null;
  tags?: string[];
}

export interface ImageUploadInput {
  collectionId?: number;
  tags: string[];
  rights: ImageRights;
}

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const IMAGE_RIGHTS: ImageRights[] = ["own", "licensed", "free", "other"];
export const IMAGE_RATIOS = [["1/1", "1:1"], ["16/9", "16:9"], ["9/16", "9:16"]] as const;
