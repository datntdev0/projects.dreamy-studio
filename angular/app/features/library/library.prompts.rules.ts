import { LibraryPrompt, PromptSort } from "./library.prompts.models";

export interface PromptFilters { query: string; sort: PromptSort; collection: number | "none" | null; tags: string[]; }
export interface PromptSegment { text: string; variable: boolean; }
const VARIABLE = /\{\{\s*([\w .-]+?)\s*\}\}/g;
function matches(prompt: LibraryPrompt, needle: string): boolean { return !needle || prompt.name.toLocaleLowerCase().includes(needle) || prompt.text.toLocaleLowerCase().includes(needle) || prompt.tags.some(tag => tag.toLocaleLowerCase().includes(needle)); }
function byNew(a: LibraryPrompt, b: LibraryPrompt): number { return b.createdAt.localeCompare(a.createdAt) || b.id - a.id; }
function byName(a: LibraryPrompt, b: LibraryPrompt): number { return a.name.localeCompare(b.name) || a.id - b.id; }
function bySize(a: LibraryPrompt, b: LibraryPrompt): number { return b.size - a.size || byName(a, b); }
export function promptCode(id: number): string { return `PRM-${String(id).padStart(4, "0")}`; }
export function charCount(text: string): number { return [...text].length; }
export function promptMeta(prompt: LibraryPrompt): number { return charCount(prompt.text); }
export function promptVariables(text: string): string[] { return [...new Set(Array.from(text.matchAll(VARIABLE), match => match[1].trim()).filter(Boolean))]; }
export function promptSegments(text: string): PromptSegment[] { const segments: PromptSegment[] = []; let index = 0; for (const match of text.matchAll(VARIABLE)) { const start = match.index ?? 0; if (start > index) segments.push({ text: text.slice(index, start), variable: false }); segments.push({ text: match[1].trim(), variable: true }); index = start + match[0].length; } if (index < text.length) segments.push({ text: text.slice(index), variable: false }); return segments; }
export function promptExcerpt(text: string): string { const chars = [...text]; return chars.length > 180 ? `${chars.slice(0, 180).join("").trimEnd()}…` : text.trimEnd(); }
export function searchPrompts(items: LibraryPrompt[], query: string): LibraryPrompt[] { const needle = query.trim().toLocaleLowerCase(); return items.filter(prompt => matches(prompt, needle)); }
export function sortPrompts(items: LibraryPrompt[], sort: PromptSort): LibraryPrompt[] { return [...items].sort(sort === "name" ? byName : sort === "size" ? bySize : byNew); }
export function filterPrompts(items: LibraryPrompt[], filters: PromptFilters): LibraryPrompt[] { return sortPrompts(searchPrompts(items, filters.query).filter(prompt => filters.collection === null || (filters.collection === "none" ? prompt.collectionId === null : prompt.collectionId === filters.collection)).filter(prompt => filters.tags.every(tag => prompt.tags.includes(tag))), filters.sort); }
