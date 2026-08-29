import { LibrarySound, SoundSort } from "./library.sounds.models";
export { durationText } from "./library.rules";

export interface SoundFilters { query: string; sort: SoundSort; collection: number | "none" | null; tags: string[]; }

function matchesQuery(needle: string, sound: LibrarySound): boolean { return !needle || sound.name.toLocaleLowerCase().includes(needle) || sound.tags.some(matchesTag.bind(null, needle)); }
function matchesTag(needle: string, tag: string): boolean { return tag.toLocaleLowerCase().includes(needle); }
function matchesCollection(collection: number | "none" | null, sound: LibrarySound): boolean { return collection === null || (collection === "none" ? sound.collectionId === null : sound.collectionId === collection); }
function hasTags(tags: string[], sound: LibrarySound): boolean { for (const tag of tags) { if (!sound.tags.includes(tag)) return false; } return true; }
function compareNew(a: LibrarySound, b: LibrarySound): number { return b.createdAt.localeCompare(a.createdAt) || b.id - a.id; }
function compareName(a: LibrarySound, b: LibrarySound): number { return a.name.localeCompare(b.name) || a.id - b.id; }
function compareSize(a: LibrarySound, b: LibrarySound): number { return b.size - a.size || compareName(a, b); }
function compareFor(sort: SoundSort, a: LibrarySound, b: LibrarySound): number { return sort === "name" ? compareName(a, b) : sort === "size" ? compareSize(a, b) : compareNew(a, b); }

export function soundCode(id: number): string { return `SND-${String(id).padStart(4, "0")}`; }
export function audioText(sound: LibrarySound): string { const rate = sound.sampleRate % 1000 === 0 ? `${sound.sampleRate / 1000} kHz` : `${(sound.sampleRate / 1000).toFixed(1)} kHz`; const channels = sound.channels === 1 ? "Mono" : sound.channels === 2 ? "Stereo" : `${sound.channels} ch`; return `${rate} · ${channels}`; }
export function searchSounds(items: LibrarySound[], query: string): LibrarySound[] { const needle = query.trim().toLocaleLowerCase(); return items.filter(matchesQuery.bind(null, needle)); }
export function sortSounds(items: LibrarySound[], sort: SoundSort): LibrarySound[] { return [...items].sort(compareFor.bind(null, sort)); }
export function filterSounds(items: LibrarySound[], filters: SoundFilters): LibrarySound[] { return sortSounds(searchSounds(items, filters.query).filter(matchesCollection.bind(null, filters.collection)).filter(hasTags.bind(null, filters.tags)), filters.sort); }
