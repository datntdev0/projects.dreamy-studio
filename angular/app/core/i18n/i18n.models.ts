import VI from "./lang.vi.json";

export type Language = "vi" | "en";

export type I18nKey = keyof typeof VI;

export type I18nDictionary = Record<I18nKey, string>;

export type I18nParams = Record<string, string | number>;
