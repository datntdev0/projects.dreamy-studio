import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeIpc, setupIpc } from "@testing/fake-ipc";
import { LanguageService } from "@core/language/language.service";
import { ThemeService } from "@core/theme/theme.service";
import { ToastService } from "@core/toast/toast.service";
import { CLOUD_PROVIDERS, MODEL_SUGGESTIONS } from "./llm.providers";
import { provideSettings } from "./settings.provider";
import { SETTINGS_SECTIONS } from "./settings.sections";
import { SettingsService } from "./settings.service";

describe("SettingsService", () => {
  let ipc: FakeIpc;
  let settings: SettingsService;

  beforeEach(() => {
    localStorage.clear();
    ipc = setupIpc();
    ipc.on("settings_get", { general: { language: "en", theme: "light", pipelines: { maxPipelines: 3, maxTasks: 99 } }, layout: { explorerOpen: true }, dataDir: "/data", file: "/data/s.json" });
    ipc.on("llm_get", { providers: [], features: [] });
    settings = TestBed.inject(SettingsService);
  });

  it("exposes static catalogs", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toContain("llm");
    expect(CLOUD_PROVIDERS.length).toBeGreaterThan(0);
    expect(MODEL_SUGGESTIONS["claude"]).toContain("opus");
  });

  it("loads and applies general settings with clamping", async () => {
    await settings.load();
    expect(settings.dataDir()).toBe("/data");
    expect(settings.file()).toBe("/data/s.json");
    expect(settings.layout()).toEqual({ explorerOpen: true });
    expect(TestBed.inject(LanguageService).language()).toBe("en");
    expect(TestBed.inject(ThemeService).theme()).toBe("light");
    expect(settings.maxPipelines()).toBe(3);
    expect(settings.maxTasks()).toBe(10);
    expect(ipc.lastArgs("window_background_set")).toEqual({ theme: "light" });
  });

  it("falls back to defaults for missing values", async () => {
    ipc.on("settings_get", { general: { pipelines: { maxPipelines: Number.NaN } }, dataDir: "", file: "" });
    await settings.load();
    expect(settings.maxPipelines()).toBe(1);
    expect(settings.maxTasks()).toBe(5);
    expect(settings.layout()).toEqual({});
  });

  it("keeps defaults when loading fails", async () => {
    ipc.fail("settings_get", "x");
    await settings.load();
    expect(settings.dataDir()).toBe("");
  });

  it("opens, closes and selects sections", () => {
    settings.openDialog("llm");
    expect(settings.open()).toBe(true);
    expect(settings.section()).toBe("llm");
    settings.selectSection("tts");
    settings.closeDialog();
    expect(settings.open()).toBe(false);
    settings.openDialog();
    expect(settings.section()).toBe("general");
  });

  it("persists language, theme and limits", async () => {
    settings.setLanguage("en");
    settings.setTheme("light");
    settings.setMaxPipelines(0);
    settings.setMaxTasks(4.4);
    await settings.load();
    expect(ipc.called("settings_general_save")).toBeGreaterThan(0);
    expect(settings.maxPipelines()).toBeGreaterThanOrEqual(1);
  });

  it("warns when saving general settings fails", async () => {
    ipc.fail("settings_general_save", "x");
    settings.setMaxTasks(3);
    await settings.load();
    expect(TestBed.inject(ToastService).items().some((item) => item.tone === "danger")).toBe(true);
  });

  it("saves the layout and tolerates failures", async () => {
    settings.saveLayout({ bottomOpen: true });
    ipc.fail("settings_layout_save", "x");
    settings.saveLayout({ bottomOpen: false });
    await settings.load();
    expect(ipc.called("settings_layout_save")).toBe(2);
    expect(settings.layout()).toEqual({ explorerOpen: true });
  });

  it("opens folders and warns on failure", async () => {
    await settings.openFolder("workspace");
    expect(ipc.lastArgs("settings_folder_open")).toEqual({ target: "workspace" });
    ipc.fail("settings_folder_open", "x");
    await settings.openFolder("appData");
    expect(TestBed.inject(ToastService).items()).toHaveLength(1);
  });

  it("ignores background sync failures", async () => {
    ipc.fail("window_background_set", "x");
    await settings.load();
    expect(settings.dataDir()).toBe("/data");
  });

  it("loads through the app initializer", async () => {
    TestBed.resetTestingModule();
    ipc = setupIpc();
    ipc.on("settings_get", { general: {}, layout: {}, dataDir: "/d", file: "f" });
    ipc.on("llm_get", { providers: [], features: [] });
    TestBed.configureTestingModule({ providers: [provideSettings()] });
    await TestBed.inject(SettingsService).load();
    expect(ipc.called("settings_get")).toBeGreaterThan(0);
  });
});
