import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { PanelId, RailId, RightTabId } from "./layout.models";
import { TabsService } from "./tabs.service";

export const PANEL_LIMITS: Record<PanelId, { min: number; max: number; initial: number }> = {
  explorer: { min: 200, max: 420, initial: 264 },
  inspector: { min: 240, max: 480, initial: 320 },
  bottom: { min: 120, max: 520, initial: 200 },
};

const PANEL_SIZES_STORAGE_KEY = "ds.layout.panelSizes";
const STORED_PANEL_SIZES = readPanelSizes();

function readPanelSizes(): Partial<Record<PanelId, number>> {
  try {
    if (typeof localStorage === "undefined") {
      return {};
    }
    const raw = localStorage.getItem(PANEL_SIZES_STORAGE_KEY);
    const stored = raw === null ? null : JSON.parse(raw) as Partial<Record<PanelId, unknown>>;
    if (!stored) {
      return {};
    }
    const sizes: Partial<Record<PanelId, number>> = {};
    for (const panel of Object.keys(PANEL_LIMITS) as PanelId[]) {
      const size = stored[panel];
      if (typeof size === "number" && Number.isFinite(size)) {
        sizes[panel] = Math.max(PANEL_LIMITS[panel].min, Math.min(PANEL_LIMITS[panel].max, size));
      }
    }
    return sizes;
  } catch {
    return {};
  }
}

@Injectable({ providedIn: "root" })
export class LayoutService {
  private readonly tabs = inject(TabsService);

  readonly rail = signal<RailId>("projects");
  readonly explorerOpen = signal(true);
  readonly inspectorOpen = signal(true);
  readonly bottomOpen = signal(false);
  readonly explorerSize = signal(STORED_PANEL_SIZES.explorer ?? PANEL_LIMITS.explorer.initial);
  readonly inspectorSize = signal(STORED_PANEL_SIZES.inspector ?? PANEL_LIMITS.inspector.initial);
  readonly bottomSize = signal(STORED_PANEL_SIZES.bottom ?? PANEL_LIMITS.bottom.initial);
  readonly resizing = signal(false);
  readonly rightTab = signal<RightTabId>("inspector");
  readonly assistantActive = computed(this.isAssistantActive.bind(this));
  readonly panelLimits = PANEL_LIMITS;
  private readonly sizes = { explorer: this.explorerSize, inspector: this.inspectorSize, bottom: this.bottomSize };
  private resizingPanel: PanelId | null = null;
  private resizeStart = 0;
  private resizeSize = 0;

  constructor() {
    effect(this.syncRailWithActiveTab.bind(this));
  }

  isRailActive(id: RailId): boolean {
    return this.rail() === id && this.explorerOpen();
  }

  selectRail(id: RailId): void {
    if (this.isRailActive(id)) {
      this.explorerOpen.set(false);
      return;
    }
    this.rail.set(id);
    this.explorerOpen.set(true);
    this.openRailView(id);
  }

  toggleExplorer(): void {
    this.explorerOpen.set(!this.explorerOpen());
  }

  toggleInspector(): void {
    this.inspectorOpen.set(!this.inspectorOpen());
  }

  toggleBottom(): void {
    this.bottomOpen.set(!this.bottomOpen());
  }

  beginResize(panel: PanelId, event: PointerEvent): void {
    event.preventDefault();
    this.resizingPanel = panel;
    this.resizeStart = panel === "bottom" ? event.clientY : event.clientX;
    this.resizeSize = this.sizeOf(panel)();
    this.resizing.set(true);
  }

  resizeTo(event: PointerEvent): void {
    if (!this.resizingPanel) {
      return;
    }
    const coordinate = this.resizingPanel === "bottom" ? event.clientY : event.clientX;
    const direction = this.resizingPanel === "explorer" ? 1 : -1;
    this.setSize(this.resizingPanel, this.resizeSize + direction * (coordinate - this.resizeStart));
  }

  endResize(): void {
    this.resizingPanel = null;
    this.resizing.set(false);
  }

  handleResizeKey(panel: PanelId, event: KeyboardEvent): void {
    const step = event.shiftKey ? 40 : 10;
    let delta = 0;
    if (panel === "bottom" && event.key === "ArrowUp") {
      delta = step;
    }
    if (panel === "bottom" && event.key === "ArrowDown") {
      delta = -step;
    }
    if (panel === "explorer" && event.key === "ArrowRight") {
      delta = step;
    }
    if (panel === "explorer" && event.key === "ArrowLeft") {
      delta = -step;
    }
    if (panel === "inspector" && event.key === "ArrowLeft") {
      delta = step;
    }
    if (panel === "inspector" && event.key === "ArrowRight") {
      delta = -step;
    }
    if (event.key === "Home") {
      event.preventDefault();
      this.resetSize(panel);
      return;
    }
    if (!delta) {
      return;
    }
    event.preventDefault();
    this.setSize(panel, this.sizeOf(panel)() + delta);
  }

  resetSize(panel: PanelId): void {
    this.setSize(panel, PANEL_LIMITS[panel].initial);
  }

  toggleAssistant(): void {
    if (this.assistantActive()) {
      this.inspectorOpen.set(false);
      return;
    }
    this.rightTab.set("assistant");
    this.inspectorOpen.set(true);
  }

  selectRightTab(id: RightTabId): void {
    this.rightTab.set(id);
  }

  private openRailView(id: RailId): void {
    if (id === "projects") {
      this.tabs.openProjects();
    }
    if (id === "novels") {
      this.tabs.openNovels();
    }
  }

  private syncRailWithActiveTab(): void {
    const rail = this.tabs.active().rail;
    if (rail) {
      this.rail.set(rail);
    }
  }

  private isAssistantActive(): boolean {
    return this.inspectorOpen() && this.rightTab() === "assistant";
  }

  private sizeOf(panel: PanelId): typeof this.explorerSize {
    return this.sizes[panel];
  }

  private setSize(panel: PanelId, size: number): void {
    const limits = PANEL_LIMITS[panel];
    this.sizeOf(panel).set(Math.max(limits.min, Math.min(limits.max, size)));
    try {
      localStorage.setItem(PANEL_SIZES_STORAGE_KEY, JSON.stringify({ explorer: this.explorerSize(), inspector: this.inspectorSize(), bottom: this.bottomSize() }));
    } catch {
      return;
    }
  }
}
