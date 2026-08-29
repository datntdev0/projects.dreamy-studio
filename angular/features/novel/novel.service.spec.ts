import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeIpc, setupIpc } from "@testing/fake-ipc";
import { chapter, novel } from "@testing/fixtures";
import { flushEffects, setupApp } from "@testing/service";
import { WorkspaceService } from "../workspace/workspace.service";
import { NovelService } from "./novel.service";

describe("NovelService", () => {
  let ipc: FakeIpc;
  let novels: NovelService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on("novel_list", [novel({ id: 1, title: "Alpha", tags: ["a", "b"], lang: "EN" }), novel({ id: 2, title: "Beta", tags: ["b"], lang: "VI", updatedAt: "2026-02-01T00:00:00Z" })]);
    novels = TestBed.inject(NovelService);
    flushEffects();
    await novels.load();
  });

  it("loads newest first and derives collections", () => {
    expect(novels.novels().map((item) => item.id)).toEqual([2, 1]);
    expect(novels.byId().size).toBe(2);
    expect(novels.allTags()[0]).toEqual({ tag: "b", count: 2 });
    expect(novels.langCounts()).toHaveLength(2);
    expect(novels.totals().novels).toBe(2);
    expect(novels.recent()).toHaveLength(2);
    expect(novels.isEmpty()).toBe(false);
    expect(novels.novelById(1)?.title).toBe("Alpha");
  });

  it("handles load failures and redundant loads", async () => {
    await novels.ensureLoaded();
    expect(ipc.called("novel_list")).toBe(1);
    ipc.fail("novel_list", { code: "x", detail: "y" });
    await novels.load();
    expect(novels.error()).toEqual({ code: "x", detail: "y" });
    novels.reset();
    await novels.ensureLoaded();
    expect(novels.loaded()).toBe(false);
  });

  it("filters, searches and selects", () => {
    novels.setQuery("alp");
    expect(novels.visible().map((item) => item.id)).toEqual([1]);
    novels.clearQueryAndFilters();
    novels.toggleTagFilter("a");
    novels.toggleLangFilter("EN");
    expect(novels.filterActive()).toBe(true);
    expect(novels.visible().map((item) => item.id)).toEqual([1]);
    novels.toggleTagFilter("gone");
    expect(novels.filters().tags).toEqual(["a"]);
    novels.clearFilters();
    expect(novels.filterActive()).toBe(false);
    novels.select(1);
    expect(novels.selectedId()).toBe(1);
    novels.select(99);
    expect(novels.selectedId()).toBeNull();
    novels.setChapterQuery("x");
    expect(novels.chapterQuery()).toBe("x");
    novels.toggleCollapsed(1);
    expect(novels.collapsedIds()).toEqual([1]);
    novels.toggleCollapsed(1);
    expect(novels.collapsedIds()).toEqual([]);
  });

  it("persists the view mode and restores it", () => {
    novels.setView("list");
    expect(localStorage.getItem("ds.nm.view")).toBe('"list"');
    TestBed.resetTestingModule();
    setupIpc();
    expect(TestBed.inject(NovelService).view()).toBe("list");
    TestBed.resetTestingModule();
    setupIpc();
    localStorage.setItem("ds.nm.view", "garbage");
    expect(TestBed.inject(NovelService).view()).toBe("grid");
  });

  it("creates, updates and removes novels", async () => {
    ipc.on("novel_create", novel({ id: 3, title: "Gamma" }));
    expect((await novels.create({ title: "Gamma", name: "", author: "", lang: "EN", description: "", tags: [] })).id).toBe(3);
    ipc.on("novel_update", novel({ id: 3, title: "G2", updatedAt: "2026-03-01T00:00:00Z" }));
    await novels.update(3, { title: "G2" });
    expect(novels.novelById(3)?.title).toBe("G2");
    novels.select(3);
    ipc.on("novel_delete", 1);
    expect(await novels.remove([3])).toBe(1);
    expect(novels.novelById(3)).toBeUndefined();
    expect(novels.selectedId()).toBeNull();
  });

  it("adds and removes tags", async () => {
    expect(await novels.addTag(99, "x")).toBe("missing");
    expect(await novels.addTag(1, "")).toBe("empty");
    expect(await novels.addTag(1, "a")).toBe("duplicate");
    ipc.on("novel_update", (args) => novel({ id: 1, tags: (args?.["patch"] as { tags: string[] }).tags }));
    expect(await novels.addTag(1, "New Tag")).toBe("added");
    expect(novels.novelById(1)?.tags).toContain("new-tag");
    await novels.removeTag(1, "a");
    expect(novels.novelById(1)?.tags).not.toContain("a");
    await novels.removeTag(99, "a");
  });

  it("detects duplicate titles", () => {
    expect(novels.isDuplicateTitle("alpha")).toBe(true);
    expect(novels.isDuplicateTitle("zzz")).toBe(false);
  });

  it("caches covers per update stamp", async () => {
    const first = novels.novelById(1)!;
    ipc.on("novel_cover_get", "data:cover");
    expect(novels.coverUrl(first)).toBeNull();
    novels.ensureCover(first);
    novels.ensureCover(first);
    await vi.waitFor(() => expect(novels.coverUrl(first)).toBe("data:cover"));
    novels.ensureCover(first);
    expect(ipc.called("novel_cover_get")).toBe(1);
    ipc.fail("novel_cover_get", "x");
    novels.ensureCover(novels.novelById(2)!);
    await vi.waitFor(() => expect(ipc.called("novel_cover_get")).toBe(2));
    ipc.on("novel_cover_set", novel({ id: 1, updatedAt: "2026-05-01T00:00:00Z" }));
    const set = await novels.setCover(1, "data:new");
    expect(novels.coverUrl(set)).toBe("data:new");
    ipc.on("novel_cover_clear", novel({ id: 1, updatedAt: "2026-06-01T00:00:00Z" }));
    const cleared = await novels.clearCover(1);
    expect(novels.coverUrl(cleared)).toBeNull();
  });

  it("carries covers across updates", async () => {
    const first = novels.novelById(1)!;
    ipc.on("novel_cover_get", "data:cover");
    novels.ensureCover(first);
    await vi.waitFor(() => expect(novels.coverUrl(first)).toBe("data:cover"));
    ipc.on("novel_update", novel({ id: 1, updatedAt: "2027-01-01T00:00:00Z" }));
    const next = await novels.update(1, { author: "x" });
    expect(novels.coverUrl(next)).toBe("data:cover");
  });

  it("manages chapters", async () => {
    const rows = [chapter({ id: "c1", seq: 1, wordCount: 5, translationStatus: "done" }), chapter({ id: "c2", seq: 2, wordCount: 7, analysisStatus: "done" })];
    ipc.on("novel_chapters", rows);
    expect(novels.chaptersOf(1)).toEqual([]);
    expect(await novels.loadChapters(1)).toEqual(rows);
    expect(novels.chaptersOf(1)).toEqual(rows);
    novels.applyChapterUpdate({ ...rows[0], wordCount: 50, updatedAt: "2027-01-01T00:00:00Z" });
    expect(novels.novelById(1)?.wordCount).toBe(57);
    novels.applyChapterUpdate(chapter({ id: "x", novelId: 77 }));
    ipc.on("novel_chapter_add", chapter({ id: "c3", seq: 3, wordCount: 3 }));
    await novels.addChapter(1, "New");
    expect(novels.novelById(1)?.chapterCount).toBe(3);
    ipc.on("novel_chapter_delete", [rows[1]]);
    await novels.deleteChapter(1, "c1");
    expect(novels.novelById(1)?.analyzedCount).toBe(1);
    ipc.on("novel_chapter_move", rows);
    await novels.moveChapter(1, "c2", 1);
    expect(novels.novelById(1)?.translatedCount).toBe(1);
    ipc.on("novel_chapter_add", chapter({ id: "c9", novelId: 55 }));
    await novels.addChapter(55, "ghost");
  });

  it("reads chapters", async () => {
    ipc.on("novel_chapter_read", [{ n: 1, text: "a", hashcheck: "h" }, { n: 2, text: "b", hashcheck: "h" }]);
    expect(await novels.paragraphCount(1, "c1")).toBe(2);
  });

  it("drives package import and export", async () => {
    ipc.on("novel_package_pick", "/x.dsnovel");
    ipc.on("novel_package_inspect", { title: "T" });
    ipc.on("novel_package_import", novel({ id: 8 }));
    ipc.on("novel_package_save_pick", "/y.dsnovel");
    ipc.on("novel_package_export", { path: "/y", chapterCount: 1 });
    expect(await novels.packagePick()).toBe("/x.dsnovel");
    const onEvent = vi.fn();
    await novels.packageInspect("/x", onEvent);
    expect(ipc.channel).toHaveBeenCalledWith(onEvent);
    expect((await novels.packageImport("/x", { title: "T", name: "", author: "", lang: "EN", description: "", tags: [] })).id).toBe(8);
    expect(novels.novelById(8)).toBeDefined();
    expect(await novels.packageSavePick("f")).toBe("/y.dsnovel");
    expect((await novels.packageExport(1, "/y")).chapterCount).toBe(1);
  });

  it("resets on workspace changes", async () => {
    ipc.on("workspace_current", { name: "w", path: "/w" });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    await vi.waitFor(() => expect(ipc.called("novel_list")).toBeGreaterThan(1));
  });
});
