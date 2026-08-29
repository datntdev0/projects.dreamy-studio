import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeIpc, setupIpc } from "@testing/fake-ipc";
import { ToastService } from "@core/toast/toast.service";
import { LlmService, isReady } from "./llm.service";
import { LlmCliView, LlmProbe, LlmProvider, LlmView } from "./settings.models";

function cli(id: string, overrides: Partial<LlmCliView> = {}): LlmCliView {
  return { id, name: id, command: id, caps: ["translation"], profileEnv: null, profileDir: null, loginCommand: `${id} login`, canLogout: true, canDetectLogin: false, path: "", probe: null, ...overrides };
}

function probe(id: string, overrides: Partial<LlmProbe> = {}): LlmProbe {
  return { id, found: true, path: `/bin/${id}`, version: "1.0", ok: true, signedIn: true, account: "me", error: "", latencyMs: 12, checkedAtMs: 1_700_000_000_000, ...overrides };
}

function view(providers: LlmCliView[]): LlmView {
  return { providers, features: [{ id: "translation", provider: "claude", model: "opus", effort: "low", args: "" }] };
}

describe("LlmService", () => {
  let ipc: FakeIpc;
  let llm: LlmService;
  let toasts: ToastService;

  beforeEach(() => {
    ipc = setupIpc();
    ipc.on("llm_get", view([cli("claude", { canDetectLogin: true }), cli("codex", { probe: probe("codex") })]));
    llm = TestBed.inject(LlmService);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it("evaluates readiness", () => {
    const base = { found: true, status: "ok", signedIn: true } as LlmProvider;
    expect(isReady(base)).toBe(true);
    expect(isReady({ ...base, found: false })).toBe(false);
    expect(isReady({ ...base, status: "error" })).toBe(false);
    expect(isReady({ ...base, signedIn: false })).toBe(false);
    expect(isReady({ ...base, signedIn: null })).toBe(true);
  });

  it("loads providers, applying existing probes", async () => {
    await llm.load();
    expect(llm.providers().map((provider) => provider.id)).toEqual(["claude", "codex"]);
    expect(llm.providers()[0].status).toBe("none");
    expect(llm.providers()[1].status).toBe("ok");
    expect(llm.features()).toHaveLength(1);
  });

  it("warns when loading fails", async () => {
    ipc.fail("llm_get", "x");
    await llm.load();
    expect(toasts.items()[0].tone).toBe("danger");
  });

  it("checks a provider and maps the probe outcome", async () => {
    await llm.load();
    ipc.on("llm_probe", probe("claude", { ok: false, error: "bad" }));
    await llm.check("claude");
    expect(llm.providers()[0].status).toBe("error");
    expect(llm.providers()[0].signedIn).toBeNull();
    ipc.on("llm_probe", probe("claude", { found: false }));
    await llm.check("claude");
    expect(llm.providers()[0].status).toBe("none");
    await llm.check("missing");
  });

  it("records a failed probe", async () => {
    await llm.load();
    ipc.fail("llm_probe", new Error("x"));
    await llm.check("claude");
    expect(llm.providers()[0].status).toBe("error");
    expect(llm.providers()[0].error).not.toBe("");
    ipc.fail("llm_probe", "plain");
    await llm.check("claude");
    expect(llm.providers()[0].error).toBe("plain");
  });

  it("skips a check while one is running", async () => {
    await llm.load();
    llm.providers.update((list) => list.map((item) => ({ ...item, status: "checking" as const })));
    await llm.check("claude");
    expect(ipc.called("llm_probe")).toBe(0);
  });

  it("saves a changed path and re-checks it", async () => {
    await llm.load();
    ipc.on("llm_probe", probe("claude"));
    await llm.setPath("claude", "  /opt/claude  ");
    expect(ipc.lastArgs("llm_provider_save")).toEqual({ id: "claude", provider: { path: "/opt/claude" } });
    expect(llm.providers()[0].status).toBe("ok");
    await llm.setPath("claude", "/opt/claude");
    expect(ipc.called("llm_provider_save")).toBe(1);
    await llm.setPath("missing", "x");
  });

  it("treats the resolved path as an unset override", async () => {
    await llm.load();
    ipc.on("llm_probe", probe("claude"));
    await llm.check("claude");
    await llm.setPath("claude", "/bin/claude");
    expect(ipc.called("llm_provider_save")).toBe(0);
  });

  it("warns when saving the path fails", async () => {
    await llm.load();
    ipc.fail("llm_provider_save", "x");
    await llm.setPath("claude", "/opt/x");
    expect(toasts.items()[0].tone).toBe("danger");
    expect(ipc.called("llm_probe")).toBe(0);
  });

  it("saves feature changes and rolls back on failure", async () => {
    await llm.load();
    await llm.setFeature("translation", { model: "sonnet" });
    expect(llm.features()[0].model).toBe("sonnet");
    ipc.fail("llm_feature_save", "x");
    await llm.setFeature("translation", { model: "haiku" });
    expect(llm.features()[0].model).toBe("sonnet");
    expect(toasts.items()[0].tone).toBe("danger");
    await llm.setFeature("knowledge", { model: "x" });
  });

  it("logs in and polls until signed in", async () => {
    vi.useFakeTimers();
    await llm.load();
    ipc.on("llm_probe", probe("claude", { signedIn: false }));
    const pending = llm.login("claude");
    await vi.advanceTimersByTimeAsync(3000);
    expect(llm.providers()[0].signing).toBe(true);
    ipc.on("llm_probe", probe("claude", { signedIn: true }));
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    expect(llm.providers()[0].signing).toBe(false);
    expect(llm.providers()[0].signedIn).toBe(true);
  });

  it("stops polling when sign-in is cancelled or probing fails", async () => {
    vi.useFakeTimers();
    await llm.load();
    ipc.fail("llm_probe", "x");
    const pending = llm.login("claude");
    await vi.advanceTimersByTimeAsync(3000);
    llm.providers.update((list) => list.map((item) => ({ ...item, signing: false })));
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    expect(llm.providers()[0].signing).toBe(false);
  });

  it("gives up polling after the limit", async () => {
    vi.useFakeTimers();
    await llm.load();
    ipc.on("llm_probe", probe("claude", { signedIn: false }));
    const pending = llm.login("claude");
    await vi.advanceTimersByTimeAsync(3000 * 101);
    await pending;
    expect(llm.providers()[0].signing).toBe(false);
  });

  it("reports login failures and ignores unknown or busy providers", async () => {
    await llm.load();
    ipc.fail("llm_login", "denied");
    await llm.login("claude");
    expect(toasts.items()[0].message).toBe("denied");
    await llm.login("missing");
    llm.providers.update((list) => list.map((item) => ({ ...item, signing: true })));
    await llm.login("claude");
    expect(ipc.called("llm_login")).toBe(1);
  });

  it("does not poll for providers that cannot detect login", async () => {
    await llm.load();
    await llm.login("codex");
    expect(llm.providers()[1].signing).toBe(false);
  });

  it("logs out and re-checks, reporting failures", async () => {
    await llm.load();
    ipc.on("llm_probe", probe("claude"));
    await llm.logout("claude");
    expect(ipc.called("llm_logout")).toBe(1);
    ipc.fail("llm_logout", "no");
    await llm.logout("claude");
    expect(toasts.items()).toHaveLength(1);
    await llm.logout("missing");
  });

  it("opens profiles and copies paths", async () => {
    await llm.load();
    await llm.openProfile("claude");
    ipc.fail("llm_profile_open", "x");
    await llm.openProfile("claude");
    expect(toasts.items()[0].tone).toBe("danger");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await llm.copyPath("claude");
    expect(writeText).toHaveBeenCalled();
    writeText.mockRejectedValue(new Error("x"));
    await llm.copyPath("claude");
    expect(toasts.items().at(-1)?.tone).toBe("warning");
    await llm.copyPath("missing");
  });
});
