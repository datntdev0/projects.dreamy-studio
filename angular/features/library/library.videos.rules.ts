import { CollectionFilter } from './library.models';
// prettier-ignore
import { compareFor, durationText, hasAllTags, matchesCollection, matchesNameOrTags } from './library.rules';
import { LibraryVideo, VideoSort } from './library.videos.models';

export interface VideoFilters {
  query: string;
  sort: VideoSort;
  collection: CollectionFilter;
  tags: string[];
}

export function videoCode(id: number): string {
  return `VID-${String(id).padStart(4, '0')}`;
}
export function frameText(video: LibraryVideo): string {
  const fps = video.fps === null ? '' : ` \u00b7 ${Number(video.fps.toFixed(2))} fps`;
  return `${video.width} \u00d7 ${video.height}${fps}`;
}
export function videoMeta(video: LibraryVideo): string {
  return `${durationText(video.durationMs)} \u00b7 ${video.width}\u00d7${video.height}`;
}
export function searchVideos(items: LibraryVideo[], query: string): LibraryVideo[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(matchesNameOrTags.bind(null, needle));
}
export function sortVideos(items: LibraryVideo[], sort: VideoSort): LibraryVideo[] {
  return [...items].sort(compareFor.bind(null, sort));
}
export function filterVideos(items: LibraryVideo[], filters: VideoFilters): LibraryVideo[] {
  return sortVideos(
    searchVideos(items, filters.query)
      .filter(matchesCollection.bind(null, filters.collection))
      .filter(hasAllTags.bind(null, filters.tags)),
    filters.sort,
  );
}
