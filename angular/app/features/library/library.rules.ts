import { DesktopIpcError } from "../../core/desktop/desktop-ipc-error";
import { KindCounts, LibraryCollection, LibraryError, LibraryKind, LibraryTag } from "./library.models";

export function normalizeTag(value: string): string { return value.toLocaleLowerCase().replace(/[#,]/g, " ").trim().replace(/\s+/g, "-").slice(0, 24); }
export function collectionCode(id: number): string { return `COL-${String(id).padStart(2, "0")}`; }
export function sumCounts(counts: KindCounts): number { return counts.image + counts.sound + counts.video + counts.prompt; }
function compareTags(a: LibraryTag, b: LibraryTag): number { return sumCounts(b.counts) - sumCounts(a.counts) || a.tag.localeCompare(b.tag); }
export function sortTags(tags: LibraryTag[]): LibraryTag[] { return [...tags].sort(compareTags); }
function matchesTag(needle: string, tag: LibraryTag): boolean { return !needle || tag.tag.toLocaleLowerCase().includes(needle); }
export function searchTags(tags: LibraryTag[], query: string): LibraryTag[] { return sortTags(tags).filter(matchesTag.bind(null, query.trim().toLocaleLowerCase())); }
function isSameCollectionName(needle: string, exceptId: number | undefined, collection: LibraryCollection): boolean { return collection.id !== exceptId && collection.name.toLocaleLowerCase() === needle; }
export function hasCollectionName(collections: LibraryCollection[], name: string, exceptId?: number): boolean { return collections.some(isSameCollectionName.bind(null, name.trim().toLocaleLowerCase(), exceptId)); }
function isLibraryError(value: unknown): value is LibraryError { if (typeof value !== "object" || value === null) return false; const candidate = value as Record<string, unknown>; return typeof candidate["code"] === "string" && typeof candidate["detail"] === "string"; }
export function toLibraryError(error: unknown): LibraryError { const payload = error instanceof DesktopIpcError ? error.cause : error; return isLibraryError(payload) ? payload : { code: "unknown", detail: String(payload) }; }
export function libraryErrorKey(error: unknown): string { const code = toLibraryError(error).code; if (code === "collection_exists") return "library.error.collectionExists"; if (code === "invalid_input") return "library.error.invalidInput"; if (code === "tag_exists") return "library.error.tagExists"; if (code === "invalid_tag") return "library.error.invalidTag"; return "library.error.generic"; }
export function kindCount(counts: KindCounts, kind: LibraryKind): number { return counts[kind]; }
