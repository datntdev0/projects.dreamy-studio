import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeIpc, setupIpc } from "@testing/fake-ipc";
import { project } from "@testing/fixtures";
import { WorkspaceService } from "../workspace/workspace.service";
import { ProjectService } from "./project.service";

describe("ProjectService", () => {
  let ipc: FakeIpc;
  let projects: ProjectService;

  beforeEach(async () => {
    localStorage.clear();
    ipc = setupIpc();
    ipc.on("settings_get", { general: {}, layout: {}, dataDir: "", file: "" });
    ipc.on("llm_get", { providers: [], features: [] });
    ipc.on("project_list", [project({ id: 1, name: "Alpha", template: "audiobook", openedAt: "2026-01-03" }), project({ id: 2, name: "Beta", template: "blank", archived: true, openedAt: "2026-01-04" })]);
    projects = TestBed.inject(ProjectService);
    TestBed.tick();
    await projects.load();
  });

  it("loads projects and derives collections", () => {
    expect(projects.loaded()).toBe(true);
    expect(projects.projects()).toHaveLength(2);
    expect(projects.totals()).toEqual({ projects: 2, active: 1, archived: 1 });
    expect(projects.recent()[0].id).toBe(2);
    expect(projects.isEmpty()).toBe(false);
    expect(projects.templateCounts().find((row) => row.template === "blank")?.count).toBe(1);
    expect(projects.statusCounts()).toEqual([{ status: "active", count: 1 }, { status: "archived", count: 1 }]);
    expect(projects.projectById(1)?.name).toBe("Alpha");
    expect(projects.projectById(9)).toBeUndefined();
  });

  it("records load failures and skips redundant loads", async () => {
    await projects.ensureLoaded();
    expect(ipc.called("project_list")).toBe(1);
    ipc.fail("project_list", { code: "x", detail: "y" });
    await projects.load();
    expect(projects.error()).toEqual({ code: "x", detail: "y" });
    expect(projects.loading()).toBe(false);
  });

  it("filters, sorts and clears", () => {
    projects.setQuery("alp");
    expect(projects.visible().map((item) => item.id)).toEqual([1]);
    projects.clearQueryAndFilters();
    projects.toggleTemplateFilter("blank");
    projects.toggleStatusFilter("archived");
    expect(projects.filterActive()).toBe(true);
    expect(projects.visible().map((item) => item.id)).toEqual([2]);
    projects.toggleTemplateFilter("filmseries");
    expect(projects.filters().templates).toEqual(["blank"]);
    projects.clearFilters();
    expect(projects.filterActive()).toBe(false);
    projects.setSort("name");
    expect(projects.visible()[0].name).toBe("Alpha");
  });

  it("persists the view mode", () => {
    projects.setView("list");
    expect(localStorage.getItem("ds.pj.view")).toBe('"list"');
    expect(projects.view()).toBe("list");
  });

  it("selects and prunes selection", async () => {
    projects.selectOnly(1);
    expect(projects.selectedId()).toBe(1);
    projects.selectOnly(99);
    expect(projects.selectedId()).toBeNull();
    projects.selectOnly(1);
    projects.clearSelection();
    expect(projects.selectedId()).toBeNull();
    projects.selectOnly(1);
    ipc.on("project_list", [project({ id: 2 })]);
    await projects.load();
    expect(projects.selectedId()).toBeNull();
  });

  it("creates, updates, archives, opens and removes", async () => {
    ipc.on("project_create", project({ id: 3, name: "New" }));
    expect((await projects.create({ name: "New", template: "blank", description: "", novelId: null, srcKind: null, rangeFrom: null, rangeTo: null })).id).toBe(3);
    ipc.on("project_update", project({ id: 3, name: "Renamed" }));
    await projects.update(3, { name: "Renamed" });
    expect(projects.projectById(3)?.name).toBe("Renamed");
    await projects.setArchived([3], true);
    expect(projects.projectById(3)?.archived).toBe(true);
    ipc.on("project_open", project({ id: 3, name: "Opened" }));
    await projects.open(3);
    expect(projects.projectById(3)?.name).toBe("Opened");
    projects.selectOnly(3);
    ipc.on("project_delete", 1);
    expect(await projects.remove([3])).toBe(1);
    expect(projects.projectById(3)).toBeUndefined();
    expect(projects.selectedId()).toBeNull();
    await projects.folderOpen(1);
    expect(ipc.called("project_folder_open")).toBe(1);
  });

  it("keeps the selection when removing another project", async () => {
    projects.selectOnly(1);
    ipc.on("project_delete", 1);
    await projects.remove([2]);
    expect(projects.selectedId()).toBe(1);
  });

  it("detects duplicate names", () => {
    expect(projects.isDuplicateName(" alpha ")).toBe(true);
    expect(projects.isDuplicateName("alpha", 1)).toBe(false);
    expect(projects.isDuplicateName("  ")).toBe(false);
    expect(projects.isDuplicateName("gamma")).toBe(false);
  });

  it("caches covers", async () => {
    ipc.on("project_cover_get", "data:image/png;base64,AA");
    expect(projects.coverUrl(1)).toBeNull();
    projects.ensureCover(1);
    projects.ensureCover(1);
    await vi.waitFor(() => expect(projects.coverUrl(1)).toBe("data:image/png;base64,AA"));
    projects.ensureCover(1);
    expect(ipc.called("project_cover_get")).toBe(1);
    ipc.fail("project_cover_get", "x");
    projects.ensureCover(2);
    await vi.waitFor(() => expect(ipc.called("project_cover_get")).toBe(2));
    ipc.on("project_cover_set", project({ id: 1 }));
    await projects.setCover(1, "data:x");
    expect(projects.coverUrl(1)).toBe("data:x");
    ipc.on("project_cover_clear", project({ id: 1 }));
    await projects.clearCover(1);
    expect(projects.coverUrl(1)).toBeNull();
  });

  it("loads and caches directory listings", async () => {
    ipc.on("project_dir_list", [{ name: "b", kind: "file", size: 1 }, { name: "a", kind: "dir", size: 0 }]);
    expect(projects.dirEntries(1, "")).toEqual([]);
    const [first, second] = await Promise.all([projects.ensureDir(1, ""), projects.ensureDir(1, "")]);
    expect(first[0].name).toBe("a");
    expect(second).toEqual(first);
    expect(projects.dirEntries(1, "").length).toBe(2);
    expect((await projects.ensureDir(1, "")).length).toBe(2);
    expect(ipc.called("project_dir_list")).toBe(1);
    ipc.fail("project_dir_list", { code: "x", detail: "y" });
    expect(await projects.ensureDir(1, "sub")).toEqual([]);
    expect(projects.error()?.code).toBe("x");
  });

  it("toggles and refreshes the tree", async () => {
    ipc.on("project_dir_list", []);
    await projects.ensureDir(1, "");
    await projects.ensureDir(2, "");
    projects.toggleExpanded("1:a");
    projects.toggleExpanded("2:b");
    expect(projects.isExpanded("1:a")).toBe(true);
    projects.refreshTree(1);
    expect(projects.expandedKeys()).toEqual(["1:a"]);
    projects.refreshTree();
    expect(projects.expandedKeys()).toEqual([]);
    projects.toggleExpanded("2:b");
    projects.toggleExpanded("2:b");
    expect(projects.isExpanded("2:b")).toBe(false);
  });

  it("resets when the workspace changes", async () => {
    ipc.on("workspace_current", { name: "w", path: "/w" });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    TestBed.tick();
    await vi.waitFor(() => expect(ipc.called("project_list")).toBeGreaterThan(1));
    projects.reset();
    expect(projects.loaded()).toBe(false);
    expect(projects.projects()).toEqual([]);
  });
});
