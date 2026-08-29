import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { DialogService } from "@core/dialog/dialog.service";
import { TabsService } from "@layout/tabs.service";
import { setupWorld, warmWorld } from "@testing/world";
import { LibraryConfirmService } from "./library.confirm.service";

describe("LibraryConfirmService", () => {
  async function prepare() {
    const ipc = setupWorld();
    await warmWorld();
    return { ipc, confirms: TestBed.inject(LibraryConfirmService), dialogs: TestBed.inject(DialogService) };
  }

  async function accept(dialogs: DialogService, asking: Promise<boolean>): Promise<boolean> {
    await dialogs.accept();
    return asking;
  }

  it("deletes collections and closes their tab", async () => {
    const { ipc, confirms, dialogs } = await prepare();
    expect(await confirms.deleteCollection(99)).toBe(false);
    TestBed.inject(TabsService).openCollection(1, "Covers");
    expect(await accept(dialogs, confirms.deleteCollection(1))).toBe(true);
    expect(ipc.called("library_collection_delete")).toBe(1);
    expect(TestBed.inject(TabsService).tabs().some((tab) => tab.kind === "collection")).toBe(false);
    const empty = confirms.deleteCollection(2);
    expect(dialogs.current()?.options.warning).toBeTruthy();
    dialogs.cancel();
    await empty;
  });

  it("reports collection delete failures", async () => {
    const { ipc, confirms, dialogs } = await prepare();
    ipc.fail("library_collection_delete", { code: "io", detail: "x" });
    const asking = confirms.deleteCollection(1);
    await dialogs.accept();
    expect(dialogs.error()).not.toBeNull();
    dialogs.cancel();
    await asking;
  });

  it("deletes assets of every kind", async () => {
    const { ipc, confirms, dialogs } = await prepare();
    expect(await confirms.deleteImages([])).toBe(false);
    expect(await accept(dialogs, confirms.deleteImages([1]))).toBe(true);
    expect(await accept(dialogs, confirms.deleteImages([1, 2]))).toBe(true);
    expect(await accept(dialogs, confirms.deleteSounds([1]))).toBe(true);
    expect(await accept(dialogs, confirms.deleteVideos([1, 2]))).toBe(true);
    expect(await accept(dialogs, confirms.deletePrompts([1]))).toBe(true);
    expect(ipc.called("library_image_delete")).toBe(2);
    expect(ipc.called("library_prompt_delete")).toBe(1);
  });

  it("limits the image list and reports asset failures", async () => {
    const { ipc, confirms, dialogs } = await prepare();
    const many = confirms.deleteImages(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(dialogs.current()?.options.itemLimit).toBe(8);
    dialogs.cancel();
    await many;
    ipc.fail("library_sound_delete", { code: "sound_not_found", detail: "x" });
    const failing = confirms.deleteSounds([1]);
    await dialogs.accept();
    expect(dialogs.error()).not.toBeNull();
    dialogs.cancel();
    await failing;
  });

  it("confirms tag merges and deletions", async () => {
    const { ipc, confirms, dialogs } = await prepare();
    expect(await accept(dialogs, confirms.confirmTag("merge", "hero", "calm"))).toBe(true);
    expect(await accept(dialogs, confirms.confirmTag("delete", "hero", ""))).toBe(true);
    expect(await accept(dialogs, confirms.confirmTag("delete", "unknown", ""))).toBe(true);
    expect(ipc.called("library_tag_merge")).toBe(1);
    ipc.fail("library_tag_delete", { code: "io", detail: "x" });
    const failing = confirms.confirmTag("delete", "hero", "");
    await dialogs.accept();
    expect(dialogs.error()).not.toBeNull();
    dialogs.cancel();
    await failing;
  });
});
