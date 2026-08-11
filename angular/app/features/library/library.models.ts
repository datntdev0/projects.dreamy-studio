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
export type LibraryErrorCode = "no_workspace" | "invalid_input" | "collection_not_found" | "collection_exists" | "tag_exists" | "tag_not_found" | "invalid_tag" | "image_not_found" | "image_unsupported" | "image_too_large" | "image_unreadable" | "tag_limit" | "io" | "db" | "task" | "unknown";
