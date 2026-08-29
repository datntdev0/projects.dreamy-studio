import { TestBed } from "@angular/core/testing";
import { clearMocks, mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopIpcError } from "./desktop-ipc-error";
import { DesktopIpcService } from "./desktop-ipc.service";

describe("DesktopIpcService", () => {
  afterEach(() => clearMocks());

  it("invokes commands", async () => {
    mockIPC((command, args) => (command === "cmd" ? (args as { a: number }).a + 1 : null));
    expect(await TestBed.inject(DesktopIpcService).invoke<number>("cmd", { a: 1 })).toBe(2);
  });

  it("wraps failures in DesktopIpcError", async () => {
    mockIPC(() => Promise.reject("nope"));
    const error = await TestBed.inject(DesktopIpcService).invoke("cmd").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DesktopIpcError);
    expect((error as DesktopIpcError).command).toBe("cmd");
    expect((error as DesktopIpcError).cause).toBe("nope");
    expect((error as DesktopIpcError).name).toBe("DesktopIpcError");
  });

  it("creates channels and media urls", () => {
    mockIPC(() => null);
    mockConvertFileSrc("windows");
    const ipc = TestBed.inject(DesktopIpcService);
    expect(ipc.channel(vi.fn())).toBeDefined();
    expect(ipc.mediaUrl("scheme", "a/b")).toContain("a%2Fb");
  });

  it("forwards drag and drop events", async () => {
    mockWindows("main");
    mockIPC(() => 1, { shouldMockEvents: true });
    const ipc = TestBed.inject(DesktopIpcService);
    const handler = vi.fn();
    const unlisten = await ipc.onDragDrop(handler);
    expect(typeof unlisten).toBe("function");
    unlisten();
  });

  it("returns a no-op unlisten when the webview is unavailable", async () => {
    clearMocks();
    const unlisten = await TestBed.inject(DesktopIpcService).onDragDrop(vi.fn());
    expect(unlisten()).toBeUndefined();
  });
});
