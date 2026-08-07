import { I18nKey } from "../app/core/i18n/i18n.models";

export type RailId = "projects" | "novels" | "library" | "distribution";

export type RightTabId = "inspector" | "assistant";

export type EditorTabKind = "home" | "novels" | "novel";

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
  rail: RailId | null;
  closable: boolean;
}

export const HOME_TAB_ID = "home";

export const NOVELS_TAB_ID = "novels";

export const HOME_TAB: EditorTab = {
  id: HOME_TAB_ID,
  kind: "home",
  icon: null,
  labelKey: "main.editor.home",
  title: "",
  novelId: null,
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
  rail: "novels",
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
    rail: "novels",
    closable: true,
  };
}
