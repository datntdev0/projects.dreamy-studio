import { AssetRights } from "./library.models";

export type PromptKind = "image" | "video" | "voice" | "general";
export type PromptSort = "new" | "name" | "size";
export interface LibraryPrompt { id: number; name: string; kind: PromptKind; text: string; size: number; rights: AssetRights; origin: string; collectionId: number | null; tags: string[]; createdAt: string; updatedAt: string; }
export interface PromptCreateInput { name: string; kind: PromptKind; text: string; collectionId?: number; tags: string[]; rights: AssetRights; }
export interface PromptPatch { name?: string; kind?: PromptKind; text?: string; rights?: AssetRights; collectionId?: number | null; tags?: string[]; }
export const PROMPT_KINDS: PromptKind[] = ["image", "video", "voice", "general"];
export const PROMPT_EXTENSIONS = ["txt", "md"] as const;
export const PROMPT_MAX_BYTES = 256 * 1024;
export const PROMPT_NAME_MAX = 120;
export const PROMPT_EXCERPT = 180;
