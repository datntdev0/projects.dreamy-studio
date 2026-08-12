import { ImageSort, LibraryImage } from "./library.images.models";
export { fileNameOf, formatBytes } from "./library.rules";

export interface ImageFilters {
  query: string;
  sort: ImageSort;
  collection: number | "none" | null;
  tags: string[];
}

function imageNameMatches(needle: string, image: LibraryImage): boolean {
  return image.name.toLocaleLowerCase().includes(needle);
}

function imageTagsMatch(needle: string, image: LibraryImage): boolean {
  for (const tag of image.tags) {
    if (tag.toLocaleLowerCase().includes(needle)) {
      return true;
    }
  }
  return false;
}

function matchesQuery(needle: string, image: LibraryImage): boolean {
  return !needle || imageNameMatches(needle, image) || imageTagsMatch(needle, image);
}

function hasTag(tags: string[], image: LibraryImage): boolean {
  for (const tag of tags) {
    if (!image.tags.includes(tag)) {
      return false;
    }
  }
  return true;
}

function matchesCollection(collection: number | "none" | null, image: LibraryImage): boolean {
  if (collection === null) {
    return true;
  }
  return collection === "none" ? image.collectionId === null : image.collectionId === collection;
}

function compareNew(a: LibraryImage, b: LibraryImage): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
}

function compareName(a: LibraryImage, b: LibraryImage): number {
  return a.name.localeCompare(b.name) || a.id - b.id;
}

function compareSize(a: LibraryImage, b: LibraryImage): number {
  return b.size - a.size || compareName(a, b);
}

function compareFor(sort: ImageSort, a: LibraryImage, b: LibraryImage): number {
  if (sort === "name") {
    return compareName(a, b);
  }
  return sort === "size" ? compareSize(a, b) : compareNew(a, b);
}

export function imageCode(id: number): string {
  return `IMG-${String(id).padStart(4, "0")}`;
}

export function dimensionsText(image: LibraryImage): string {
  return `${image.width}×${image.height}`;
}

export function searchImages(items: LibraryImage[], query: string): LibraryImage[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(matchesQuery.bind(null, needle));
}

export function sortImages(items: LibraryImage[], sort: ImageSort): LibraryImage[] {
  return [...items].sort(compareFor.bind(null, sort));
}

export function filterImages(items: LibraryImage[], filters: ImageFilters): LibraryImage[] {
  const searched = searchImages(items, filters.query);
  const filtered = searched.filter(matchesCollection.bind(null, filters.collection)).filter(hasTag.bind(null, filters.tags));
  return sortImages(filtered, filters.sort);
}
