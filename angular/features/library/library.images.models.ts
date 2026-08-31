// prettier-ignore
import { ASSET_RATIOS, ASSET_RIGHTS, AssetCheck, AssetCheckStatus, AssetPatch, AssetRights, AssetUploadInput, LibrarySort } from './library.models';

export type ImageRights = AssetRights;
export type ImageSort = LibrarySort;
export type ImageViewMode = 'grid' | 'list';
export type ImageCheckStatus = AssetCheckStatus;

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

export type ImageCheck = AssetCheck;
export type ImagePatch = AssetPatch;
export type ImageUploadInput = AssetUploadInput;

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const IMAGE_RIGHTS: ImageRights[] = ASSET_RIGHTS;
export const IMAGE_RATIOS = ASSET_RATIOS;
