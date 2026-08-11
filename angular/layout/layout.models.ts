import { I18nKey } from "../app/core/i18n/i18n.models";

export type RailId = "projects" | "novels" | "library" | "distribution";

export type PanelId = "explorer" | "inspector" | "bottom";

export type RightTabId = "inspector" | "assistant";

export type EditorTabKind = "home" | "novels" | "novel" | "projects" | "project" | "images" | "collections" | "collection";

export interface RailItem {
  id: RailId;
  icon: string;
  labelKey: I18nKey;
}

export interface RightTab {
  id: RightTabId;
  labelKey: I18nKey;
}

export interface EditorTab {
  id: string;
  kind: EditorTabKind;
  icon: string | null;
  labelKey: I18nKey | null;
  title: string;
  novelId: number | null;
  projectId: number | null;
  collectionId: number | null;
  rail: RailId | null;
  closable: boolean;
}

export const HOME_TAB_ID = "home";

export const NOVELS_TAB_ID = "novels";

export const PROJECTS_TAB_ID = "projects";

export const IMAGES_TAB_ID = "images";

export const COLLECTIONS_TAB_ID = "collections";

export const HOME_TAB: EditorTab = {
  id: HOME_TAB_ID,
  kind: "home",
  icon: null,
  labelKey: "main.editor.home",
  title: "",
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: null,
  closable: false,
};

export const NOVELS_TAB: EditorTab = {
  id: NOVELS_TAB_ID,
  kind: "novels",
  icon: "frames",
  labelKey: "tabs.novels.title",
  title: "",
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: "novels",
  closable: true,
};

export const PROJECTS_TAB: EditorTab = {
  id: PROJECTS_TAB_ID,
  kind: "projects",
  icon: "folder",
  labelKey: "tabs.projects.title",
  title: "",
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: "projects",
  closable: true,
};

export const IMAGES_TAB: EditorTab = {
  id: IMAGES_TAB_ID,
  kind: "images",
  icon: "image",
  labelKey: "tabs.images.title",
  title: "",
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: "library",
  closable: true,
};

export const RAIL_ITEMS: RailItem[] = [
  { id: "projects", icon: "folder", labelKey: "main.rail.projects" },
  { id: "novels", icon: "book", labelKey: "main.rail.novels" },
  { id: "library", icon: "library", labelKey: "main.rail.library" },
  { id: "distribution", icon: "send", labelKey: "main.rail.distribution" },
];

export const RIGHT_TABS: RightTab[] = [
  { id: "inspector", labelKey: "main.inspector.tab.inspector" },
  { id: "assistant", labelKey: "main.inspector.tab.assistant" },
];

export function novelTabId(novelId: number): string {
  return `novel:${novelId}`;
}

export function novelTab(novelId: number, title: string): EditorTab {
  return {
    id: novelTabId(novelId),
    kind: "novel",
    icon: "book",
    labelKey: null,
    title,
    novelId,
    projectId: null,
    collectionId: null,
    rail: "novels",
    closable: true,
  };
}

export function projectTabId(id: number): string {
  return `project:${id}`;
}

export function projectTab(id: number, title: string, icon = "folder"): EditorTab {
  return {
    id: projectTabId(id),
    kind: "project",
    icon,
    labelKey: null,
    title,
    novelId: null,
    projectId: id,
    collectionId: null,
    rail: "projects",
    closable: true,
  };
}

export const COLLECTIONS_TAB: EditorTab = { id: COLLECTIONS_TAB_ID, kind: "collections", icon: "tag", labelKey: "tabs.collections.title", title: "", novelId: null, projectId: null, collectionId: null, rail: "library", closable: true };

export function collectionTabId(id: number): string { return `collection:${id}`; }

export function collectionTab(id: number, title: string): EditorTab { return { id: collectionTabId(id), kind: "collection", icon: "folder", labelKey: null, title, novelId: null, projectId: null, collectionId: id, rail: "library", closable: true }; }
