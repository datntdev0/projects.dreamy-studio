import { prototypeLibraryPage, prototypeNovelPage } from "./paths.ts";

export type Target = "prototype" | "app";

export type TargetSelectors = Readonly<Record<Target, string>>;

export interface PanelSpec {
  readonly name: string;
  readonly selector: string;
  readonly below?: string;
  readonly aria?: string;
  readonly mask?: readonly string[];
}

export interface ListSpec {
  readonly toggle: TargetSelectors;
  readonly select: TargetSelectors;
}

export interface ScreenSpec {
  readonly id: string;
  readonly folder?: readonly string[];
  readonly open: TargetSelectors;
  readonly prepare?: readonly TargetSelectors[];
  readonly select?: TargetSelectors;
  readonly list?: ListSpec;
  readonly preview?: TargetSelectors;
  readonly selectedPanels: readonly string[];
}

export interface SuiteSpec {
  readonly id: string;
  readonly page: string;
  readonly rail: string;
  readonly panels: readonly PanelSpec[];
  readonly screens: readonly ScreenSpec[];
}

export const DIALOG_PANEL: PanelSpec = { name: "dialog", selector: ".modal" };

export function folderOf(screen: ScreenSpec): readonly string[] {
  return screen.folder ?? [screen.id];
}

export const PANELS: readonly PanelSpec[] = [
  { name: "titlebar", selector: ".titlebar" },
  { name: "railbar", selector: ".rail" },
  { name: "explorer", selector: ".explorer" },
  { name: "tabbar", selector: ".tabbar" },
  { name: "crumbs", selector: ".crumbs" },
  { name: "toolbar", selector: ".editor .nv-bar" },
  { name: "content", selector: ".editor", below: ".nv-bar", aria: ".editor .nv-body" },
  { name: "inspector", selector: ".inspector" },
  { name: "statusbar", selector: ".statusbar", mask: ['[data-testid="statusbar-workspace"]'] },
];

const SELECTED_PANELS = ["content", "inspector"];

function libraryList(kind: string): ListSpec {
  return {
    toggle: { prototype: '#editor [data-act="lb-view"][data-v="list"]', app: `[data-testid="library-${kind}-view-list"]` },
    select: { prototype: '#editor tr[data-act="lb-sel"]', app: `[data-testid="library-${kind}-table-row"]` },
  };
}

export const SCREENS: readonly ScreenSpec[] = [
  {
    id: "images",
    open: { prototype: '#explorer [data-act="open"][data-id="images"]', app: '[data-testid="library-explorer-images"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-images-card-body"]' },
    list: libraryList("images"),
    preview: { prototype: '#editor [data-lb-open]', app: '[data-testid="library-images-card"]' },
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "sounds",
    open: { prototype: '#explorer [data-act="open"][data-id="sounds"]', app: '[data-testid="library-explorer-sounds"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-sounds-card-body"]' },
    list: libraryList("sounds"),
    preview: { prototype: '#editor [data-lb-open]', app: '[data-testid="library-sounds-card"]' },
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "videos",
    open: { prototype: '#explorer [data-act="open"][data-id="videos"]', app: '[data-testid="library-explorer-videos"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-videos-card-body"]' },
    list: libraryList("videos"),
    preview: { prototype: '#editor [data-lb-open]', app: '[data-testid="library-videos-card"]' },
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "prompts",
    open: { prototype: '#explorer [data-act="open"][data-id="prompts"]', app: '[data-testid="library-explorer-prompts"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-prompts-card-body"]' },
    list: libraryList("prompts"),
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "collections",
    open: { prototype: '#explorer [data-act="open"][data-id="collections"]', app: '[data-testid="library-explorer-taxonomy"]' },
    select: { prototype: '#editor tr[data-act="ct-sel"][data-k="col"]', app: '[data-testid^="library-collection-row-"]' },
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "collection",
    open: { prototype: '#explorer [data-act="lb-open-col"][data-id="COL-01"]', app: '[data-testid="library-explorer-collection-1"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-collection-assets-card-body"]' },
    selectedPanels: SELECTED_PANELS,
  },
];

export function panelsNamed(names: readonly string[]): PanelSpec[] {
  return PANELS.filter((panel) => names.includes(panel.name));
}

export const LIBRARY_SUITE: SuiteSpec = { id: "library", page: prototypeLibraryPage, rail: "library", panels: PANELS, screens: SCREENS };

const SAMPLE_NOVEL = { proto: "NOV-0001", app: "1" };

const OPEN_NOVELS = { prototype: '#explorer [data-act="open"][data-id="novels"]', app: '[data-testid="novel-explorer-management"]' };
const VIEW_LIST = { prototype: '#editor [data-act="nm-view"][data-v="list"]', app: '[data-testid="novel-list-view-list"]' };
const FIRST_CHAPTER = { prototype: '#editor tr[data-act="ch-open"][data-n="1"]', app: '[data-testid="novel-chapter-row"] >> nth=0' };

function openChapters(novel: { proto: string; app: string }): TargetSelectors {
  return {
    prototype: `#explorer [data-act="nx-open"][data-k="novel"][data-id="${novel.proto}"]`,
    app: `[data-testid="novel-explorer-group"][data-id="${novel.app}"] [data-testid="novel-explorer-chapters"]`,
  };
}

export const NOVEL_SCREENS: readonly ScreenSpec[] = [
  {
    id: "novels grid",
    folder: ["novels", "grid"],
    open: OPEN_NOVELS,
    select: { prototype: `#editor .nm-card[data-id="${SAMPLE_NOVEL.proto}"]`, app: `[data-testid="novel-list-card"][data-id="${SAMPLE_NOVEL.app}"]` },
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "novels list",
    folder: ["novels", "list"],
    open: OPEN_NOVELS,
    prepare: [VIEW_LIST],
    select: { prototype: `#editor [data-act="nm-sel"][data-id="${SAMPLE_NOVEL.proto}"]`, app: '[data-testid="novel-list-row"] >> nth=3' },
    selectedPanels: SELECTED_PANELS,
  },
  { id: "chapters", folder: ["novel", "chapters"], open: openChapters(SAMPLE_NOVEL), selectedPanels: SELECTED_PANELS },
  { id: "reader", folder: ["novel", "reader"], open: openChapters(SAMPLE_NOVEL), prepare: [FIRST_CHAPTER], selectedPanels: SELECTED_PANELS },
];

export const NOVEL_SUITE: SuiteSpec = { id: "novel", page: prototypeNovelPage, rail: "novels", panels: PANELS, screens: NOVEL_SCREENS };
