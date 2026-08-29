import VI from "./language.vi.json";

export type Language = "vi" | "en";

export type LanguageKey = keyof typeof VI;

export type LanguageDictionary = Record<LanguageKey, string>;

export type LanguageParams = Record<string, string | number>;
