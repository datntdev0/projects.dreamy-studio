import { AssetRow } from "./library.assets.models";
import { VideoSort } from "./library.videos.models";

export interface AssetFilters { query: string; sort: VideoSort; collection: number; tags: string[]; }

function matchesQuery(needle: string, row: AssetRow): boolean { return !needle || row.name.toLocaleLowerCase().includes(needle) || row.tags.some(matchesTag.bind(null, needle)); }
function matchesTag(needle: string, tag: string): boolean { return tag.toLocaleLowerCase().includes(needle); }
function hasTags(tags: string[], row: AssetRow): boolean { for (const tag of tags) { if (!row.tags.includes(tag)) return false; } return true; }
function inCollection(collection: number, row: AssetRow): boolean { return row.collectionId === collection; }
function compareNew(a: AssetRow, b: AssetRow): number { return b.createdAt.localeCompare(a.createdAt) || b.ref.id - a.ref.id; }
function compareName(a: AssetRow, b: AssetRow): number { return a.name.localeCompare(b.name) || a.ref.id - b.ref.id; }
function compareSize(a: AssetRow, b: AssetRow): number { return b.size - a.size || compareName(a, b); }
function compareFor(sort: VideoSort, a: AssetRow, b: AssetRow): number { return sort === "name" ? compareName(a, b) : sort === "size" ? compareSize(a, b) : compareNew(a, b); }

export function filterAssetRows(rows: AssetRow[], filters: AssetFilters): AssetRow[] { const needle = filters.query.trim().toLocaleLowerCase(); return [...rows].filter(inCollection.bind(null, filters.collection)).filter(matchesQuery.bind(null, needle)).filter(hasTags.bind(null, filters.tags)).sort(compareFor.bind(null, filters.sort)); }
