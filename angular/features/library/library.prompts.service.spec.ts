import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeIpc } from "@testing/fake-ipc";
import { libraryPrompt } from "@testing/fixtures";
import { flushEffects, setupApp } from "@testing/service";
import { WorkspaceService } from "../workspace/workspace.service";
import { LibraryService } from "./library.service";
import { LibraryPromptService } from "./library.prompts.service";

const counts = { image: 0, sound: 0, video: 0, prompt: 0 };

describe("LibraryPromptService", () => {
  let ipc: FakeIpc;
  let prompts: LibraryPromptService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on("library_collection_list", []);
    ipc.on("library_tag_list", []);
    ipc.on("library_summary", { assets: counts, unfiled: counts });
    ipc.on("library_prompt_list", [libraryPrompt({ id: 1, name: "a", text: "alpha" }), libraryPrompt({ id: 2, name: "b", text: "beta" })]);
    prompts = TestBed.inject(LibraryPromptService);
    flushEffects();
    await prompts.ensureLoaded();
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads, filters and selects", async () => {
    await prompts.ensureLoaded();
    expect(ipc.called("library_prompt_list")).toBe(1);
    prompts.query.set("beta");
    expect(prompts.visible().map((item) => item.id)).toEqual([2]);
    prompts.select(2);
    expect(prompts.selected()?.id).toBe(2);
    prompts.select(null);
    expect(prompts.selected()).toBeNull();
  });

  it("proxies commands and uploads", async () => {
    ipc.on("library_prompt_pick", ["/a.txt"]);
    ipc.on("library_prompt_inspect", []);
    expect(await prompts.pick()).toEqual(["/a.txt"]);
    expect(await prompts.inspect(["/a.txt"])).toEqual([]);
    ipc.fail("library_prompt_upload", "x");
    await expect(prompts.upload("/a", { tags: [], rights: "own" })).rejects.toBe("x");
    ipc.on("library_prompt_upload", libraryPrompt({ id: 7 }));
    await prompts.upload("/b", { tags: [], rights: "own" });
    expect(prompts.items()[0].id).toBe(7);
  });

  it("creates, updates and removes", async () => {
    ipc.on("library_prompt_create", libraryPrompt({ id: 8 }));
    await prompts.create({ name: "n", kind: "image", text: "t", tags: [], rights: "own" });
    expect(prompts.items()[0].id).toBe(8);
    ipc.on("library_prompt_update", libraryPrompt({ id: 1, name: "z" }));
    await prompts.update(1, { name: "z" });
    expect(prompts.items().find((item) => item.id === 1)?.name).toBe("z");
    prompts.select(1);
    ipc.on("library_prompt_delete", 1);
    await prompts.remove([1]);
    expect(prompts.selectedId()).toBeNull();
    await prompts.remove([2]);
  });

  it("copies prompt text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await prompts.copy(1)).toBe(true);
    expect(writeText).toHaveBeenCalledWith("alpha");
    expect(await prompts.copy(99)).toBe(false);
    writeText.mockRejectedValue(new Error("x"));
    expect(await prompts.copy(1)).toBe(false);
  });

  it("reloads on revision and workspace changes and reports errors", async () => {
    TestBed.inject(LibraryService).revision.update((value) => value + 1);
    flushEffects();
    await vi.waitFor(() => expect(ipc.called("library_prompt_list")).toBeGreaterThan(1));
    ipc.fail("library_prompt_list", { code: "io", detail: "x" });
    ipc.on("workspace_current", { name: "w", path: "/w" });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    await vi.waitFor(() => expect(prompts.error()).toEqual({ code: "io", detail: "x" }));
  });
});
