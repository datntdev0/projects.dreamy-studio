import { Injectable, signal } from "@angular/core";
import { Theme } from "./theme.models";

const STORAGE_KEY = "dreamy-studio.theme";

const DEFAULT_THEME: Theme = "dark";

export const THEMES: Theme[] = ["dark", "light"];

export function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly active = signal<Theme>(DEFAULT_THEME);

  readonly theme = this.active.asReadonly();

  init(): void {
    this.apply(readStoredTheme() ?? detectTheme());
  }

  setTheme(theme: Theme): void {
    this.apply(theme);
    storeTheme(theme);
  }

  private apply(theme: Theme): void {
    this.active.set(theme);
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function detectTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : DEFAULT_THEME;
}

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    return;
  }
}
