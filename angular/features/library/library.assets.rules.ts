import { AssetRow } from './library.assets.models';
import { LibraryTag } from './library.models';
import { compareNewest, hasAllTags, matchesNameOrTags, sortTags } from './library.rules';

export interface AssetFilters {
  query: string;
  collection: number;
  tags: string[];
}

function inCollection(collection: number, row: AssetRow): boolean {
  return row.collectionId === collection;
}
function matchesQuery(needle: string, row: AssetRow): boolean {
  return (
    matchesNameOrTags(needle, row) || row.prompt?.text.toLocaleLowerCase().includes(needle) === true
  );
}
export function filterAssetRows(rows: AssetRow[], filters: AssetFilters): AssetRow[] {
  const needle = filters.query.trim().toLocaleLowerCase();
  return [...rows]
    .filter(inCollection.bind(null, filters.collection))
    .filter(matchesQuery.bind(null, needle))
    .filter(hasAllTags.bind(null, filters.tags))
    .sort(compareNewest);
}
function addRowTags(counts: Map<string, LibraryTag>, row: AssetRow): void {
  for (const tag of row.tags) {
    const entry = counts.get(tag) ?? {
      tag,
      counts: { image: 0, sound: 0, video: 0, prompt: 0, voice: 0 },
    };
    entry.counts[row.ref.kind] += 1;
    counts.set(tag, entry);
  }
}
export function collectionTags(rows: AssetRow[], collection: number): LibraryTag[] {
  const counts = new Map<string, LibraryTag>();
  rows.filter(inCollection.bind(null, collection)).forEach(addRowTags.bind(null, counts));
  return sortTags([...counts.values()]);
}
