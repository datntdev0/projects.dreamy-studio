import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { AssetRights, CollectionFilter, KindCounts, LibraryCollection, LibraryError, LibraryKind, LibrarySort, LibraryTag } from './library.models';

export interface Sortable {
  id: number;
  name: string;
  size: number;
  createdAt: string;
}
export interface Searchable {
  name: string;
  tags: string[];
}
export interface Collectable {
  tags: string[];
  collectionId: number | null;
}
function compareNew(a: Sortable, b: Sortable): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
}
function compareName(a: Sortable, b: Sortable): number {
  return a.name.localeCompare(b.name) || a.id - b.id;
}
function compareSize(a: Sortable, b: Sortable): number {
  return b.size - a.size || compareName(a, b);
}
export function compareFor(sort: LibrarySort, a: Sortable, b: Sortable): number {
  if (sort === 'name') return compareName(a, b);
  return sort === 'size' ? compareSize(a, b) : compareNew(a, b);
}
function tagContains(needle: string, tag: string): boolean {
  return tag.toLocaleLowerCase().includes(needle);
}
export function matchesNameOrTags(needle: string, item: Searchable): boolean {
  return (
    item.name.toLocaleLowerCase().includes(needle) || item.tags.some(tagContains.bind(null, needle))
  );
}
export function hasAllTags(tags: string[], item: Pick<Collectable, 'tags'>): boolean {
  for (const tag of tags) {
    if (!item.tags.includes(tag)) return false;
  }
  return true;
}
export function matchesCollection(collection: CollectionFilter, item: Collectable): boolean {
  if (collection === null) return true;
  return collection === 'none' ? item.collectionId === null : item.collectionId === collection;
}
export function normalizeTag(value: string): string {
  return value.toLocaleLowerCase().replace(/[#,]/g, ' ').trim().replace(/\s+/g, '-').slice(0, 24);
}
export function enteredTag(event: KeyboardEvent): string | null {
  if (event.key !== 'Enter') return null;
  event.preventDefault();
  return normalizeTag((event.target as HTMLInputElement).value) || null;
}
export function clearTagField(event: KeyboardEvent): void {
  (event.target as HTMLInputElement).value = '';
}
const RIGHTS_KEYS: Record<AssetRights, LanguageKey> = {
  own: 'library.rights.own',
  licensed: 'library.rights.licensed',
  free: 'library.rights.free',
  other: 'library.rights.other',
};
export function rightsKey(rights: AssetRights): LanguageKey {
  return RIGHTS_KEYS[rights];
}
export function collectionCode(id: number): string {
  return `COL-${String(id).padStart(2, '0')}`;
}
export function sumCounts(counts: KindCounts): number {
  return counts.image + counts.sound + counts.video + counts.prompt;
}
function compareTags(a: LibraryTag, b: LibraryTag): number {
  return sumCounts(b.counts) - sumCounts(a.counts) || a.tag.localeCompare(b.tag);
}
export function sortTags(tags: LibraryTag[]): LibraryTag[] {
  return [...tags].sort(compareTags);
}
function hasKindCount(kind: LibraryKind, tag: LibraryTag): boolean {
  return tag.counts[kind] > 0;
}
function compareTagsByKind(kind: LibraryKind, a: LibraryTag, b: LibraryTag): number {
  return b.counts[kind] - a.counts[kind] || a.tag.localeCompare(b.tag);
}
export function tagsForKind(tags: LibraryTag[], kind: LibraryKind): LibraryTag[] {
  return tags.filter(hasKindCount.bind(null, kind)).sort(compareTagsByKind.bind(null, kind));
}
function matchesTag(needle: string, tag: LibraryTag): boolean {
  return !needle || tag.tag.toLocaleLowerCase().includes(needle);
}
export function searchTags(tags: LibraryTag[], query: string): LibraryTag[] {
  return sortTags(tags).filter(matchesTag.bind(null, query.trim().toLocaleLowerCase()));
}
function isSameCollectionName(
  needle: string,
  exceptId: number | undefined,
  collection: LibraryCollection,
): boolean {
  return collection.id !== exceptId && collection.name.toLocaleLowerCase() === needle;
}
export function hasCollectionName(
  collections: LibraryCollection[],
  name: string,
  exceptId?: number,
): boolean {
  return collections.some(
    isSameCollectionName.bind(null, name.trim().toLocaleLowerCase(), exceptId),
  );
}
function isLibraryError(value: unknown): value is LibraryError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['code'] === 'string' && typeof candidate['detail'] === 'string';
}
export function toLibraryError(error: unknown): LibraryError {
  const payload = error instanceof DesktopIpcError ? error.cause : error;
  return isLibraryError(payload) ? payload : { code: 'unknown', detail: String(payload) };
}
const VOICE_ERROR_KEYS: Record<string, string> = {
  voice_not_found: 'library.error.voiceNotFound',
  voice_invalid: 'library.error.voiceInvalid',
  voice_reference_invalid: 'library.error.voiceReferenceInvalid',
  voice_engine_unavailable: 'library.error.voiceEngineUnavailable',
  voice_backend_offline: 'library.error.voiceBackendOffline',
  voice_synthesis_failed: 'library.error.voiceSynthesisFailed',
};

function voiceErrorKey(code: string): string | null {
  return VOICE_ERROR_KEYS[code] ?? null;
}

export function libraryErrorKey(error: unknown): string {
  const code = toLibraryError(error).code;
  if (code === 'collection_exists') return 'library.error.collectionExists';
  if (code === 'invalid_input') return 'library.error.invalidInput';
  if (code === 'tag_exists') return 'library.error.tagExists';
  if (code === 'invalid_tag') return 'library.error.invalidTag';
  if (code === 'image_not_found') return 'library.error.imageNotFound';
  if (code === 'image_unsupported') return 'library.error.imageUnsupported';
  if (code === 'image_too_large') return 'library.error.imageTooLarge';
  if (code === 'image_unreadable') return 'library.error.imageUnreadable';
  if (code === 'sound_not_found') return 'library.error.soundNotFound';
  if (code === 'sound_unsupported') return 'library.error.soundUnsupported';
  if (code === 'sound_too_large') return 'library.error.soundTooLarge';
  if (code === 'sound_unreadable') return 'library.error.soundUnreadable';
  if (code === 'video_not_found') return 'library.error.videoNotFound';
  if (code === 'video_unsupported') return 'library.error.videoUnsupported';
  if (code === 'video_too_large') return 'library.error.videoTooLarge';
  if (code === 'video_unreadable') return 'library.error.videoUnreadable';
  if (code === 'prompt_not_found') return 'library.error.promptNotFound';
  if (code === 'prompt_unsupported') return 'library.error.promptUnsupported';
  if (code === 'prompt_too_large') return 'library.error.promptTooLarge';
  if (code === 'prompt_unreadable') return 'library.error.promptUnreadable';
  if (code === 'prompt_empty') return 'library.error.promptEmpty';
  if (code === 'prompt_name_invalid') return 'library.error.promptNameInvalid';
  if (code === 'tag_limit') return 'library.error.tagLimit';
  if (code === 'io') return 'library.error.io';
  return voiceErrorKey(code) ?? 'library.error.generic';
}
export function durationText(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}
export function kindCount(counts: KindCounts, kind: LibraryKind): number {
  return counts[kind];
}
export function formatIsoMinute(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}
export function formatBytes(value: number): string {
  if (value <= 0) return '0 B';
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}
export function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  const last = segments[segments.length - 1];
  return last || path;
}
