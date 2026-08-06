import { I18nKey } from "../app/core/i18n/i18n.models";

export type RailId = "projects" | "novels" | "library" | "distribution";

export type RightTabId = "inspector" | "assistant";

export interface RailItem {
  id: RailId;
  icon: string;
  labelKey: I18nKey;
}

export interface RightTab {
  id: RightTabId;
  labelKey: I18nKey;
}

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
