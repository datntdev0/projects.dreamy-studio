import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsService } from "@features/settings/settings.service";
import { flushEffects, setupApp } from "@testing/service";
import { LayoutService, PANEL_LIMITS } from "./layout.service";
import { TabsService } from "./tabs.service";

function pointer(x: number, y: number): PointerEvent {
  return { clientX: x, clientY: y, preventDefault: vi.fn() } as unknown as PointerEvent;
}

function key(name: string, shiftKey = false): KeyboardEvent {
  return { key: name, shiftKey, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe("LayoutService", () => {
  let layout: LayoutService;
  let tabs: TabsService;

  beforeEach(() => {
    vi.useFakeTimers();
    setupApp();
    TestBed.inject(SettingsService).layout.set({ explorerSize: 9999, inspectorSize: Number.NaN, bottomOpen: true, rightTab: "assistant" });
    layout = TestBed.inject(LayoutService);
    tabs = TestBed.inject(TabsService);
    flushEffects();
  });

  afterEach(() => vi.useRealTimers());

  it("restores clamped stored sizes and flags", () => {
    expect(layout.explorerSize()).toBe(PANEL_LIMITS.explorer.max);
    expect(layout.inspectorSize()).toBe(PANEL_LIMITS.inspector.initial);
    expect(layout.bottomOpen()).toBe(true);
    expect(layout.rightTab()).toBe("assistant");
    expect(layout.assistantActive()).toBe(true);
  });

  it("selects rails and opens their views", () => {
    layout.selectRail("novels");
    expect(tabs.activeId()).toBe("novels");
    expect(layout.isRailActive("novels")).toBe(true);
    layout.selectRail("novels");
    expect(layout.explorerOpen()).toBe(false);
    layout.selectRail("projects");
    expect(tabs.activeId()).toBe("projects");
    layout.selectRail("library");
    expect(tabs.activeId()).toBe("collections");
    layout.selectRail("distribution");
    expect(layout.rail()).toBe("distribution");
  });

  it("syncs the rail with the active tab and hides the explorer for pipelines", () => {
    tabs.openNovels();
    flushEffects();
    expect(layout.rail()).toBe("novels");
    tabs.openPipelines();
    flushEffects();
    expect(layout.explorerVisible()).toBe(false);
  });

  it("toggles panels and tabs", () => {
    layout.toggleExplorer();
    layout.toggleInspector();
    layout.toggleBottom();
    expect(layout.explorerOpen()).toBe(false);
    expect(layout.inspectorOpen()).toBe(false);
    expect(layout.bottomOpen()).toBe(false);
    layout.showBottomTab("output");
    expect(layout.bottomTab()).toBe("output");
    expect(layout.bottomOpen()).toBe(true);
    layout.selectRightTab("inspector");
    layout.toggleAssistant();
    expect(layout.assistantActive()).toBe(true);
    layout.toggleAssistant();
    expect(layout.inspectorOpen()).toBe(false);
  });

  it("resizes with the pointer", () => {
    layout.resizeTo(pointer(10, 10));
    layout.beginResize("explorer", pointer(100, 0));
    expect(layout.resizing()).toBe(true);
    layout.resizeTo(pointer(80, 0));
    expect(layout.explorerSize()).toBe(PANEL_LIMITS.explorer.max - 20);
    layout.endResize();
    layout.beginResize("inspector", pointer(100, 0));
    layout.resizeTo(pointer(60, 0));
    expect(layout.inspectorSize()).toBe(PANEL_LIMITS.inspector.initial + 40);
    layout.endResize();
    layout.beginResize("bottom", pointer(0, 100));
    layout.resizeTo(pointer(0, 90));
    expect(layout.bottomSize()).toBe(PANEL_LIMITS.bottom.initial + 10);
    expect(layout.resizing()).toBe(true);
    layout.endResize();
    expect(layout.resizing()).toBe(false);
  });

  it("resizes with the keyboard", () => {
    const start = layout.bottomSize();
    layout.handleResizeKey("bottom", key("ArrowUp"));
    layout.handleResizeKey("bottom", key("ArrowDown", true));
    expect(layout.bottomSize()).toBe(start + 10 - 40);
    const explorer = layout.explorerSize();
    layout.handleResizeKey("explorer", key("ArrowLeft"));
    layout.handleResizeKey("explorer", key("ArrowRight"));
    expect(layout.explorerSize()).toBe(explorer);
    const inspector = layout.inspectorSize();
    layout.handleResizeKey("inspector", key("ArrowLeft"));
    layout.handleResizeKey("inspector", key("ArrowRight"));
    expect(layout.inspectorSize()).toBe(inspector);
    const ignored = key("x");
    layout.handleResizeKey("bottom", ignored);
    expect(ignored.preventDefault).not.toHaveBeenCalled();
    layout.handleResizeKey("bottom", key("Home"));
    expect(layout.bottomSize()).toBe(PANEL_LIMITS.bottom.initial);
  });

  it("saves layout changes after a debounce", async () => {
    const ipcSave = vi.spyOn(TestBed.inject(SettingsService), "saveLayout");
    layout.toggleExplorer();
    flushEffects();
    layout.toggleInspector();
    flushEffects();
    expect(ipcSave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(ipcSave).toHaveBeenCalledTimes(1);
    layout.toggleInspector();
    layout.toggleInspector();
    flushEffects();
    await vi.advanceTimersByTimeAsync(400);
    expect(ipcSave).toHaveBeenCalledTimes(1);
  });
});
