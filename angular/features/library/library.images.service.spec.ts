import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeIpc } from "@testing/fake-ipc";
import { libraryImage } from "@testing/fixtures";
import { flushEffects, setupApp } from "@testing/service";
import { WorkspaceService } from "../workspace/workspace.service";
import { LibraryImageService } from "./library.images.service";
import { LibraryService } from "./library.service";

const counts = { image: 0, sound: 0, video: 0, prompt: 0 };

describe("LibraryImageService", () => {
  let ipc: FakeIpc;
  let images: LibraryImageService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on("library_collection_list", []);
    ipc.on("library_tag_list", []);
    ipc.on("library_summary", { assets: counts, unfiled: counts });
    ipc.on("library_image_list", [libraryImage({ id: 1, name: "a" }), libraryImage({ id: 2, name: "b", tags: ["t"], collectionId: 4 })]);
    images = TestBed.inject(LibraryImageService);
    flushEffects();
    await images.ensureLoaded();
  });

  it("loads images and derives visibility", async () => {
    await images.ensureLoaded();
    expect(ipc.called("library_image_list")).toBe(1);
    expect(images.items()).toHaveLength(2);
    images.query.set("b");
    expect(images.visible().map((item) => item.id)).toEqual([2]);
    images.query.set("");
    images.sort.set("name");
    expect(images.visible()[0].id).toBe(1);
    images.select(2);
    expect(images.selected()?.id).toBe(2);
    images.select(null);
    expect(images.selected()).toBeNull();
  });

  it("records load errors", async () => {
    TestBed.inject(WorkspaceService);
    ipc.fail("library_image_list", { code: "io", detail: "x" });
    (images as unknown as { reset(): void }).reset();
    await images.ensureLoaded();
    expect(images.error()).toEqual({ code: "io", detail: "x" });
  });

  it("proxies pick, inspect, read and view mode", async () => {
    ipc.on("library_image_pick", ["/a.png"]);
    ipc.on("library_image_inspect", [{ path: "/a.png", name: "a", size: 1, status: "ok" }]);
    ipc.on("library_image_read", "data:x");
    expect(await images.pick()).toEqual(["/a.png"]);
    expect(await images.inspect(["/a.png"])).toHaveLength(1);
    expect(await images.read(1)).toBe("data:x");
    images.setViewMode("list");
    expect(TestBed.inject(LibraryService).viewMode()).toBe("list");
  });

  it("uploads sequentially even after a failure", async () => {
    ipc.on("library_image_upload", (args) => libraryImage({ id: args?.["path"] === "/b" ? 4 : 3 }));
    ipc.fail("library_image_upload", "x");
    await expect(images.upload("/a", { tags: [], rights: "own" })).rejects.toBe("x");
    ipc.on("library_image_upload", libraryImage({ id: 9 }));
    expect((await images.upload("/b", { tags: [], rights: "own" })).id).toBe(9);
    expect(images.items()[0].id).toBe(9);
  });

  it("updates and removes", async () => {
    ipc.on("library_image_update", libraryImage({ id: 1, name: "renamed" }));
    await images.update(1, { name: "renamed" });
    expect(images.items().find((item) => item.id === 1)?.name).toBe("renamed");
    images.select(1);
    ipc.on("library_image_thumb", "data:thumb");
    images.thumb(1);
    ipc.on("library_image_delete", 1);
    expect(await images.remove([1])).toBe(1);
    expect(images.selectedId()).toBeNull();
    expect(images.items()).toHaveLength(1);
    await images.remove([2]);
  });

  it("caches thumbnails", async () => {
    ipc.on("library_image_thumb", "data:thumb");
    expect(images.thumb(2)).toBeNull();
    expect(images.thumb(2)).toBeNull();
    await vi.waitFor(() => expect(images.thumb(2)).toBe("data:thumb"));
    expect(ipc.called("library_image_thumb")).toBe(1);
    ipc.fail("library_image_thumb", "x");
    images.thumb(5);
    await vi.waitFor(() => expect(ipc.called("library_image_thumb")).toBe(2));
  });

  it("stores grid preferences", () => {
    images.setGridSize(200);
    images.setGridRatio("1/1");
    expect(localStorage.getItem("ds.lb.images.grid-size")).toBe("200");
    expect(images.gridRatio()).toBe("1/1");
  });

  it("reloads when the library revision changes", async () => {
    TestBed.inject(LibraryService).revision.update((value) => value + 1);
    flushEffects();
    await vi.waitFor(() => expect(ipc.called("library_image_list")).toBeGreaterThan(1));
  });

  it("resets with the workspace", async () => {
    ipc.on("workspace_current", { name: "w", path: "/w" });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    await vi.waitFor(() => expect(ipc.called("library_image_list")).toBeGreaterThan(1));
  });
});
