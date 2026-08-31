import { AssetRights, LibrarySort } from './library.models';

export type VideoSort = LibrarySort;
export interface LibraryVideo {
  id: number;
  name: string;
  ext: string;
  size: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number | null;
  rights: AssetRights;
  origin: string;
  collectionId: number | null;
  tags: string[];
  hasPoster: boolean;
  createdAt: string;
  updatedAt: string;
}
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv'] as const;
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const VIDEO_STREAM_SCHEME = 'dreamy-video';
