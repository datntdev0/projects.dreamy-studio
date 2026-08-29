import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceService } from "@features/workspace/workspace.service";
import { flushEffects, setupApp } from "@testing/service";
import { COLLECTIONS_TAB_ID, HOME_TAB_ID, collectionTabId, novelTabId, novelToolTabId, projectTabId } from "./layout.models";
import { TabsService } from "./tabs.service";

describe("TabsService", () => {
  let tabs: TabsService;

  beforeEach(() => {
    setupApp();
    tabs = TestBed.inject(TabsService);
    flushEffects();
  });

  it("starts on the home tab", () => {
    expect(tabs.tabs().map((tab) => tab.id)).toEqual([HOME_TAB_ID]);
    expect(tabs.isActive(HOME_TAB_ID)).toBe(true);
    expect(tabs.active().kind).toBe("home");
  });

  it("opens singleton tabs once and activates them", () => {
    tabs.openNovels();
    tabs.openProjects();
    tabs.openImages();
    tabs.openSounds();
    tabs.openVideos();
    tabs.openPrompts();
    tabs.openCollections();
    tabs.openPipelines();
    tabs.openNovels();
    expect(tabs.tabs()).toHaveLength(9);
    expect(tabs.activeId()).toBe("novels");
    tabs.openHome();
    expect(tabs.activeId()).toBe(HOME_TAB_ID);
    tabs.activate("nope");
    expect(tabs.activeId()).toBe(HOME_TAB_ID);
    expect(COLLECTIONS_TAB_ID).toBe("collections");
  });

  it("opens and renames novel tabs", () => {
    tabs.openNovel(1, "One");
    tabs.openNovelTool("translation", 1, "One");
    tabs.openNovelTool("knowledge", 1, "One");
    tabs.openNovel(1, "Renamed");
    tabs.openNovelTool("translation", 1, "Renamed2");
    expect(tabs.tabs().find((tab) => tab.id === novelTabId(1))?.title).toBe("Renamed2");
    expect(tabs.tabs().find((tab) => tab.id === novelToolTabId("knowledge", 1))?.title).toBe("Renamed2");
    tabs.closeNovels([1]);
    expect(tabs.tabs()).toHaveLength(1);
  });

  it("opens, renames and closes project and collection tabs", () => {
    tabs.openProject(2, "P");
    tabs.openProject(2, "P2", "mic");
    expect(tabs.tabs().find((tab) => tab.id === projectTabId(2))?.title).toBe("P2");
    tabs.renameProject(99, "x");
    tabs.openCollection(3, "C");
    tabs.openCollection(3, "C2");
    tabs.renameCollection(99, "x");
    expect(tabs.tabs().find((tab) => tab.id === collectionTabId(3))?.title).toBe("C2");
    tabs.closeCollection(3);
    tabs.closeProjects([2]);
    expect(tabs.tabs()).toHaveLength(1);
  });

  it("closes tabs and falls back to a neighbour", () => {
    tabs.openNovels();
    tabs.openProjects();
    tabs.close("projects");
    expect(tabs.activeId()).toBe("novels");
    tabs.close(HOME_TAB_ID);
    tabs.close("missing");
    expect(tabs.tabs()).toHaveLength(2);
    tabs.openProjects();
    tabs.activate("novels");
    tabs.close("projects");
    expect(tabs.activeId()).toBe("novels");
    tabs.reset();
    expect(tabs.tabs()).toHaveLength(1);
  });

  it("resets when the workspace changes", async () => {
    tabs.openNovels();
    TestBed.inject(WorkspaceService);
    (TestBed.inject(WorkspaceService) as unknown as { opened: { set(value: unknown): void } }).opened.set({ name: "w", path: "/w" });
    flushEffects();
    expect(tabs.tabs()).toHaveLength(1);
  });
});
