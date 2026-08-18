import { EnvironmentProviders, Provider, inject, provideAppInitializer } from "@angular/core";
import { applicationConfig } from "@storybook/angular-vite";
import type { Decorator } from "@storybook/angular-vite";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { I18nService } from "@app/core/i18n/i18n.service";
import { SettingsService } from "@app/features/settings/settings.service";
import { SettingsView } from "@app/features/settings/settings.models";
import { WorkspaceService } from "@app/features/workspace/workspace.service";
import { ChapterRow, NovelSummary, ParagraphRow, TranslationStatus } from "@app/features/novel/novel.models";
import { emptyTranslation } from "@app/features/novel/novel.translation.rules";
import { NovelTranslation, PassageTranslation, TranslatedChapter, TranslationWarning } from "@app/features/novel/novel.translation.models";
import { APP_INFO, CURRENT_WORKSPACE, LLM_PROVIDERS, llmServiceProvider } from "../features/mocks";
import { LANTERN_CHAPTERS, LANTERN_EN, LANTERN_VI, LANTERN_VI_TITLES } from "./novel-translation.fixtures";

export const NOVEL_ID = 1;

const STAMP = "2026-11-09T09:15:00Z";

const COVER = `data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='96' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='0.4' y2='1'><stop offset='0' stop-color='#1d2340'/><stop offset='0.55' stop-color='#5b6cff'/><stop offset='1' stop-color='#e08a4b'/></linearGradient></defs><rect width='96' height='128' fill='url(#g)'/></svg>")}`;

const FRESH_VI: Record<string, string> = {
  "1.3": LANTERN_VI["1.3"].replace("năm mùa đông", "sáu mùa đông"),
  "2.4": LANTERN_VI["2.4"].replace("Người coi đèn", "Người giữ đèn"),
};

const EDITED_NOTE = { text: "Giọng Wren nên cộc và lạnh. Cân nhắc bỏ “đâu có”.", date: "2026-11-07 22:10" };

const GUIDELINES = [
  "Translate for adult readers who love dark fantasy.",
  "Tone: formal, slow sentence rhythm, slightly archaic.",
  "Forms of address: third person uses “cô” / “anh”. Do not use “hắn”, “nàng”.",
  "Conventions: keep proper names. Place names with a meaning are translated by meaning (Tháp Đèn, Bến Chìm). Use “ ” marks for dialogue.",
].join("\n");

const SETTINGS: SettingsView = {
  dataDir: "C:\Users\dreamy\AppData\Roaming\dreamy-studio",
  file: "settings.json",
  general: {},
  layout: { explorerOpen: true, inspectorOpen: true, bottomOpen: true, rightTab: "inspector" },
};

const TRANSLATED_CHAPTERS = 2;

const SAMPLE_CHAPTERS = 3;

export interface TranslationScenario {
  chapters?: boolean;
  translated?: boolean;
  warnings?: boolean;
}

function chapterId(seq: number): string {
  return `ch-${seq}`;
}

function status(seq: number, translated: boolean): TranslationStatus {
  if (!translated || seq > TRANSLATED_CHAPTERS) {
    return "none";
  }
  return seq === 2 ? "review" : "draft";
}

function chapterRows(translated: boolean): ChapterRow[] {
  return LANTERN_CHAPTERS.map((chapter, index) => ({
    id: chapterId(index + 1),
    novelId: NOVEL_ID,
    seq: index + 1,
    title: chapter.title,
    wordCount: chapter.words,
    translationStatus: status(index + 1, translated),
    analysisStatus: "none",
    createdAt: STAMP,
    updatedAt: STAMP,
  }));
}

function novelSummary(chapters: number, words: number, translated: number): NovelSummary {
  return {
    id: NOVEL_ID,
    title: "哈罗米尔的守灯人",
    name: "",
    author: "伊索尔德·维兰",
    lang: "ZH",
    description: "雾锁港城的最后一位守灯人，和一个被派来清点剩余之物的书记员。",
    origin: "imported",
    createdAt: STAMP,
    updatedAt: STAMP,
    chapterCount: chapters,
    wordCount: words,
    translatedCount: translated,
    analyzedCount: 0,
    tags: ["奇幻", "暗黑", "港口"],
  };
}

function sourceOf(chapterIdValue: string): ParagraphRow[] {
  const seq = Number(chapterIdValue.slice(3));
  const chapter = seq <= SAMPLE_CHAPTERS ? LANTERN_CHAPTERS[seq - 1] : undefined;
  return (chapter?.paragraphs ?? []).map((text, index) => ({ n: index + 1, text, hashcheck: `mock-${seq}-${index + 1}` }));
}

function viText(seq: number, n: number, fresh: boolean): string {
  const key = `${seq}.${n}`;
  const text = fresh ? (FRESH_VI[key] ?? LANTERN_VI[key]) : LANTERN_VI[key];
  return text ?? `[Mock] ${LANTERN_CHAPTERS[seq - 1]?.paragraphs[n - 1] ?? ""}`;
}

function passagesOf(seq: number): Record<number, PassageTranslation> {
  const out: Record<number, PassageTranslation> = {};
  const total = LANTERN_CHAPTERS[seq - 1].paragraphs.length;
  for (let n = 1; n <= total; n += 1) {
    out[n] = { text: viText(seq, n, false), state: "draft", previous: "draft", note: null };
  }
  return out;
}

