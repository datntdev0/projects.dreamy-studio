import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { provideTheme } from "./theme.provider";
import { DEFAULT_THEME, THEMES, ThemeService, isTheme } from "./theme.service";

function mockMedia(light: boolean): void {
  vi.stubGlobal("matchMedia", () => ({ matches: light }));
}

describe("ThemeService", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("validates themes", () => {
    expect(THEMES).toEqual(["dark", "light"]);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("blue")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("falls back to the system preference", () => {
    mockMedia(true);
    const theme = TestBed.inject(ThemeService);
    theme.init();
    expect(theme.theme()).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("defaults to dark when the system has no light preference", () => {
    mockMedia(false);
    const theme = TestBed.inject(ThemeService);
    theme.init();
    expect(theme.theme()).toBe(DEFAULT_THEME);
  });

  it("stores and restores the chosen theme", () => {
    mockMedia(false);
    TestBed.inject(ThemeService).setTheme("light");
    expect(localStorage.getItem("dreamy-studio.theme")).toBe("light");
    TestBed.resetTestingModule();
    const theme = TestBed.inject(ThemeService);
    theme.init();
    expect(theme.theme()).toBe("light");
  });

  it("survives unavailable storage", () => {
    mockMedia(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const theme = TestBed.inject(ThemeService);
    theme.init();
    theme.setTheme("light");
    expect(theme.theme()).toBe("light");
    vi.restoreAllMocks();
  });

  it("initialises through the app initializer provider", () => {
    mockMedia(false);
    localStorage.setItem("dreamy-studio.theme", "light");
    TestBed.configureTestingModule({ providers: [provideTheme()] });
    expect(TestBed.inject(ThemeService).theme()).toBe("light");
  });
});
