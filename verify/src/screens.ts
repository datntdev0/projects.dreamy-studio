export type Target = "prototype" | "app";

export type TargetSelectors = Readonly<Record<Target, string>>;

export interface PanelSpec {
  readonly name: string;
  readonly selector: string;
  readonly below?: string;
  readonly aria?: string;
  readonly mask?: readonly string[];
}

export interface ScreenSpec {
  readonly id: string;
  readonly open: TargetSelectors;
  readonly select: TargetSelectors;
  readonly selectedPanels: readonly string[];
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

export const SCREENS: readonly ScreenSpec[] = [
  {
    id: "images",
    open: { prototype: '#explorer [data-act="open"][data-id="images"]', app: '[data-testid="library-explorer-images"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-images-card-body"]' },
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "sounds",
    open: { prototype: '#explorer [data-act="open"][data-id="sounds"]', app: '[data-testid="library-explorer-sounds"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-sounds-card-body"]' },
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "videos",
    open: { prototype: '#explorer [data-act="open"][data-id="videos"]', app: '[data-testid="library-explorer-videos"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-videos-card-body"]' },
    selectedPanels: SELECTED_PANELS,
  },
  {
    id: "prompts",
    open: { prototype: '#explorer [data-act="open"][data-id="prompts"]', app: '[data-testid="library-explorer-prompts"]' },
    select: { prototype: '#editor [data-act="lb-sel"] .lb-card-b', app: '[data-testid="library-prompts-card-body"]' },
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
