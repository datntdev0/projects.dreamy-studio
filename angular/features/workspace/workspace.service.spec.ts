import { TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopIpcError } from "@core/desktop/desktop-ipc-error";
import { FakeIpc, setupIpc } from "@testing/fake-ipc";
import { homeGuard } from "./workspace.guard";
import { WorkspaceService } from "./workspace.service";
import { LoadEvent } from "./workspace.models";

describe("WorkspaceService", () => {
  let ipc: FakeIpc;
  let workspace: WorkspaceService;
  let router: Router;

  beforeEach(() => {
    ipc = setupIpc();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    ipc.on("settings_get", { general: {}, layout: {}, dataDir: "", file: "" });
    ipc.on("llm_get", { providers: [], features: [] });
    ipc.on("workspace_load", { result: "ready", name: "n", path: "/p", mode: "open" });
    ipc.on("workspace_enter", { result: "entered", name: "n", path: "/p" });
    workspace = TestBed.inject(WorkspaceService);
    router = TestBed.inject(Router);
    vi.spyOn(router, "navigateByUrl").mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  it("forwards simple commands", async () => {
    ipc.on("app_info", { name: "a", version: "1" });
    ipc.on("recent_list", []);
    ipc.on("workspace_measure", 5);
    ipc.on("folder_pick", "/x");
    ipc.on("workspace_is_current", true);
    expect(await workspace.appInfo()).toEqual({ name: "a", version: "1" });
    expect(await workspace.recentList()).toEqual([]);
    expect(await workspace.measure("/p")).toBe(5);
    await workspace.workspaceDelete("/p");
    expect(await workspace.folderPick()).toBe("/x");
    expect(await workspace.isCurrentPath("/p")).toBe(true);
  });

  it("toggles the switch dialog", () => {
    workspace.openSwitchDialog();
    expect(workspace.switchDialogOpen()).toBe(true);
    workspace.closeSwitchDialog();
    expect(workspace.switchDialogOpen()).toBe(false);
  });

  it("loads, enters and navigates home", async () => {
    await workspace.start({ path: "C:\\work\\demo\\" });
    expect(workspace.current()).toEqual({ name: "n", path: "/p" });
    expect(router.navigateByUrl).toHaveBeenCalledWith("/home");
    expect(workspace.state()).toBeNull();
  });

  it("reduces load events into the state", async () => {
    ipc.on("workspace_load", async (args) => {
      const channel = args?.["channel"] as { onmessage: (event: LoadEvent) => void };
      channel.onmessage({ kind: "started", mode: "create", name: "N", path: "/q" });
      channel.onmessage({ kind: "step", id: "backend", state: "done" });
      channel.onmessage({ kind: "progress", percent: 40 });
      expect(workspace.state()?.percent).toBe(40);
      expect(workspace.state()?.mode).toBe("create");
      expect(workspace.state()?.steps[1].state).toBe("done");
      return { result: "cancelled" };
    });
    await workspace.start({ path: "/q" });
    expect(workspace.state()).toBeNull();
  });

  it("clears the state when the load is cancelled or entering is cancelled", async () => {
    ipc.on("workspace_enter", { result: "cancelled" });
    await workspace.start({ path: "/p" });
    expect(workspace.state()).toBeNull();
    expect(workspace.current()).toBeNull();
  });

  it("reports load failures with a structured error", async () => {
    vi.useFakeTimers();
    ipc.fail("workspace_load", new DesktopIpcError("workspace_load", { step: "workspace", code: "db_corrupt", detail: "bad" }));
    const pending = workspace.start({ path: "/p" });
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(workspace.notice()).toContain("bad");
    expect(workspace.state()).toBeNull();
  });

  it("omits details for codes without detail and falls back for unknown errors", async () => {
    vi.useFakeTimers();
    ipc.fail("workspace_load", { step: "workspace", code: "folder_missing", detail: "hidden" });
    let pending = workspace.start({ path: "/p" });
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(workspace.notice()).not.toContain("hidden");
    ipc.fail("workspace_load", "weird");
    pending = workspace.start({ path: "/p" });
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(workspace.notice()).toContain("weird");
  });

  it("publishes switch failures on the switch notice", async () => {
    vi.useFakeTimers();
    ipc.fail("workspace_load", "x");
    const pending = workspace.switchTo({ path: "/p" });
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(workspace.switchNotice()).not.toBeNull();
    expect(workspace.notice()).toBeNull();
  });

  it("fails when entering throws", async () => {
    vi.useFakeTimers();
    ipc.fail("workspace_enter", "x");
    const pending = workspace.start({ path: "/p" });
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(workspace.notice()).not.toBeNull();
  });

  it("discards a stale ready outcome by cancelling it", async () => {
    let release: (value: unknown) => void = () => undefined;
    ipc.on("workspace_load", () => new Promise((resolve) => (release = resolve)));
    ipc.on("workspace_cancel", { result: "cancelled" });
    const pending = workspace.start({ path: "/p" });
    await Promise.resolve();
    workspace.state.set(null);
    workspace.run.set(99);
    release({ result: "ready", name: "n", path: "/p", mode: "open" });
    await pending;
    expect(ipc.called("workspace_cancel")).toBe(1);
  });

  it("ignores stale outcomes while a newer run is active and tolerates cancel failure", async () => {
    let release: (value: unknown) => void = () => undefined;
    ipc.on("workspace_load", () => new Promise((resolve) => (release = resolve)));
    ipc.fail("workspace_cancel", "x");
    const pending = workspace.start({ path: "/p" });
    await Promise.resolve();
    workspace.state.set(null);
    workspace.run.set(99);
    release({ result: "ready", name: "n", path: "/p", mode: "open" });
    await pending;
    release({ result: "cancelled" });
    expect(workspace.state()).toBeNull();
  });

  it("cancels a load", async () => {
    ipc.on("workspace_cancel", { result: "cancelled" });
    await workspace.cancel();
    ipc.fail("workspace_cancel", "x");
    await workspace.cancel();
    expect(workspace.state()).toBeNull();
  });

  it("enters the workspace when cancel races with completion", async () => {
    ipc.on("workspace_cancel", { result: "already_entered" });
    ipc.on("workspace_current", { name: "n", path: "/p" });
    await workspace.start({ path: "/p" });
    await workspace.cancel();
    expect(router.navigateByUrl).toHaveBeenCalled();
    ipc.on("workspace_current", null);
    await workspace.cancel();
    expect(workspace.state()).toBeNull();
  });

  it("handles cancel races for switches", async () => {
    ipc.on("workspace_cancel", { result: "already_entered" });
    ipc.on("workspace_current", { name: "n", path: "/other" });
    ipc.on("workspace_load", () => new Promise(() => undefined));
    void workspace.switchTo({ path: "/other" });
    await Promise.resolve();
    await workspace.cancel();
    expect(router.navigateByUrl).toHaveBeenCalledWith("/home");
    ipc.on("workspace_load", () => new Promise(() => undefined));
    ipc.on("workspace_current", { name: "n", path: "/other" });
    void workspace.switchTo({ path: "/third" });
    await Promise.resolve();
    ipc.fail("workspace_current", "x");
    await workspace.cancel();
    expect(workspace.state()).toBeNull();
  });

  it("clears the state when the switch race resolves to the previous workspace", async () => {
    await workspace.restoreCurrent().catch(() => undefined);
    ipc.on("workspace_current", { name: "n", path: "/prev" });
    await workspace.restoreCurrent();
    ipc.on("workspace_cancel", { result: "already_entered" });
    ipc.on("workspace_load", () => new Promise(() => undefined));
    void workspace.switchTo({ path: "/next" });
    await Promise.resolve();
    await workspace.cancel();
    expect(workspace.state()).toBeNull();
  });

  describe("homeGuard", () => {
    it("allows an open workspace", async () => {
      await workspace.restoreCurrent();
      ipc.on("workspace_current", { name: "n", path: "/p" });
      await workspace.restoreCurrent();
      expect(await TestBed.runInInjectionContext(() => homeGuard({} as never, {} as never))).toBe(true);
    });

    it("restores the current workspace from the backend", async () => {
      ipc.on("workspace_current", { name: "n", path: "/p" });
      expect(await TestBed.runInInjectionContext(() => homeGuard({} as never, {} as never))).toBe(true);
      expect(workspace.current()).toEqual({ name: "n", path: "/p" });
    });

    it("redirects when nothing can be restored", async () => {
      const fresh = TestBed.inject(WorkspaceService);
      fresh.restoreCurrent = vi.fn().mockResolvedValue(null);
      Object.defineProperty(fresh, "current", { value: () => null });
      const result = await TestBed.runInInjectionContext(() => homeGuard({} as never, {} as never));
      expect(String(result)).toBe("/");
      fresh.restoreCurrent = vi.fn().mockRejectedValue(new Error("x"));
      expect(String(await TestBed.runInInjectionContext(() => homeGuard({} as never, {} as never)))).toBe("/");
    });
  });
});
