import { I18nKey } from "../../core/i18n/i18n.models";

export type LibraryKind = "image" | "sound" | "video" | "prompt";
export type KindCounts = Record<LibraryKind, number>;
export const LIBRARY_KINDS: { id: LibraryKind; icon: string; labelKey: I18nKey }[] = [
  { id: "image", icon: "image", labelKey: "library.kind.image" },
  { id: "sound", icon: "music", labelKey: "library.kind.sound" },
  { id: "video", icon: "film", labelKey: "library.kind.video" },
  { id: "prompt", icon: "prompt", labelKey: "library.kind.prompt" },
];
export interface LibraryCollection { id: number; name: string; description: string; createdAt: string; updatedAt: string; counts: KindCounts; }
export interface LibraryTag { tag: string; counts: KindCounts; }
export interface LibrarySummary { assets: KindCounts; unfiled: KindCounts; }
export interface TaxonomySelection { kind: "col" | "tag"; id: number | string; }
export interface LibraryError { code: string; detail: string; }
export type AssetRights = "own" | "licensed" | "free" | "other";
export const ASSET_RIGHTS: AssetRights[] = ["own", "licensed", "free", "other"];
export type AssetCheckStatus = "ok" | "warn" | "error";
export interface AssetCheck { path: string; name: string; size: number; status: AssetCheckStatus; code?: "empty" | "unsupported" | "too_large" | "not_found" | "duplicate_name"; }
export interface AssetUploadInput { collectionId?: number; tags: string[]; rights: AssetRights; }
export interface AssetPatch { name?: string; rights?: AssetRights; collectionId?: number | null; tags?: string[]; }
export type AssetRef = { kind: "image" | "sound"; id: number; };
export type LibraryErrorCode = "no_workspace" | "invalid_input" | "collection_not_found" | "collection_exists" | "tag_exists" | "tag_not_found" | "invalid_tag" | "image_not_found" | "image_unsupported" | "image_too_large" | "image_unreadable" | "sound_not_found" | "sound_unsupported" | "sound_too_large" | "sound_unreadable" | "tag_limit" | "io" | "db" | "task" | "unknown";
