import { access, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { expect, type Locator, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { GuidelinesPage, passageLabel, TranslationDictionaryPage, TranslationReviewPage, TranslationRunPage, TranslationWarningsView, TranslationWorkspacePage, type DictionaryColumn, type TranslationStep, type WarningFilterKind } from "../pages/translation.ts";
import type { AppSession } from "./app.ts";
import type { Ui } from "./fixtures.ts";
import { openFromSplash } from "./flows.ts";
import type { PickerStub } from "./picker.ts";
import { showPipelineHistory, seedPipelines, openReadOnly, AZURE, HARBOR, EMBER, type SeedPipeline } from "./pipeline.ts";
import type { Sandbox } from "./sandbox.ts";
import { readWorkspace, WORKSPACE_DB_FILE, chapterFileName, novelDir, readParagraphs, seedWorkspace, readChapterFile, type ChapterRecord, type SeedOptions, type SeedChapter, type SeedNovel } from "./workspaces.ts";

export const SAMPLE_TITLE = "Azure Chronicle";

export const SAMPLE_TERMS = {
  hero: "Lin Feng",
  healer: "Su Yan",
  master: "Master Chen",
  sect: "Sky Sword Sect",
  city: "Azure City",
  blade: "Frost Blade",
} as const;

const STORY: readonly SeedChapter[] = [
  {
    title: "The Arrival",
    paragraphs: [
      "Lin Feng arrived at the gates of Azure City at dawn.",
      "Master Chen, the leader of the Sky Sword Sect, watched him from the tower.",
      "Lin Feng carried the Frost Blade, a relic left by his late father.",
      "He was twenty years old and worked as a blacksmith.",
    ],
  },
  {
    title: "The Trial",
    paragraphs: [
      "The Sky Sword Sect held its trial in the courtyard of Azure City.",
      "Master Chen asked Lin Feng to show the Frost Blade to the elders.",
      "Su Yan, a healer of the sect, whispered that the blade was cursed.",
      "Lin Feng ignored her warning and stepped forward.",
    ],
  },
  {
    title: "The Duel",
    paragraphs: [
      "Su Yan, also known as the White Lotus, joined the duel at noon.",
      "Lin Feng fought Master Chen beneath the tower of Azure City.",
      "The Frost Blade shattered the sect banner of the Sky Sword Sect.",
      "Master Chen conceded and Lin Feng became a disciple.",
    ],
  },
];

export function sampleChapters(count = 3): SeedChapter[] {
  const chapters: SeedChapter[] = [];
  for (let index = 0; index < count; index += 1) {
    const known = STORY[index];
    if (known) {
      chapters.push(known);
      continue;
    }
    const seq = index + 1;
    chapters.push({
      title: `Chapter ${seq}`,
      paragraphs: [`Chapter ${seq} opens with Lin Feng on the road.`, `Chapter ${seq} closes at Azure City.`],
    });
  }
  return chapters;
}

export interface SampleNovelOptions {
  readonly title?: string;
  readonly lang?: string;
  readonly chapters?: number | readonly SeedChapter[];
  readonly tags?: readonly string[];
}

export function sampleNovel(options: SampleNovelOptions = {}): SeedNovel {
  const chapters = typeof options.chapters === "number" || options.chapters === undefined ? sampleChapters(options.chapters ?? 3) : options.chapters;
  return {
    title: options.title ?? SAMPLE_TITLE,
    lang: options.lang ?? "ZH",
    tags: options.tags,
    chapters,
  };
}

export const TRANSLATION_WORKSPACE_NAME = "translation";

export interface TranslationOpenOptions {
  readonly novel?: string;
  readonly target?: TranslationTarget;
  readonly seedOptions?: SeedOptions;
}

export interface OpenedTranslation {
  readonly folder: string;
  readonly seeded: SeededTranslationWorkspace;
  readonly novel: string;
  readonly novelId: number;
  readonly chapters: SeededNovel["chapters"];
}

export const DEFAULT_TRANSLATION_SEED: TranslationWorkspaceSeed = { novels: [sampleNovel()] };

export async function showNovelTree(ui: Ui, novel: string): Promise<void> {
  if (!(await ui.main.explorer.management.isVisible())) {
    await ui.main.showNovels();
  }
  await expect(ui.main.explorer.novel(novel)).toBeVisible();
  if (!(await ui.main.explorer.group(novel).getByTestId("novel-explorer-translation").isVisible())) {
    await ui.main.explorer.novel(novel).click();
  }
}

export function translationEntry(ui: Ui, novel: string): Locator {
  return ui.main.explorer.group(novel).getByTestId("novel-explorer-translation");
}

export async function showTranslation(ui: Ui, novel: string): Promise<void> {
  await showNovelTree(ui, novel);
  await translationEntry(ui, novel).click();
  await expect(ui.main.translation.host).toBeVisible();
  await expect(ui.main.translation.root).toBeVisible();
}

export async function selectTarget(ui: Ui, target: TranslationTarget): Promise<void> {
  await ui.main.translation.target.selectOption(target);
  await expect(ui.main.translation.target).toHaveValue(target);
}

export async function goToStep(ui: Ui, step: TranslationStep): Promise<void> {
  await ui.main.translation.step(step).click();
  await expect(ui.main.translation.step(step)).toHaveAttribute("aria-current", "true");
  await expect(ui.main.translation.stepRoot(step)).toBeVisible();
}

export async function openTranslation(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  seed: TranslationWorkspaceSeed = DEFAULT_TRANSLATION_SEED,
  step?: TranslationStep,
  options: TranslationOpenOptions = {},
): Promise<OpenedTranslation> {
  const folder = sandbox.workspace(TRANSLATION_WORKSPACE_NAME);
  const seeded = await seedTranslationWorkspace(folder, seed, options.seedOptions);
  await openFromSplash(ui, picker, folder);
  const novel = options.novel ?? seed.novels[0]?.title ?? "";
  const place = seeded.novels[novel];
  if (place === undefined) {
    throw new Error(`the seed has no novel titled ${novel}`);
  }
  await showTranslation(ui, novel);
  if (options.target !== undefined) {
    await selectTarget(ui, options.target);
  }
  if (step !== undefined && (seed.novels.find((item) => item.title === novel)?.chapters?.length ?? 0) > 0) {
    await goToStep(ui, step);
  }
  return { folder, seeded, novel, novelId: place.id, chapters: place.chapters };
}

export async function openRunDialog(ui: Ui): Promise<void> {
  await goToStep(ui, "trans");
  const start = ui.main.translation.root.getByTestId("novel-translation-pipeline-start");
  await expect(start).toBeEnabled();
  await start.click();
  await expect(ui.main.translation.runDialog.panel).toBeVisible();
}

export async function reopenRunStep(ui: Ui, app: AppSession, picker: PickerStub, folder: string, novel: string): Promise<void> {
  await app.restart();
  await expect(ui.splash.root).toBeVisible();
  await openFromSplash(ui, picker, folder);
  await showTranslation(ui, novel);
  await goToStep(ui, "trans");
}

export async function translateChapters(ui: Ui, seqs: readonly number[]): Promise<void> {
  const sorted = [...seqs].sort((left, right) => left - right);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined || last - first + 1 !== sorted.length) {
    throw new Error("translateChapters needs a contiguous range of chapters");
  }
  const dialog = ui.main.translation.runDialog;
  await openRunDialog(ui);
  await dialog.mode("range").click();
  await dialog.from.fill(String(first));
  await dialog.from.blur();
  await dialog.to.fill(String(last));
  await dialog.to.blur();
  await dialog.overwrite.check();
  await expect(dialog.start).toBeEnabled();
  await dialog.start.click();
  await expect(dialog.panel).toBeHidden();
}

export function chapterRow(ui: Ui, seq: number): Locator {
  return ui.main.translation.root.getByTestId("novel-translation-pipeline-row").nth(seq - 1);
}

export function chapterStatus(ui: Ui, seq: number): Locator {
  return chapterRow(ui, seq).getByTestId("novel-translation-pipeline-status");
}

export const ZH_NOVEL = "Azure Chronicle";
export const VI_NOVEL = "Bến Cảng Sớm";
export const EN_NOVEL = "Harbor Lights";
export const EMPTY_NOVEL = "Blank Scroll";

export const STEP_LABELS: Readonly<Record<TranslationStep, RegExp>> = {
  dict: /^(từ điển|dictionary)$/i,
  guide: /^(hướng dẫn dịch|guidelines)$/i,
  trans: /^(dịch|translate)$/i,
  result: /^(kết quả|results)$/i,
  warn: /^(cảnh báo|warnings)$/i,
};

export const TARGET_LABELS = {
  VI: /^(tiếng việt|vietnamese)$/i,
  EN: /^(tiếng anh|english)$/i,
} as const;

export const SUMMARY_DICT_TWO = /^(2 mục|2 entries)$/i;
export const SUMMARY_DICT_ONE = /^(1 mục|1 entries|1 entry)$/i;
export const SUMMARY_GUIDE_WRITTEN = /^(đã viết|written)$/i;
export const SUMMARY_GUIDE_EMPTY = /^(trống|empty)$/i;
export const SUMMARY_TRANS = /^\d+\/3 (chương|chapters)$/i;
export const SUMMARY_REVIEWED = /^(đã rà soát hết|all reviewed)$/i;
export const SUMMARY_WARN_NONE = /^(không có|none)$/i;
export const EMPTY_TITLE = /chưa có chương nào để dịch|no chapters to translate yet/i;

export function workspacePage(ui: Ui): TranslationWorkspacePage {
  return new TranslationWorkspacePage(ui.main.translation.root.page());
}

export function workspaceSeed(): TranslationWorkspaceSeed {
  return {
    novels: [
      sampleNovel({ title: ZH_NOVEL, lang: "ZH" }),
      sampleNovel({ title: VI_NOVEL, lang: "VI", chapters: 1 }),
      sampleNovel({ title: EN_NOVEL, lang: "EN", chapters: 1 }),
      { title: EMPTY_NOVEL, lang: "ZH" },
    ],
    translations: [
      {
        novel: ZH_NOVEL,
        target: "VI",
        guidelines: "Keep a formal, archaic tone.",
        dictionary: [
          { src: "Lin Feng", dst: "Lâm Phong", type: "name" },
          { src: "Azure City", dst: "Thành Thanh Lam", type: "place" },
        ],
      },
      {
        novel: ZH_NOVEL,
        target: "EN",
        dictionary: [{ src: "Lin Feng", dst: "Lin Feng", type: "name" }],
      },
    ],
  };
}

export const DICT_NO_MATCH_HINT = /thử từ khóa khác|try another keyword/i;

export interface OpenedDictionary {
  readonly folder: string;
  readonly novel: string;
  readonly dictionary: TranslationDictionaryPage;
}

export interface DictionaryDraft {
  readonly src: string;
  readonly dst: string;
  readonly type?: DictKind;
  readonly note?: string;
}

export function dictionaryCount(shown: number, total: number): RegExp {
  return new RegExp(`^\\s*${shown}/${total}\\s`);
}

export async function openDictionary(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  entries: Readonly<Partial<Record<TranslationTarget, readonly SeedDictEntry[]>>>,
  target: TranslationTarget = "VI",
): Promise<OpenedDictionary> {
  const novel = sampleNovel();
  const translations = (Object.keys(entries) as TranslationTarget[]).map((key) => ({ novel: novel.title, target: key, dictionary: entries[key] }));
  const opened = await openTranslation(ui, picker, sandbox, { novels: [novel], translations }, "dict", { target });
  const dictionary = new TranslationDictionaryPage(ui.main.translation.host.page());
  await expect(dictionary.root).toBeVisible();
  return { folder: opened.folder, novel: opened.novel, dictionary };
}

export async function fillDraft(dictionary: TranslationDictionaryPage, draft: Partial<DictionaryDraft>): Promise<void> {
  if (draft.src !== undefined) {
    await dictionary.draftSrc.fill(draft.src);
  }
  if (draft.dst !== undefined) {
    await dictionary.draftDst.fill(draft.dst);
  }
  if (draft.type !== undefined) {
    await dictionary.draftType.selectOption(draft.type);
  }
  if (draft.note !== undefined) {
    await dictionary.draftNote.fill(draft.note);
  }
}

export async function startDraft(dictionary: TranslationDictionaryPage, draft: Partial<DictionaryDraft>): Promise<void> {
  await dictionary.create.click();
  await expect(dictionary.draftSrc).toBeVisible();
  await fillDraft(dictionary, draft);
}

export async function addEntry(dictionary: TranslationDictionaryPage, draft: Partial<DictionaryDraft>): Promise<void> {
  await startDraft(dictionary, draft);
  await dictionary.add.click();
}

export async function editCell(dictionary: TranslationDictionaryPage, row: Locator, column: DictionaryColumn, value: string): Promise<void> {
  await dictionary.cell(row, column).dblclick();
  await expect(dictionary.cellInput).toBeVisible();
  if (column === "type") {
    await dictionary.cellInput.selectOption(value);
    return;
  }
  await dictionary.cellInput.fill(value);
  await dictionary.cellInput.press("Enter");
}

export async function removeEntry(dictionary: TranslationDictionaryPage, row: Locator): Promise<void> {
  await dictionary.menu(row).click();
  await dictionary.deleteAction.click();
}

export const GUIDELINES_SAVED = /đã lưu hướng dẫn|saved guidelines/i;

export function guidelinesOf(page: Page): GuidelinesPage {
  return new GuidelinesPage(page);
}

export async function saveGuidelines(guide: GuidelinesPage, text?: string): Promise<void> {
  if (text !== undefined) {
    await guide.prompt.fill(text);
  }
  await guide.save.click();
}

export async function reopenGuidelines(ui: Ui, app: AppSession, picker: PickerStub, folder: string, novel: string, target: TranslationTarget): Promise<GuidelinesPage> {
  await app.restart();
  await expect(ui.splash.root).toBeVisible();
  await openFromSplash(ui, picker, folder);
  await showTranslation(ui, novel);
  await selectTarget(ui, target);
  await goToStep(ui, "guide");
  return guidelinesOf(app.page);
}

export const RUN_NOVEL = "Azure Chronicle";
export const RUN_TARGET: TranslationTarget = "VI";
export const RUN_CHAPTER_COUNT = 5;

export function runSeed(translated: readonly SeedTranslatedChapter[]): TranslationWorkspaceSeed {
  return {
    novels: [sampleNovel({ title: RUN_NOVEL, chapters: RUN_CHAPTER_COUNT })],
    translations: [{ novel: RUN_NOVEL, target: RUN_TARGET, chapters: translated }],
  };
}

export function runPage(ui: Ui): TranslationRunPage {
  return new TranslationRunPage(ui.main.translation.root.page());
}

export function chapterRecords(folder: string): Promise<ChapterRecord[]> {
  return readWorkspace(folder, (db) => db.chapters(RUN_NOVEL));
}

export function savedChapter(folder: string, novelId: number, chapterId: string): Promise<TranslatedChapterRecord | null> {
  return readTranslatedChapter(folder, novelId, RUN_TARGET, chapterId);
}

export async function hasTranslationFile(folder: string, novelId: number, chapterId: string): Promise<boolean> {
  try {
    await access(translationChapterPath(folder, novelId, RUN_TARGET, chapterId));
    return true;
  } catch {
    return false;
  }
}

export async function openLatestPipelineLog(ui: Ui): Promise<void> {
  await showPipelineHistory(ui);
  await ui.main.pipelines.history.rows.first().click();
  await expect(ui.main.pipelines.log.head).toBeVisible();
}

export async function backToTranslation(ui: Ui): Promise<void> {
  await showTranslation(ui, RUN_NOVEL);
}

export const REVIEW_TARGET = "VI";

export const FIRST_CHAPTER = [
  "Lam Phong den cong Thanh Lam luc binh minh.",
  "Truong lao Tran, thu linh cua mon phai, nhin cau tu thap canh.",
  "Mot thanh kiem bang la di vat cua cha cau.",
  "Cau hai muoi tuoi va lam nghe ren.",
] as const;

export const SECOND_CHAPTER = [
  "Mon phai to chuc thu thach tai san dinh.",
  "Truong lao Tran bao Lam Phong trinh kiem cho cac truong lao.",
  "Tu Yen thi tham rang thanh kiem bi nguyen rua.",
  "Lam Phong lo loi canh bao va buoc toi.",
] as const;

export const REVIEW_SEED: TranslationWorkspaceSeed = {
  novels: [sampleNovel()],
  translations: [
    {
      novel: "Azure Chronicle",
      target: REVIEW_TARGET,
      dictionary: [{ src: "Lin Feng", dst: "Lam Phong", type: "name" }],
      chapters: [
        { chapter: 1, paragraphs: FIRST_CHAPTER, staleSource: [2] },
        { chapter: 2, paragraphs: SECOND_CHAPTER },
      ],
    },
  ],
};

export const NOTE_SEED: TranslationWorkspaceSeed = {
  novels: [sampleNovel()],
  translations: [
    {
      novel: "Azure Chronicle",
      target: REVIEW_TARGET,
      chapters: [{ chapter: 1, paragraphs: FIRST_CHAPTER, notes: { 2: "Check the sect title" } }],
    },
  ],
};

export const SOURCE_FIRST = sampleChapters()[0]?.paragraphs ?? [];
export const SOURCE_SECOND = sampleChapters()[1]?.paragraphs ?? [];

export function review(app: AppSession): TranslationReviewPage {
  return new TranslationReviewPage(app.page);
}

export async function openResult(ui: Ui, app: AppSession): Promise<TranslationReviewPage> {
  await goToStep(ui, "result");
  return review(app);
}

export async function storedParagraphs(opened: OpenedTranslation, chapter: number): Promise<readonly TranslatedParagraphRecord[]> {
  const id = opened.chapters[chapter];
  if (id === undefined) {
    throw new Error(`the seed has no chapter ${chapter}`);
  }
  const record = await readTranslatedChapter(opened.folder, opened.novelId, REVIEW_TARGET, id);
  expect(record).not.toBeNull();
  return record?.paragraphs ?? [];
}

export async function reopenResult(ui: Ui, app: AppSession): Promise<TranslationReviewPage> {
  await goToStep(ui, "dict");
  return openResult(ui, app);
}

export const WARNINGS_NOVEL = SAMPLE_TITLE;
export const WARNINGS_TARGET = "VI";

export const FILTER_LABELS: Readonly<Record<WarningFilterKind, string>> = {
  all: "(Tất cả|All)",
  dict: "(Từ điển|Dictionary)",
};

export const HERO_TEXT = "Lâm Phong mang thanh Kiếm Băng, di vật của người cha quá cố.";

export const DICTIONARY_SEED: TranslationWorkspaceSeed = {
  novels: [sampleNovel()],
  translations: [
    {
      novel: WARNINGS_NOVEL,
      target: WARNINGS_TARGET,
      dictionary: [{ src: "Lin Feng", dst: "Lâm Phong", type: "name" }],
      chapters: [
        {
          chapter: 1,
          paragraphs: [
            "Lâm Phong đến cổng thành Azure vào lúc bình minh.",
            "Thầy Trần, thủ lĩnh của Tông Thiên Kiếm, quan sát hắn từ tháp.",
            "Hắn mang thanh Kiếm Băng, di vật của người cha quá cố.",
            "Hắn hai mươi tuổi và làm nghề thợ rèn.",
          ],
        },
      ],
    },
  ],
};

export const FILTER_SEED: TranslationWorkspaceSeed = {
  novels: [sampleNovel()],
  translations: [
    {
      novel: WARNINGS_NOVEL,
      target: WARNINGS_TARGET,
      dictionary: [{ src: "Lin Feng", dst: "Lâm Phong", type: "name" }],
      chapters: [
        {
          chapter: 1,
          paragraphs: [
            "Lâm Phong đến cổng thành Azure lúc bình minh.",
            "Thầy Trần quan sát hắn từ trên tháp.",
            "Hắn mang thanh Kiếm Băng.",
            "Hắn hai mươi tuổi.",
          ],
        },
        {
          chapter: 2,
          paragraphs: [
            "Tông môn tổ chức thử thách ở sân.",
            "Thầy Trần yêu cầu hắn trình kiếm.",
            "Tô Yến thì thầm rằng thanh kiếm bị nguyền.",
            "Hắn phớt lờ lời cảnh báo.",
          ],
        },
      ],
    },
  ],
};

export function warningsView(ui: Ui): TranslationWarningsView {
  return new TranslationWarningsView(ui.main.translation.root.page());
}

export function filterText(kind: WarningFilterKind, count: number): RegExp {
  return new RegExp(`^${FILTER_LABELS[kind]}\\s*${count}$`, "i");
}

export function flaggedToast(count: number): RegExp {
  return new RegExp(`(đã thêm vào từ điển\\. ${count} đoạn cần rà soát|added to the dictionary\\. ${count} passages need review)`, "i");
}

export function expectedLabels(warnings: readonly ExpectedWarning[]): string[] {
  return warnings.map((warning) => `${warning.kind}|${passageLabel(warning.seq, warning.n)}`).sort();
}

function readLabels(cards: Element[]): string[] {
  return cards.map((card) => card.querySelector(".chip")?.textContent?.trim() ?? "");
}

export async function shownLabels(view: TranslationWarningsView): Promise<string[]> {
  const labels = await view.cards.evaluateAll(readLabels);
  return labels.map((label) => `dict|${label}`).sort();
}

export async function addDictionaryEntry(ui: Ui, src: string, dst: string): Promise<void> {
  const view = warningsView(ui);
  await goToStep(ui, "dict");
  await view.dictNew.click();
  await view.dictSource.fill(src);
  await view.dictTranslation.fill(dst);
  await view.dictAdd.click();
}

export async function deleteFirstDictionaryEntry(ui: Ui): Promise<void> {
  const view = warningsView(ui);
  await goToStep(ui, "dict");
  await view.dictRows.first().getByTestId("datatable-row-menu").click();
  await view.deleteAction.click();
  await expect(ui.main.toast(DICT_DELETED)).toBeVisible();
}

export async function editTranslatedParagraph(ui: Ui, seq: number, n: number, text: string): Promise<void> {
  const view = warningsView(ui);
  await goToStep(ui, "result");
  await view.resultJump.selectOption(String(seq));
  await expect(view.resultPairs.first()).toBeVisible();
  await view.resultText(n).click();
  await view.resultEditor.fill(text);
  await view.resultSave.click();
  await expect(ui.main.toast(RESULT_SAVED)).toBeVisible();
  await expect(view.resultEditor).toBeHidden();
}

const TRANSLATION_BASE_TIME = Date.UTC(2026, 0, 3, 9, 0, 0);

export type DictKind = "name" | "place" | "org" | "title" | "term";

export interface SeedDictEntry {
  readonly src: string;
  readonly dst: string;
  readonly type?: DictKind;
  readonly note?: string;
}

export interface SeedTranslatedChapter {
  readonly chapter: number;
  readonly title?: string;
  readonly paragraphs?: readonly string[];
  readonly notes?: Readonly<Record<number, string>>;
  readonly staleSource?: readonly number[];
  readonly dbStatus?: boolean;
}

export interface TranslationSeed {
  readonly novel: string;
  readonly target: TranslationTarget;
  readonly guidelines?: string;
  readonly dictionary?: readonly SeedDictEntry[];
  readonly chapters?: readonly SeedTranslatedChapter[];
}

export interface TranslationWorkspaceSeed {
  readonly novels: readonly SeedNovel[];
  readonly translations?: readonly TranslationSeed[];
  readonly pipelines?: readonly SeedPipeline[];
}

export interface SeededNovel {
  readonly id: number;
  readonly chapters: Readonly<Record<number, string>>;
}

export interface SeededTranslation {
  readonly novelId: number;
  readonly target: TranslationTarget;
  readonly dictionary: Readonly<Record<string, number>>;
}

export interface SeededTranslationWorkspace {
  readonly novels: Readonly<Record<string, SeededNovel>>;
  readonly translations: readonly SeededTranslation[];
  readonly pipelines: readonly number[];
}

export function paragraphHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function staleHash(text: string): string {
  return paragraphHash(`${text} (an earlier version)`);
}

export function taggedCopy(target: TranslationTarget, text: string): string {
  return `[${target}] ${text}`;
}

async function placeOf(folder: string, novel: string): Promise<SeededNovel> {
  return readWorkspace(folder, (db) => {
    const chapters: Record<number, string> = {};
    for (const chapter of db.chapters(novel)) {
      chapters[chapter.seq] = chapter.id;
    }
    return { id: db.novelId(novel), chapters };
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}

async function writeGuidelines(folder: string, novelId: number, target: TranslationTarget, text: string): Promise<void> {
  const path = guidelinesPath(folder, novelId);
  let current: { guidelines?: Record<string, string> } = {};
  try {
    current = JSON.parse(await readFile(path, "utf8")) as { guidelines?: Record<string, string> };
  } catch {
    current = {};
  }
  await writeJson(path, { guidelines: { ...(current.guidelines ?? {}), [target]: text } });
}

function insertDictionary(database: DatabaseSync, novelId: number, target: TranslationTarget, entries: readonly SeedDictEntry[]): Record<string, number> {
  const ids: Record<string, number> = {};
  const insert = database.prepare(
    "INSERT INTO ws_novel_translation_dictionary (novel_id, target, src, dst, type, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const [index, entry] of entries.entries()) {
    const stamp = new Date(TRANSLATION_BASE_TIME + index * 1000).toISOString();
    const result = insert.run(novelId, target, entry.src, entry.dst, entry.type ?? "term", entry.note ?? "", stamp, stamp);
    ids[entry.src] = Number(result.lastInsertRowid);
  }
  return ids;
}

function markTranslated(database: DatabaseSync, chapterIds: readonly string[]): void {
  const update = database.prepare("UPDATE ws_novel_chapters SET translation_status = 'done' WHERE id = ?");
  for (const id of chapterIds) {
    update.run(id);
  }
}

async function chapterRecord(folder: string, place: SeededNovel, target: TranslationTarget, seed: SeedTranslatedChapter, chapterTitle: string): Promise<TranslatedChapterRecord> {
  const chapterId = place.chapters[seed.chapter];
  if (chapterId === undefined) {
    throw new Error(`translation seed references an unknown chapter ${seed.chapter}`);
  }
  const source = await readParagraphs(folder, place.id, chapterId);
  const stale = new Set(seed.staleSource ?? []);
  const paragraphs = source.map((text, index) => ({
    originalHashcheck: stale.has(index + 1) ? staleHash(text) : paragraphHash(text),
    text: seed.paragraphs?.[index] ?? taggedCopy(target, text),
    note: seed.notes?.[index + 1] ?? "",
  }));
  return { title: seed.title ?? taggedCopy(target, chapterTitle), paragraphs };
}

export async function seedTranslation(folder: string, seed: TranslationSeed): Promise<SeededTranslation> {
  const place = await placeOf(folder, seed.novel);
  const titles = await readWorkspace(folder, (db) => db.chapters(seed.novel).map((chapter) => chapter.title));
  const translatedIds: string[] = [];
  for (const chapter of seed.chapters ?? []) {
    const record = await chapterRecord(folder, place, seed.target, chapter, titles[chapter.chapter - 1] ?? "");
    const chapterId = place.chapters[chapter.chapter];
    if (chapterId === undefined) {
      continue;
    }
    await writeJson(translationChapterPath(folder, place.id, seed.target, chapterId), record);
    if (chapter.dbStatus !== false) {
      translatedIds.push(chapterId);
    }
  }
  if (seed.guidelines !== undefined) {
    await writeGuidelines(folder, place.id, seed.target, seed.guidelines);
  }
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  let dictionary: Record<string, number> = {};
  try {
    database.exec("BEGIN");
    dictionary = insertDictionary(database, place.id, seed.target, seed.dictionary ?? []);
    markTranslated(database, translatedIds);
    database.exec("COMMIT");
  } finally {
    database.close();
  }
  return { novelId: place.id, target: seed.target, dictionary };
}

export async function editSourceParagraph(folder: string, novelId: number, chapterId: string, n: number, text: string): Promise<void> {
  const path = join(novelDir(folder, novelId), chapterFileName(chapterId));
  const file = JSON.parse(await readFile(path, "utf8")) as { paragraphs: { text: string; hashcheck: string }[] };
  const paragraph = file.paragraphs[n - 1];
  if (paragraph === undefined) {
    throw new Error(`chapter has no paragraph ${n}`);
  }
  paragraph.text = text;
  paragraph.hashcheck = paragraphHash(text);
  await writeFile(path, JSON.stringify(file, null, 2));
}

export async function seedTranslationWorkspace(folder: string, seed: TranslationWorkspaceSeed, options: SeedOptions = {}): Promise<SeededTranslationWorkspace> {
  await seedWorkspace(folder, { ...options, novels: seed.novels });
  const translations: SeededTranslation[] = [];
  for (const translation of seed.translations ?? []) {
    translations.push(await seedTranslation(folder, translation));
  }
  const pipelines = await seedPipelines(folder, seed.pipelines ?? []);
  const novels: Record<string, SeededNovel> = {};
  for (const novel of seed.novels) {
    novels[novel.title] = await placeOf(folder, novel.title);
  }
  return { novels, translations, pipelines };
}

export type TranslationTarget = "VI" | "EN";
export type WarningKind = "source" | "dict";

export interface DictionaryRow {
  readonly id: number;
  readonly novelId: number;
  readonly target: string;
  readonly src: string;
  readonly dst: string;
  readonly type: string;
  readonly note: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TranslatedParagraphRecord {
  readonly originalHashcheck: string;
  readonly text: string;
  readonly note: string;
}

export interface TranslatedChapterRecord {
  readonly title: string;
  readonly paragraphs: readonly TranslatedParagraphRecord[];
}

export interface ExpectedWarning {
  readonly kind: WarningKind;
  readonly chapterId: string;
  readonly seq: number;
  readonly n: number;
  readonly entryId: number | null;
}

export interface NovelTranslationState {
  readonly novelId: number;
  readonly guidelines: string;
  readonly dictionary: readonly DictionaryRow[];
  readonly chapters: Readonly<Record<string, TranslatedChapterRecord>>;
  readonly warnings: readonly ExpectedWarning[];
}

export interface NovelPlace {
  readonly novelId: number;
  readonly chapters: readonly { readonly id: string; readonly seq: number; readonly title: string }[];
}

export function readNovelPlace(folder: string, novel: string): NovelPlace {
  const database = openReadOnly(folder);
  try {
    const row = database.prepare("SELECT id FROM ws_novels WHERE title = ?").get(novel);
    if (row === undefined) {
      throw new Error(`no novel titled ${novel}`);
    }
    const novelId = Number(row["id"]);
    const rows = database.prepare("SELECT id, seq, title FROM ws_novel_chapters WHERE novel_id = ? ORDER BY seq").all(novelId);
    return { novelId, chapters: rows.map((item) => ({ id: String(item["id"]), seq: Number(item["seq"]), title: String(item["title"]) })) };
  } finally {
    database.close();
  }
}

export function translationDirName(target: TranslationTarget): string {
  return `translation_${target.toLowerCase()}`;
}

export function translationChapterPath(folder: string, novelId: number, target: TranslationTarget, chapterId: string): string {
  return join(novelDir(folder, novelId), translationDirName(target), `chapter_${chapterId}.json`);
}

export function guidelinesPath(folder: string, novelId: number): string {
  return join(novelDir(folder, novelId), "translation.json");
}

export async function readTranslatedChapter(folder: string, novelId: number, target: TranslationTarget, chapterId: string): Promise<TranslatedChapterRecord | null> {
  try {
    const text = await readFile(translationChapterPath(folder, novelId, target, chapterId), "utf8");
    const parsed = JSON.parse(text) as Partial<TranslatedChapterRecord>;
    return { title: parsed.title ?? "", paragraphs: parsed.paragraphs ?? [] };
  } catch {
    return null;
  }
}

export async function listTranslatedChapterIds(folder: string, novelId: number, target: TranslationTarget): Promise<string[]> {
  try {
    const names = await readdir(join(novelDir(folder, novelId), translationDirName(target)));
    return names
      .map((name) => /^chapter_([0-9a-f]{32})\.json$/.exec(name)?.[1])
      .filter((id): id is string => id !== undefined)
      .sort();
  } catch {
    return [];
  }
}

export async function readGuidelines(folder: string, novelId: number, target: TranslationTarget): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(guidelinesPath(folder, novelId), "utf8")) as { guidelines?: Record<string, string> };
    return parsed.guidelines?.[target] ?? "";
  } catch {
    return "";
  }
}

function toDictionary(row: Record<string, unknown>): DictionaryRow {
  return {
    id: Number(row["id"]),
    novelId: Number(row["novel_id"]),
    target: String(row["target"]),
    src: String(row["src"]),
    dst: String(row["dst"]),
    type: String(row["type"]),
    note: String(row["note"]),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
  };
}

export function readDictionaryById(folder: string, novelId: number, target?: TranslationTarget): DictionaryRow[] {
  const database = openReadOnly(folder);
  try {
    const rows =
      target === undefined
        ? database.prepare("SELECT * FROM ws_novel_translation_dictionary WHERE novel_id = ? ORDER BY id").all(novelId)
        : database.prepare("SELECT * FROM ws_novel_translation_dictionary WHERE novel_id = ? AND target = ? ORDER BY id").all(novelId, target);
    return rows.map(toDictionary);
  } finally {
    database.close();
  }
}

export async function readDictionary(folder: string, novel: string, target?: TranslationTarget): Promise<DictionaryRow[]> {
  return readDictionaryById(folder, readNovelPlace(folder, novel).novelId, target);
}

export function warningsOf(
  chapterId: string,
  seq: number,
  original: readonly { readonly text: string; readonly hashcheck: string }[],
  translated: TranslatedChapterRecord,
  dictionary: readonly DictionaryRow[],
): ExpectedWarning[] {
  const warnings: ExpectedWarning[] = [];
  const pairs = Math.min(original.length, translated.paragraphs.length);
  for (let index = 0; index < pairs; index += 1) {
    const source = original[index];
    const target = translated.paragraphs[index];
    if (source === undefined || target === undefined) {
      continue;
    }
    const n = index + 1;
    if (source.hashcheck !== target.originalHashcheck) {
      warnings.push({ kind: "source", chapterId, seq, n, entryId: null });
    }
    const sourceText = source.text.toLowerCase();
    const targetText = target.text.toLowerCase();
    for (const entry of dictionary) {
      const term = entry.src.trim();
      if (term !== "" && sourceText.includes(term.toLowerCase()) && !targetText.includes(entry.dst.toLowerCase())) {
        warnings.push({ kind: "dict", chapterId, seq, n, entryId: entry.id });
      }
    }
  }
  return warnings;
}

export async function readTranslationState(folder: string, novel: string, target: TranslationTarget): Promise<NovelTranslationState> {
  const placed = readNovelPlace(folder, novel);
  const dictionary = readDictionaryById(folder, placed.novelId, target);
  const chapters: Record<string, TranslatedChapterRecord> = {};
  const warnings: ExpectedWarning[] = [];
  for (const chapter of placed.chapters) {
    const translated = await readTranslatedChapter(folder, placed.novelId, target, chapter.id);
    if (translated === null) {
      continue;
    }
    chapters[chapter.id] = translated;
    const original = (await readChapterFile(folder, placed.novelId, chapter.id)).paragraphs;
    warnings.push(...warningsOf(chapter.id, chapter.seq, original, translated, dictionary));
  }
  return { novelId: placed.novelId, guidelines: await readGuidelines(folder, placed.novelId, target), dictionary, chapters, warnings };
}

export async function expectedWarnings(folder: string, novel: string, target: TranslationTarget): Promise<readonly ExpectedWarning[]> {
  return (await readTranslationState(folder, novel, target)).warnings;
}

export const DICT_ADDED = /^(đã thêm vào từ điển\.|added to the dictionary\.)$/i;
export const DICT_ADDED_FLAGGED = /đã thêm vào từ điển\. \d+ đoạn cần rà soát|added to the dictionary\. \d+ passages need review/i;
export const DICT_SAVED = /^(đã lưu mục từ điển\.|saved the dictionary entry\.)$/i;
export const DICT_SAVED_FLAGGED = /đã lưu mục từ điển\. \d+ đoạn cần rà soát|saved the dictionary entry\. \d+ passages need review/i;
export const DICT_DELETED = /đã xóa mục từ điển|dictionary entry deleted/i;
export const DICT_REQUIRED = /hãy nhập cả thuật ngữ gốc và bản dịch|enter both the source term and the translation/i;
export const DICT_EMPTY_FIELD = /thuật ngữ gốc và bản dịch không được để trống|the source term and translation cannot be empty/i;
export const DICT_DUPLICATE = /từ điển đã có mục với từ gốc này|the dictionary already has an entry with this source term/i;

export const GUIDE_SAVED = /đã lưu hướng dẫn\. \d+ chương có cảnh báo mới|saved guidelines\. \d+ chapters have new warnings/i;
export const GUIDE_UNCHANGED = /^(không có thay đổi\.|no changes\.)$/i;

export const RESULT_SAVED = /đã lưu bản dịch|translation saved/i;
export const RESULT_EMPTY = /đoạn văn không được để trống|the paragraph cannot be empty/i;
export const RESULT_UNCHANGED = /^(không có thay đổi\.|no changes\.)$/i;

export const STATUS_NONE = /^(chưa dịch|not translated)$/i;
export const STATUS_DONE = /^(đã dịch|translated)$/i;
export const STATUS_QUEUED = /^(hàng đợi|queued)$/i;
export const STATUS_RUNNING =/^(đang dịch|translating)$/i;

export const SUMMARY_NONE = /^(không có|none)$/i;
export const SUMMARY_RUNNING = /đang chạy|running/i;
export const SUMMARY_REVIEWED_LOOSE = /đã rà soát|reviewed/i;

export const WARN_KIND_DICT = /từ điển|dictionary/i;
export const WARN_FILTER_DICT = /từ điển|dictionary/i;
export const WARN_EMPTY = /không có cảnh báo|no warnings/i;
export const WARN_REASON_DICT = /đoạn gốc có “.+”, nhưng đoạn đã dịch không chứa “.+” theo từ điển|the source passage uses “.+”, but the translated passage does not contain “.+” from the dictionary/i;

export const RESULT_NONE_TITLE = /chưa có bản dịch|has no translation yet/i;
export const RESULT_NONE_ACTION = /dịch chương này|translate this chapter/i;

export const TRANSLATION_EMPTY_TITLE = /chưa có chương nào để dịch|no chapters to translate yet/i;

export const PIPELINE_STATUS_QUEUED = /^(đang chờ|queued)$/i;
export const PIPELINE_STATUS_RUNNING = /^(đang chạy|running)$/i;
export const PIPELINE_STATUS_COMPLETED = /^(hoàn tất|completed)$/i;
export const PIPELINE_STATUS_FAILED = /^(lỗi|failed)$/i;
export const PIPELINE_STATUS_CANCELLED = /^(đã hủy|cancelled)$/i;

export const PIPELINE_KIND_TRANSLATION = /^(dịch|translation)$/i;
export const PIPELINE_KIND_ANALYSIS = /^(phân tích|analysis)$/i;

export const PIPELINE_EMPTY_TITLE = /chưa có pipeline nào chạy|no pipeline has run yet/i;
export const PIPELINE_NO_MATCH_TITLE = /không có pipeline phù hợp|no pipeline matches/i;
export const PIPELINE_BOTTOM_EMPTY = /chưa có pipeline nào chạy|no pipelines running/i;
export const PIPELINE_LOG_EMPTY_TITLE = /chưa chọn pipeline nào|no pipeline selected/i;
export const PIPELINE_LOG_STARTED = /pipeline #\d+ (bắt đầu|started)/i;
export const PIPELINE_LOG_TASK_STARTED = /(bắt đầu|started)$/i;
export const PIPELINE_LOG_TASK_DONE = /(hoàn tất|completed)$/i;
export const PIPELINE_LOG_TASK_FAILED = /(lỗi|failed): /i;
export const PIPELINE_LOG_TASK_CANCELLED = /(đã hủy|cancelled)$/i;
export const PIPELINE_LOG_FINISHED = /pipeline .+ · \d+\/\d+ (xong|done) · \d+ (lỗi|failed)/i;
export const PIPELINE_FAILED_COUNT = /\d+ lỗi|\d+ failed/i;
export const PIPELINE_QUEUED_COUNT = /\+\d+ (đang chờ|queued)/i;
export const PIPELINE_PROGRESS = /\d+\/\d+ (xong|done)/i;

export const STATUSBAR_IDLE = /pipelines · idle/i;
export const STATUSBAR_RUNNING = /pipelines · \d+ (đang chạy|running) · \d+\/\d+/i;

export const PROVIDER_FAILED_EXIT = /exited with|stub provider failed/i;
export const PROVIDER_NOT_JSON = /did not return a json result|unreadable result/i;
export const PROVIDER_WRONG_COUNT = /returned \d+ paragraphs but \d+ were expected/i;
export const PROVIDER_NOT_FOUND = /was not found\. check its path in settings/i;
export const PROVIDER_NOT_SET = /no llm provider is set for/i;

const SEEDED: readonly SeedPipeline[] = [
  { novel: AZURE, kind: "translation", status: "completed", tasks: [1, 2, 3] },
  {
    novel: HARBOR,
    kind: "translation",
    status: "failed",
    tasks: [{ chapter: 1, status: "completed" }, { chapter: 2, status: "failed", error: "provider exited with code 1" }],
  },
  { novel: EMBER, kind: "analysis", status: "cancelled", tasks: [{ chapter: 1, status: "completed" }, { chapter: 2, status: "cancelled" }] },
  { novel: AZURE, kind: "analysis", status: "completed", tasks: [1, 2, 3] },
  { novel: HARBOR, kind: "translation", status: "completed", tasks: [1, 2] },
];

export function historySeed(): TranslationWorkspaceSeed {
  return {
    novels: [sampleNovel(), sampleNovel({ title: HARBOR, chapters: 2 }), sampleNovel({ title: EMBER, chapters: 2 })],
    pipelines: SEEDED,
  };
}

export function quietSeed(): TranslationWorkspaceSeed {
  return { novels: [sampleNovel(), sampleNovel({ title: HARBOR, chapters: 2 })] };
}

export async function openHistory(ui: Ui, picker: PickerStub, sandbox: Sandbox, seed: TranslationWorkspaceSeed, name = "history"): Promise<string> {
  const folder = sandbox.workspace(name);
  await seedTranslationWorkspace(folder, seed);
  await openFromSplash(ui, picker, folder);
  await showPipelineHistory(ui);
  return folder;
}
