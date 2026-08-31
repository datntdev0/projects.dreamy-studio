import { AssetRights, LibrarySort } from './library.models';

export type SoundSort = LibrarySort;

export interface LibrarySound {
  id: number;
  name: string;
  ext: string;
  size: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
  overview: number[];
  rights: AssetRights;
  origin: string;
  collectionId: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export const SOUND_EXTENSIONS = ['mp3', 'wav', 'aac'] as const;
export const SOUND_MAX_BYTES = 200 * 1024 * 1024;
export const SOUND_STREAM_SCHEME = 'dreamy-sound';
