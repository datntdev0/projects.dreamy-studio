import { durationText } from "./library.rules";
import { LibraryVideo, VideoSort } from "./library.videos.models";

export interface VideoFilters {
  query: string;
  sort: VideoSort;
  collection: number | "none" | null;
  tags: string[];
}

function matchesQuery(needle: string, video: LibraryVideo): boolean { return !needle || video.name.toLocaleLowerCase().includes(needle) || video.tags.some(matchesTag.bind(null, needle)); }
function matchesTag(needle: string, tag: string): boolean { return tag.toLocaleLowerCase().includes(needle); }
function matchesCollection(collection: number | "none" | null, video: LibraryVideo): boolean { return collection === null || (collection === "none" ? video.collectionId === null : video.collectionId === collection); }
function hasTags(tags: string[], video: LibraryVideo): boolean { for (const tag of tags) { if (!video.tags.includes(tag)) return false; } return true; }
function compareNew(a: LibraryVideo, b: LibraryVideo): number { return b.createdAt.localeCompare(a.createdAt) || b.id - a.id; }
function compareName(a: LibraryVideo, b: LibraryVideo): number { return a.name.localeCompare(b.name) || a.id - b.id; }
function compareSize(a: LibraryVideo, b: LibraryVideo): number { return b.size - a.size || compareName(a, b); }
function compareFor(sort: VideoSort, a: LibraryVideo, b: LibraryVideo): number { return sort === "name" ? compareName(a, b) : sort === "size" ? compareSize(a, b) : compareNew(a, b); }

export function videoCode(id: number): string { return `VID-${String(id).padStart(4, "0")}`; }
export function frameText(video: LibraryVideo): string { const fps = video.fps === null ? "" : ` \u00b7 ${Number(video.fps.toFixed(2))} fps`; return `${video.width} \u00d7 ${video.height}${fps}`; }
export function videoMeta(video: LibraryVideo): string { return `${durationText(video.durationMs)} \u00b7 ${video.width}\u00d7${video.height}`; }
export function searchVideos(items: LibraryVideo[], query: string): LibraryVideo[] { const needle = query.trim().toLocaleLowerCase(); return items.filter(matchesQuery.bind(null, needle)); }
export function sortVideos(items: LibraryVideo[], sort: VideoSort): LibraryVideo[] { return [...items].sort(compareFor.bind(null, sort)); }
export function filterVideos(items: LibraryVideo[], filters: VideoFilters): LibraryVideo[] { return sortVideos(searchVideos(items, filters.query).filter(matchesCollection.bind(null, filters.collection)).filter(hasTags.bind(null, filters.tags)), filters.sort); }
