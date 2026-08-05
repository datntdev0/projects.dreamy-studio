import { Injectable, signal } from "@angular/core";
import EN from "./lang.en.json";
import { I18nDictionary, I18nKey, I18nParams, Language } from "./i18n.models";
import VI from "./lang.vi.json";

const STORAGE_KEY = "dreamy-studio.language";

const DEFAULT_LANGUAGE: Language = "vi";

export const LANGUAGES: Language[] = ["vi", "en"];

const LOCALES: Record<Language, string> = {
  vi: "vi-VN",
  en: "en-US",
};

const DICTIONARIES: Record<Language, I18nDictionary> = {
  vi: VI,
  en: EN,
};

@Injectable({ providedIn: "root" })
export class I18nService {
  private readonly active = signal<Language>(DEFAULT_LANGUAGE);

  readonly language = this.active.asReadonly();

  init(): void {
    this.apply(readStoredLanguage() ?? detectLanguage());
  }

  setLanguage(language: Language): void {
    this.apply(language);
    storeLanguage(language);
  }

  locale(): string {
    return LOCALES[this.active()];
  }

  translate(key: I18nKey, params?: I18nParams): string {
    const template =
      DICTIONARIES[this.active()][key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key;
    return params ? interpolate(template, params) : template;
  }

  private apply(language: Language): void {
    this.active.set(language);
    document.documentElement.lang = language;
  }
}

function interpolate(template: string, params: I18nParams): string {
  let result = template;
  for (const name of Object.keys(params)) {
    result = result.replaceAll(`{${name}}`, String(params[name]));
  }
  return result;
}

export function isLanguage(value: string | null): value is Language {
  return value === "vi" || value === "en";
}

function detectLanguage(): Language {
  return navigator.language.toLowerCase().startsWith("en") ? "en" : DEFAULT_LANGUAGE;
}

function readStoredLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

function storeLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    return;
  }
}