function seededWarnings(): TranslationWarning[] {
  return [
    { id: "W01", kind: "source", chapterId: chapterId(1), seq: 1, n: 3, reason: "The source passage was edited after translation.", state: "open", by: "", date: "2026-11-08 20:41" },
    { id: "W02", kind: "dict", chapterId: chapterId(2), seq: 2, n: 4, reason: "The source passage uses “守灯人”, but the translated passage does not contain “người giữ đèn” from the dictionary.", state: "open", by: "", date: "2026-11-09 09:15" },
  ];
}

function seededTranslation(scenario: TranslationScenario): NovelTranslation {
  const translation: NovelTranslation = {
    guidelines: GUIDELINES,
    dict: [
      { id: "D01", src: "雷恩·奥尔德斯", dst: "Wren Aldous", type: "name", note: "Keep as is" },
      { id: "D02", src: "马洛·奎尔", dst: "Maro Quill", type: "name", note: "Keep as is" },
      { id: "D03", src: "塞弗林夫人", dst: "Phu nhân Sevrin", type: "title", note: "" },
      { id: "D04", src: "灯塔", dst: "Tháp Đèn", type: "place", note: "" },
      { id: "D05", src: "沉没码头", dst: "Bến Chìm", type: "place", note: "Translate by meaning" },
      { id: "D06", src: "哈罗米尔", dst: "Harrowmere", type: "place", note: "Keep as is" },
      { id: "D07", src: "议会", dst: "Hội đồng", type: "org", note: "" },
      { id: "D08", src: "港口书记员", dst: "thư lại bến cảng", type: "title", note: "" },
      { id: "D09", src: "守灯人", dst: "người giữ đèn", type: "term", note: "Changed from “người coi đèn” for consistency" },
      { id: "D10", src: "账簿", dst: "sổ cái", type: "term", note: "" },
    ],
    chapters: {},
    warnings: [],
  };
  if (scenario.translated !== false) {
    translation.chapters = { [chapterId(1)]: { title: LANTERN_VI_TITLES[0], passages: passagesOf(1) }, [chapterId(2)]: { title: LANTERN_VI_TITLES[1], passages: passagesOf(2) } };
    translation.chapters[chapterId(1)].passages[4] = { text: LANTERN_VI["1.4"], state: "draft", previous: "draft", note: EDITED_NOTE };
  }
  if (scenario.translated !== false && scenario.warnings !== false) {
    translation.warnings = seededWarnings();
    translation.chapters[chapterId(1)].passages[3] = { ...translation.chapters[chapterId(1)].passages[3], state: "review" };
    translation.chapters[chapterId(2)].passages[4] = { ...translation.chapters[chapterId(2)].passages[4], state: "review" };
  }
  return translation;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runChapter(args: Record<string, unknown>): Promise<TranslatedChapter> {
  const id = String(args["chapterId"]);
  const seq = Number(id.slice(3));
  const english = args["target"] === "EN";
  const emit = (args["onEvent"] as { emit: (percent: number) => void }).emit;
  for (const percent of [10, 35, 60, 85, 100]) {
    emit(percent);
    await pause(240);
  }
  const title = english ? LANTERN_EN[seq - 1].title : LANTERN_VI_TITLES[seq - 1];
  return { title, passages: sourceOf(id).map((row) => ({ n: row.n, text: english ? LANTERN_EN[seq - 1].paragraphs[row.n - 1] : viText(seq, row.n, true) })) };
}

function ipcHandlers(scenario: TranslationScenario): Record<string, (args: Record<string, unknown>) => unknown> {
  const rows = scenario.chapters === false ? [] : chapterRows(scenario.translated !== false);
  const words = rows.reduce((total, row) => total + row.wordCount, 0);
  return {
    app_info: () => APP_INFO,
    workspace_current: () => CURRENT_WORKSPACE,
    settings_get: () => SETTINGS,
    novel_list: () => [novelSummary(rows.length, words, rows.filter((row) => row.translationStatus !== "none").length)],
    novel_chapters: () => rows,
    novel_chapter_read: (args) => sourceOf(String(args["chapterId"])),
    novel_cover_get: () => COVER,
    novel_translation_get: (args) => (args["target"] === "VI" ? seededTranslation(scenario) : emptyTranslation()),
    novel_translation_save: () => undefined,
    novel_translation_run: runChapter,
  };
}

function ipcProvider(scenario: TranslationScenario): Provider {
  const handlers = ipcHandlers(scenario);
  const mock: Partial<DesktopIpcService> = {
    invoke: <TResult>(command: string, args: Record<string, unknown> = {}): Promise<TResult> => Promise.resolve((handlers[command]?.(args) ?? (command.endsWith("_list") ? [] : undefined)) as TResult),
    channel: <TMessage>(onMessage: (message: TMessage) => void) => ({ emit: onMessage }) as never,
  };
  return { provide: DesktopIpcService, useValue: mock };
}

function languageProvider(): EnvironmentProviders {
  return provideAppInitializer(startup);
}

async function startup(): Promise<void> {
  const settings = inject(SettingsService);
  const workspace = inject(WorkspaceService);
  inject(I18nService).init();
  await settings.load();
  await workspace.restoreCurrent();
}

export function translationProviders(scenario: TranslationScenario = {}): Array<Provider | EnvironmentProviders> {
  return [ipcProvider(scenario), llmServiceProvider(LLM_PROVIDERS), languageProvider()];
}

export function withTranslation(scenario: TranslationScenario = {}): { decorators: Decorator[] } {
  return { decorators: [applicationConfig({ providers: translationProviders(scenario) })] };
}
