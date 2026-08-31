import { CollectionFilter } from './library.models';
// prettier-ignore
import { LibraryPrompt, PROMPT_MAX_BYTES, PROMPT_NAME_MAX, PromptSort } from './library.prompts.models';
import { compareFor, hasAllTags, matchesCollection, matchesNameOrTags } from './library.rules';

export interface PromptFilters {
  query: string;
  sort: PromptSort;
  collection: CollectionFilter;
  tags: string[];
}
export interface PromptSegment {
  text: string;
  variable: boolean;
}
const VARIABLE = /\{\{\s*([\w .-]+?)\s*\}\}/g;
function matchesQuery(needle: string, prompt: LibraryPrompt): boolean {
  return matchesNameOrTags(needle, prompt) || prompt.text.toLocaleLowerCase().includes(needle);
}
export function promptCode(id: number): string {
  return `PRM-${String(id).padStart(4, '0')}`;
}
export function charCount(text: string): number {
  return [...text].length;
}
export function promptMeta(prompt: LibraryPrompt): number {
  return charCount(prompt.text);
}
export function promptNameTooLong(name: string): boolean {
  return charCount(name.trim()) > PROMPT_NAME_MAX;
}
export function promptTextTooLarge(text: string): boolean {
  return new TextEncoder().encode(text).length > PROMPT_MAX_BYTES;
}
export function promptVariables(text: string): string[] {
  return [
    ...new Set(Array.from(text.matchAll(VARIABLE), (match) => match[1].trim()).filter(Boolean)),
  ];
}
export function promptSegments(text: string): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let index = 0;
  for (const match of text.matchAll(VARIABLE)) {
    const start = match.index ?? 0;
    if (start > index) segments.push({ text: text.slice(index, start), variable: false });
    segments.push({ text: match[1].trim(), variable: true });
    index = start + match[0].length;
  }
  if (index < text.length) segments.push({ text: text.slice(index), variable: false });
  return segments;
}
export function promptExcerpt(text: string): string {
  const chars = [...text];
  return chars.length > 180 ? `${chars.slice(0, 180).join('').trimEnd()}…` : text.trimEnd();
}
export function searchPrompts(items: LibraryPrompt[], query: string): LibraryPrompt[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(matchesQuery.bind(null, needle));
}
export function sortPrompts(items: LibraryPrompt[], sort: PromptSort): LibraryPrompt[] {
  return [...items].sort(compareFor.bind(null, sort));
}
export function filterPrompts(items: LibraryPrompt[], filters: PromptFilters): LibraryPrompt[] {
  return sortPrompts(
    searchPrompts(items, filters.query)
      .filter(matchesCollection.bind(null, filters.collection))
      .filter(hasAllTags.bind(null, filters.tags)),
    filters.sort,
  );
}
