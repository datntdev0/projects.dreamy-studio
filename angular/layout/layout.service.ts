import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { RailId, RightTabId } from "./layout.models";
import { TabsService } from "./tabs.service";

@Injectable({ providedIn: "root" })
export class LayoutService {
  private readonly tabs = inject(TabsService);

  readonly rail = signal<RailId>("projects");
  readonly explorerOpen = signal(true);
  readonly inspectorOpen = signal(true);
  readonly bottomOpen = signal(false);
  readonly rightTab = signal<RightTabId>("inspector");
  readonly assistantActive = computed(this.isAssistantActive.bind(this));

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
}
