import { ImageSort, LibraryImage } from './library.images.models';
import { CollectionFilter } from './library.models';
import { compareFor, hasAllTags, matchesCollection, matchesNameOrTags } from './library.rules';
export { fileNameOf, formatBytes } from './library.rules';

export interface ImageFilters {
  query: string;
  sort: ImageSort;
  collection: CollectionFilter;
  tags: string[];
}

export function imageCode(id: number): string {
  return `IMG-${String(id).padStart(4, '0')}`;
}

export function dimensionsText(image: LibraryImage): string {
  return `${image.width}×${image.height}`;
}

export function imageInspectorDimensionsText(image: LibraryImage): string {
  return `${image.width} × ${image.height} px`;
}

export function imageInspectorFormatText(image: LibraryImage): string {
  return image.ext ? image.ext.toLocaleUpperCase() : '—';
}

export function searchImages(items: LibraryImage[], query: string): LibraryImage[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(matchesNameOrTags.bind(null, needle));
}

export function sortImages(items: LibraryImage[], sort: ImageSort): LibraryImage[] {
  return [...items].sort(compareFor.bind(null, sort));
}

export function filterImages(items: LibraryImage[], filters: ImageFilters): LibraryImage[] {
  const searched = searchImages(items, filters.query);
  const filtered = searched
    .filter(matchesCollection.bind(null, filters.collection))
    .filter(hasAllTags.bind(null, filters.tags));
  return sortImages(filtered, filters.sort);
}
