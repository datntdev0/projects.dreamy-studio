import { CollectionFilter } from './library.models';
import { hasAllTags, matchesCollection, matchesNameOrTags } from './library.rules';
import { LibrarySound } from './library.sounds.models';
export { durationText } from './library.rules';

export interface SoundFilters {
  query: string;
  collection: CollectionFilter;
  tags: string[];
}

export function soundCode(id: number): string {
  return `SND-${String(id).padStart(4, '0')}`;
}
export function audioText(sound: LibrarySound): string {
  const rate =
    sound.sampleRate % 1000 === 0
      ? `${sound.sampleRate / 1000} kHz`
      : `${(sound.sampleRate / 1000).toFixed(1)} kHz`;
  const channels =
    sound.channels === 1 ? 'Mono' : sound.channels === 2 ? 'Stereo' : `${sound.channels} ch`;
  return `${rate} · ${channels}`;
}
export function searchSounds(items: LibrarySound[], query: string): LibrarySound[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(matchesNameOrTags.bind(null, needle));
}
export function filterSounds(items: LibrarySound[], filters: SoundFilters): LibrarySound[] {
  return searchSounds(items, filters.query)
    .filter(matchesCollection.bind(null, filters.collection))
    .filter(hasAllTags.bind(null, filters.tags));
}
