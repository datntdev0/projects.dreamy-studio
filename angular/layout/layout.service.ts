import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { LayoutSettings } from "../app/features/settings/settings.models";
import { SettingsService } from "../app/features/settings/settings.service";
import { PanelId, RailId, RightTabId } from "./layout.models";
import { TabsService } from "./tabs.service";

export const PANEL_LIMITS: Record<PanelId, { min: number; max: number; initial: number }> = {
  explorer: { min: 200, max: 420, initial: 264 },
  inspector: { min: 240, max: 480, initial: 320 },
  bottom: { min: 120, max: 520, initial: 200 },
};

const SAVE_DELAY_MS = 300;

function clampSize(panel: PanelId, size: number | undefined): number {
  const limits = PANEL_LIMITS[panel];
  if (size === undefined || !Number.isFinite(size)) {
    return limits.initial;
  }
  return Math.max(limits.min, Math.min(limits.max, Math.round(size)));
}

@Injectable({ providedIn: "root" })
export class LayoutService {
  private readonly tabs = inject(TabsService);
  private readonly settings = inject(SettingsService);
  private readonly stored = this.settings.layout();

  readonly rail = signal<RailId>("projects");
  readonly explorerOpen = signal(this.stored.explorerOpen ?? true);
  readonly inspectorOpen = signal(this.stored.inspectorOpen ?? true);
  readonly bottomOpen = signal(this.stored.bottomOpen ?? false);
  readonly explorerSize = signal(clampSize("explorer", this.stored.explorerSize));
  readonly inspectorSize = signal(clampSize("inspector", this.stored.inspectorSize));
  readonly bottomSize = signal(clampSize("bottom", this.stored.bottomSize));
  readonly resizing = signal(false);
  readonly rightTab = signal<RightTabId>(this.stored.rightTab ?? "inspector");
  readonly assistantActive = computed(this.isAssistantActive.bind(this));
  readonly panelLimits = PANEL_LIMITS;
  private readonly sizes = { explorer: this.explorerSize, inspector: this.inspectorSize, bottom: this.bottomSize };
  private resizingPanel: PanelId | null = null;
  private resizeStart = 0;
  private resizeSize = 0;
  private savedLayout = JSON.stringify(this.snapshot());
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(this.syncRailWithActiveTab.bind(this));
    effect(this.scheduleSave.bind(this));
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
    if (id === "library") this.tabs.openCollections();
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
    this.sizeOf(panel).set(clampSize(panel, size));
  }

  private snapshot(): LayoutSettings {
    return {
      explorerOpen: this.explorerOpen(),
      inspectorOpen: this.inspectorOpen(),
      bottomOpen: this.bottomOpen(),
      rightTab: this.rightTab(),
      explorerSize: this.explorerSize(),
      inspectorSize: this.inspectorSize(),
      bottomSize: this.bottomSize(),
    };
  }

  private scheduleSave(): void {
    const layout = this.snapshot();
    untracked(this.queueSave.bind(this, layout));
  }

  private queueSave(layout: LayoutSettings): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (JSON.stringify(layout) !== this.savedLayout) {
      this.saveTimer = setTimeout(this.flushSave.bind(this, layout), SAVE_DELAY_MS);
    }
  }

  private flushSave(layout: LayoutSettings): void {
    this.saveTimer = null;
    this.savedLayout = JSON.stringify(layout);
    this.settings.saveLayout(layout);
  }
}
