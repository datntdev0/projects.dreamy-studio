import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, type Locator, type Page } from '@playwright/test';

// prettier-ignore
import { type DictionaryColumn, GuidelinesPage, passageLabel, TranslationDictionaryPage, TranslationReviewPage, TranslationRunPage, type TranslationStep, TranslationWarningsView, TranslationWorkspacePage, type WarningFilterKind } from '../pages/translation.ts';
import type { AppSession } from './app.ts';
import type { Ui } from './fixtures.ts';
import { openFromSplash } from './flows.ts';
import type { PickerStub } from './picker.ts';
// prettier-ignore
import { AZURE, EMBER, HARBOR, openReadOnly, type SeedPipeline,seedPipelines, showPipelineHistory } from './pipeline.ts';
import type { Sandbox } from './sandbox.ts';
// prettier-ignore
import { chapterFileName, type ChapterRecord, novelDir, readChapterFile, readParagraphs, readWorkspace, type SeedChapter, type SeedNovel,type SeedOptions, seedWorkspace, WORKSPACE_DB_FILE } from './workspaces.ts';

export const SAMPLE_TITLE = 'Azure Chronicle';

export const SAMPLE_TERMS = {
  hero: 'Lin Feng',
  healer: 'Su Yan',
  master: 'Master Chen',
  sect: 'Sky Sword Sect',
  city: 'Azure City',
  blade: 'Frost Blade',
} as const;

const STORY: readonly SeedChapter[] = [
  {
    title: 'The Arrival',
    paragraphs: [
      'Lin Feng arrived at the gates of Azure City at dawn.',
      'Master Chen, the leader of the Sky Sword Sect, watched him from the tower.',
      'Lin Feng carried the Frost Blade, a relic left by his late father.',
      'He was twenty years old and worked as a blacksmith.',
    ],
  },
  {
    title: 'The Trial',
    paragraphs: [
      'The Sky Sword Sect held its trial in the courtyard of Azure City.',
      'Master Chen asked Lin Feng to show the Frost Blade to the elders.',
      'Su Yan, a healer of the sect, whispered that the blade was cursed.',
      'Lin Feng ignored her warning and stepped forward.',
    ],
  },
  {
    title: 'The Duel',
    paragraphs: [
      'Su Yan, also known as the White Lotus, joined the duel at noon.',
      'Lin Feng fought Master Chen beneath the tower of Azure City.',
      'The Frost Blade shattered the sect banner of the Sky Sword Sect.',
      'Master Chen conceded and Lin Feng became a disciple.',
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
      paragraphs: [
        `Chapter ${seq} opens with Lin Feng on the road.`,
        `Chapter ${seq} closes at Azure City.`,
      ],
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
  const chapters =
    typeof options.chapters === 'number' || options.chapters === undefined
      ? sampleChapters(options.chapters ?? 3)
      : options.chapters;
  return {
    title: options.title ?? SAMPLE_TITLE,
    lang: options.lang ?? 'ZH',
    tags: options.tags,
    chapters,
  };
}

export const TRANSLATION_WORKSPACE_NAME = 'translation';

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
  readonly chapters: SeededNovel['chapters'];
}

export const DEFAULT_TRANSLATION_SEED: TranslationWorkspaceSeed = { novels: [sampleNovel()] };

export async function showNovelTree(ui: Ui, novel: string): Promise<void> {
  if (!(await ui.main.explorer.management.isVisible())) {
    await ui.main.showNovels();
  }
  await expect(ui.main.explorer.novel(novel)).toBeVisible();
  if (
    !(await ui.main.explorer.group(novel).getByTestId('novel-explorer-translation').isVisible())
  ) {
    await ui.main.explorer.novel(novel).click();
  }
}

export function translationEntry(ui: Ui, novel: string): Locator {
  return ui.main.explorer.group(novel).getByTestId('novel-explorer-translation');
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
  await expect(ui.main.translation.step(step)).toHaveAttribute('aria-current', 'true');
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
  const novel = options.novel ?? seed.novels[0]?.title ?? '';
  const place = seeded.novels[novel];
  if (place === undefined) {
    throw new Error(`the seed has no novel titled ${novel}`);
  }
  await showTranslation(ui, novel);
  if (options.target !== undefined) {
    await selectTarget(ui, options.target);
  }
  if (
    step !== undefined &&
    (seed.novels.find((item) => item.title === novel)?.chapters?.length ?? 0) > 0
  ) {
    await goToStep(ui, step);
  }
  return { folder, seeded, novel, novelId: place.id, chapters: place.chapters };
}

export async function openRunDialog(ui: Ui): Promise<void> {
  await goToStep(ui, 'trans');
  const start = ui.main.translation.root.getByTestId('novel-translation-pipeline-start');
  await expect(start).toBeEnabled();
  await start.click();
  await expect(ui.main.translation.runDialog.panel).toBeVisible();
}

export async function reopenRunStep(
  ui: Ui,
  app: AppSession,
  picker: PickerStub,
  folder: string,
  novel: string,
): Promise<void> {
  await app.restart();
  await expect(ui.splash.root).toBeVisible();
  await openFromSplash(ui, picker, folder);
  await showTranslation(ui, novel);
  await goToStep(ui, 'trans');
}

export async function translateChapters(ui: Ui, seqs: readonly number[]): Promise<void> {
  const sorted = [...seqs].sort((left, right) => left - right);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined || last - first + 1 !== sorted.length) {
    throw new Error('translateChapters needs a contiguous range of chapters');
  }
  const dialog = ui.main.translation.runDialog;
  await openRunDialog(ui);
  await dialog.mode('range').click();
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
  return ui.main.translation.root.getByTestId('novel-translation-pipeline-row').nth(seq - 1);
}

export function chapterStatus(ui: Ui, seq: number): Locator {
  return chapterRow(ui, seq).getByTestId('novel-translation-pipeline-status');
}

export const ZH_NOVEL = 'Azure Chronicle';
export const VI_NOVEL = 'Bến Cảng Sớm';
export const EN_NOVEL = 'Harbor Lights';
export const EMPTY_NOVEL = 'Blank Scroll';

export const STEP_LABELS: Readonly<Record<TranslationStep, string>> = {
  dict: 'Dictionary',
  guide: 'Guidelines',
  trans: 'Translate',
  result: 'Results',
  warn: 'Warnings',
};

export const TARGET_LABELS = {
  VI: 'Vietnamese',
  EN: 'English',
} as const;

export const SUMMARY_DICT_TWO = '2 entries';
export const SUMMARY_DICT_ONE = '1 entries';
export const SUMMARY_GUIDE_WRITTEN = 'Written';
export const SUMMARY_GUIDE_EMPTY = 'Empty';
export const SUMMARY_TRANS = '0/3 chapters';
export const SUMMARY_REVIEWED = 'All reviewed';
export const SUMMARY_WARN_NONE = 'None';
export const EMPTY_TITLE = 'No chapters to translate yet';

export function workspacePage(ui: Ui): TranslationWorkspacePage {
  return new TranslationWorkspacePage(ui.main.translation.root.page());
}

export function workspaceSeed(): TranslationWorkspaceSeed {
  return {
    novels: [
      sampleNovel({ title: ZH_NOVEL, lang: 'ZH' }),
      sampleNovel({ title: VI_NOVEL, lang: 'VI', chapters: 1 }),
      sampleNovel({ title: EN_NOVEL, lang: 'EN', chapters: 1 }),
      { title: EMPTY_NOVEL, lang: 'ZH' },
    ],
    translations: [
      {
        novel: ZH_NOVEL,
        target: 'VI',
        guidelines: 'Keep a formal, archaic tone.',
        dictionary: [
          { src: 'Lin Feng', dst: 'Lâm Phong', type: 'name' },
          { src: 'Azure City', dst: 'Thành Thanh Lam', type: 'place' },
        ],
      },
      {
        novel: ZH_NOVEL,
        target: 'EN',
        dictionary: [{ src: 'Lin Feng', dst: 'Lin Feng', type: 'name' }],
      },
    ],
  };
}

export const DICT_NO_MATCH_HINT = 'Try another keyword.';

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

export function dictionaryCount(shown: number, total: number): string {
  return `${shown}/${total} entries`;
}

export async function openDictionary(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  entries: Readonly<Partial<Record<TranslationTarget, readonly SeedDictEntry[]>>>,
  target: TranslationTarget = 'VI',
): Promise<OpenedDictionary> {
  const novel = sampleNovel();
  const translations = (Object.keys(entries) as TranslationTarget[]).map((key) => ({
    novel: novel.title,
    target: key,
    dictionary: entries[key],
  }));
  const opened = await openTranslation(
    ui,
    picker,
    sandbox,
    { novels: [novel], translations },
    'dict',
    { target },
  );
  const dictionary = new TranslationDictionaryPage(ui.main.translation.host.page());
  await expect(dictionary.root).toBeVisible();
  return { folder: opened.folder, novel: opened.novel, dictionary };
}

export async function fillDraft(
  dictionary: TranslationDictionaryPage,
  draft: Partial<DictionaryDraft>,
): Promise<void> {
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

export async function startDraft(
  dictionary: TranslationDictionaryPage,
  draft: Partial<DictionaryDraft>,
): Promise<void> {
  await dictionary.create.click();
  await expect(dictionary.draftSrc).toBeVisible();
  await fillDraft(dictionary, draft);
}

export async function addEntry(
  dictionary: TranslationDictionaryPage,
  draft: Partial<DictionaryDraft>,
): Promise<void> {
  await startDraft(dictionary, draft);
  await dictionary.add.click();
}

export async function editCell(
  dictionary: TranslationDictionaryPage,
  row: Locator,
  column: DictionaryColumn,
  value: string,
): Promise<void> {
  await dictionary.cell(row, column).dblclick();
  await expect(dictionary.cellInput).toBeVisible();
  if (column === 'type') {
    await dictionary.cellInput.selectOption(value);
    return;
  }
  await dictionary.cellInput.fill(value);
  await dictionary.cellInput.press('Enter');
}

export async function removeEntry(
  dictionary: TranslationDictionaryPage,
  row: Locator,
): Promise<void> {
  await dictionary.menu(row).click();
  await dictionary.deleteAction.click();
}

export const GUIDELINES_SAVED = 'Saved guidelines.';

export function guidelinesOf(page: Page): GuidelinesPage {
  return new GuidelinesPage(page);
}

export async function saveGuidelines(guide: GuidelinesPage, text?: string): Promise<void> {
  if (text !== undefined) {
    await guide.prompt.fill(text);
  }
  await guide.save.click();
}

export async function reopenGuidelines(
  ui: Ui,
  app: AppSession,
  picker: PickerStub,
  folder: string,
  novel: string,
  target: TranslationTarget,
): Promise<GuidelinesPage> {
  await app.restart();
  await expect(ui.splash.root).toBeVisible();
  await openFromSplash(ui, picker, folder);
  await showTranslation(ui, novel);
  await selectTarget(ui, target);
  await goToStep(ui, 'guide');
  return guidelinesOf(app.page);
}

export const RUN_NOVEL = 'Azure Chronicle';
export const RUN_TARGET: TranslationTarget = 'VI';
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

export function savedChapter(
  folder: string,
  novelId: number,
  chapterId: string,
): Promise<TranslatedChapterRecord | null> {
  return readTranslatedChapter(folder, novelId, RUN_TARGET, chapterId);
}

export async function hasTranslationFile(
  folder: string,
  novelId: number,
  chapterId: string,
): Promise<boolean> {
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

export const REVIEW_TARGET = 'VI';

export const FIRST_CHAPTER = [
  'Lam Phong den cong Thanh Lam luc binh minh.',
  'Truong lao Tran, thu linh cua mon phai, nhin cau tu thap canh.',
  'Mot thanh kiem bang la di vat cua cha cau.',
  'Cau hai muoi tuoi va lam nghe ren.',
] as const;

export const SECOND_CHAPTER = [
  'Mon phai to chuc thu thach tai san dinh.',
  'Truong lao Tran bao Lam Phong trinh kiem cho cac truong lao.',
  'Tu Yen thi tham rang thanh kiem bi nguyen rua.',
  'Lam Phong lo loi canh bao va buoc toi.',
] as const;

export const REVIEW_SEED: TranslationWorkspaceSeed = {
  novels: [sampleNovel()],
  translations: [
    {
      novel: 'Azure Chronicle',
      target: REVIEW_TARGET,
      dictionary: [{ src: 'Lin Feng', dst: 'Lam Phong', type: 'name' }],
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
      novel: 'Azure Chronicle',
      target: REVIEW_TARGET,
      chapters: [{ chapter: 1, paragraphs: FIRST_CHAPTER, notes: { 2: 'Check the sect title' } }],
    },
  ],
};

export const SOURCE_FIRST = sampleChapters()[0]?.paragraphs ?? [];
export const SOURCE_SECOND = sampleChapters()[1]?.paragraphs ?? [];

export function review(app: AppSession): TranslationReviewPage {
  return new TranslationReviewPage(app.page);
}

export async function openResult(ui: Ui, app: AppSession): Promise<TranslationReviewPage> {
  await goToStep(ui, 'result');
  return review(app);
}

export async function storedParagraphs(
  opened: OpenedTranslation,
  chapter: number,
): Promise<readonly TranslatedParagraphRecord[]> {
  const id = opened.chapters[chapter];
  if (id === undefined) {
    throw new Error(`the seed has no chapter ${chapter}`);
  }
  const record = await readTranslatedChapter(opened.folder, opened.novelId, REVIEW_TARGET, id);
  expect(record).not.toBeNull();
  return record?.paragraphs ?? [];
}

export async function reopenResult(ui: Ui, app: AppSession): Promise<TranslationReviewPage> {
  await goToStep(ui, 'dict');
  return openResult(ui, app);
}

export const WARNINGS_NOVEL = SAMPLE_TITLE;
export const WARNINGS_TARGET = 'VI';

export const FILTER_LABELS: Readonly<Record<WarningFilterKind, string>> = {
  all: 'All',
  dict: 'Dictionary',
};

export const HERO_TEXT = 'Lâm Phong mang thanh Kiếm Băng, di vật của người cha quá cố.';

export const DICTIONARY_SEED: TranslationWorkspaceSeed = {
  novels: [sampleNovel()],
  translations: [
    {
      novel: WARNINGS_NOVEL,
      target: WARNINGS_TARGET,
      dictionary: [{ src: 'Lin Feng', dst: 'Lâm Phong', type: 'name' }],
      chapters: [
        {
          chapter: 1,
          paragraphs: [
            'Lâm Phong đến cổng thành Azure vào lúc bình minh.',
            'Thầy Trần, thủ lĩnh của Tông Thiên Kiếm, quan sát hắn từ tháp.',
            'Hắn mang thanh Kiếm Băng, di vật của người cha quá cố.',
            'Hắn hai mươi tuổi và làm nghề thợ rèn.',
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
      dictionary: [{ src: 'Lin Feng', dst: 'Lâm Phong', type: 'name' }],
      chapters: [
        {
          chapter: 1,
          paragraphs: [
            'Lâm Phong đến cổng thành Azure lúc bình minh.',
            'Thầy Trần quan sát hắn từ trên tháp.',
            'Hắn mang thanh Kiếm Băng.',
            'Hắn hai mươi tuổi.',
          ],
        },
        {
          chapter: 2,
          paragraphs: [
            'Tông môn tổ chức thử thách ở sân.',
            'Thầy Trần yêu cầu hắn trình kiếm.',
            'Tô Yến thì thầm rằng thanh kiếm bị nguyền.',
            'Hắn phớt lờ lời cảnh báo.',
          ],
        },
      ],
    },
  ],
};

export function warningsView(ui: Ui): TranslationWarningsView {
  return new TranslationWarningsView(ui.main.translation.root.page());
}

export function filterText(kind: WarningFilterKind, count: number): string {
  return `${FILTER_LABELS[kind]} ${count}`;
}

export function flaggedToast(count: number): string {
  return `Added to the dictionary. ${count} passages need review.`;
}

export function expectedLabels(warnings: readonly ExpectedWarning[]): string[] {
  return warnings
    .map((warning) => `${warning.kind}|${passageLabel(warning.seq, warning.n)}`)
    .sort();
}

function readLabels(cards: Element[]): string[] {
  return cards.map((card) => card.querySelector('.chip')?.textContent?.trim() ?? '');
}

export async function shownLabels(view: TranslationWarningsView): Promise<string[]> {
  const labels = await view.cards.evaluateAll(readLabels);
  return labels.map((label) => `dict|${label}`).sort();
}

export async function addDictionaryEntry(ui: Ui, src: string, dst: string): Promise<void> {
  const view = warningsView(ui);
  await goToStep(ui, 'dict');
  await view.dictNew.click();
  await view.dictSource.fill(src);
  await view.dictTranslation.fill(dst);
  await view.dictAdd.click();
}

export async function deleteFirstDictionaryEntry(ui: Ui): Promise<void> {
  const view = warningsView(ui);
  await goToStep(ui, 'dict');
  await view.dictRows.first().getByTestId('datatable-row-menu').click();
  await view.deleteAction.click();
  await expect(ui.main.toast(DICT_DELETED)).toBeVisible();
}

export async function editTranslatedParagraph(
  ui: Ui,
  seq: number,
  n: number,
  text: string,
): Promise<void> {
  const view = warningsView(ui);
  await goToStep(ui, 'result');
  await view.resultJump.selectOption(String(seq));
  await expect(view.resultPairs.first()).toBeVisible();
  await view.resultText(n).click();
  await view.resultEditor.fill(text);
  await view.resultSave.click();
  await expect(ui.main.toast(RESULT_SAVED)).toBeVisible();
  await expect(view.resultEditor).toBeHidden();
}

const TRANSLATION_BASE_TIME = Date.UTC(2026, 0, 3, 9, 0, 0);

export type DictKind = 'name' | 'place' | 'org' | 'title' | 'term';

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
  return createHash('sha256').update(text).digest('hex');
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

async function writeGuidelines(
  folder: string,
  novelId: number,
  target: TranslationTarget,
  text: string,
): Promise<void> {
  const path = guidelinesPath(folder, novelId);
  let current: { guidelines?: Record<string, string> } = {};
  try {
    current = JSON.parse(await readFile(path, 'utf8')) as { guidelines?: Record<string, string> };
  } catch {
    current = {};
  }
  await writeJson(path, { guidelines: { ...(current.guidelines ?? {}), [target]: text } });
}

const DICTIONARY_FILE = 'dictionary.jsonl';
const TARGETS: readonly TranslationTarget[] = ['VI', 'EN'];

interface StoredDictEntry {
  readonly id: number;
  readonly src: string;
  readonly dst: string;
  readonly type: string;
  readonly note: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function dictionaryPath(folder: string, novelId: number, target: TranslationTarget): string {
  return join(novelDir(folder, novelId), translationDirName(target), DICTIONARY_FILE);
}

function readStoredDictionary(
  folder: string,
  novelId: number,
  target: TranslationTarget,
): StoredDictEntry[] {
  const path = dictionaryPath(folder, novelId, target);
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as StoredDictEntry);
}

async function writeDictionary(
  folder: string,
  novelId: number,
  target: TranslationTarget,
  entries: readonly SeedDictEntry[],
): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  if (entries.length === 0) {
    return ids;
  }
  const stored = readStoredDictionary(folder, novelId, target);
  let next = Math.max(0, ...readDictionaryById(folder, novelId).map((row) => row.id)) + 1;
  for (const [index, entry] of entries.entries()) {
    const stamp = new Date(TRANSLATION_BASE_TIME + index * 1000).toISOString();
    stored.push({
      id: next,
      src: entry.src,
      dst: entry.dst,
      type: entry.type ?? 'term',
      note: entry.note ?? '',
      createdAt: stamp,
      updatedAt: stamp,
    });
    ids[entry.src] = next;
    next += 1;
  }
  const path = dictionaryPath(folder, novelId, target);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stored.map((item) => `${JSON.stringify(item)}\n`).join(''));
  return ids;
}

function markTranslated(database: DatabaseSync, chapterIds: readonly string[]): void {
  const update = database.prepare(
    "UPDATE ws_novel_chapters SET translation_status = 'done' WHERE id = ?",
  );
  for (const id of chapterIds) {
    update.run(id);
  }
}

async function chapterRecord(
  folder: string,
  place: SeededNovel,
  target: TranslationTarget,
  seed: SeedTranslatedChapter,
  chapterTitle: string,
): Promise<TranslatedChapterRecord> {
  const chapterId = place.chapters[seed.chapter];
  if (chapterId === undefined) {
    throw new Error(`translation seed references an unknown chapter ${seed.chapter}`);
  }
  const source = await readParagraphs(folder, place.id, chapterId);
  const stale = new Set(seed.staleSource ?? []);
  const paragraphs = source.map((text, index) => ({
    originalHashcheck: stale.has(index + 1) ? staleHash(text) : paragraphHash(text),
    text: seed.paragraphs?.[index] ?? taggedCopy(target, text),
    note: seed.notes?.[index + 1] ?? '',
  }));
  return { title: seed.title ?? taggedCopy(target, chapterTitle), paragraphs };
}

export async function seedTranslation(
  folder: string,
  seed: TranslationSeed,
): Promise<SeededTranslation> {
  const place = await placeOf(folder, seed.novel);
  const titles = await readWorkspace(folder, (db) =>
    db.chapters(seed.novel).map((chapter) => chapter.title),
  );
  const translatedIds: string[] = [];
  for (const chapter of seed.chapters ?? []) {
    const record = await chapterRecord(
      folder,
      place,
      seed.target,
      chapter,
      titles[chapter.chapter - 1] ?? '',
    );
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
  const dictionary = await writeDictionary(folder, place.id, seed.target, seed.dictionary ?? []);
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  try {
    database.exec('BEGIN');
    markTranslated(database, translatedIds);
    database.exec('COMMIT');
  } finally {
    database.close();
  }
  return { novelId: place.id, target: seed.target, dictionary };
}

export async function editSourceParagraph(
  folder: string,
  novelId: number,
  chapterId: string,
  n: number,
  text: string,
): Promise<void> {
  const path = join(novelDir(folder, novelId), chapterFileName(chapterId));
  const file = JSON.parse(await readFile(path, 'utf8')) as {
    paragraphs: { text: string; hashcheck: string }[];
  };
  const paragraph = file.paragraphs[n - 1];
  if (paragraph === undefined) {
    throw new Error(`chapter has no paragraph ${n}`);
  }
  paragraph.text = text;
  paragraph.hashcheck = paragraphHash(text);
  await writeFile(path, JSON.stringify(file, null, 2));
}

export async function seedTranslationWorkspace(
  folder: string,
  seed: TranslationWorkspaceSeed,
  options: SeedOptions = {},
): Promise<SeededTranslationWorkspace> {
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

export type TranslationTarget = 'VI' | 'EN';
export type WarningKind = 'source' | 'dict';

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
  readonly chapters: readonly {
    readonly id: string;
    readonly seq: number;
    readonly title: string;
  }[];
}

export function readNovelPlace(folder: string, novel: string): NovelPlace {
  const database = openReadOnly(folder);
  try {
    const row = database.prepare('SELECT id FROM ws_novels WHERE title = ?').get(novel);
    if (row === undefined) {
      throw new Error(`no novel titled ${novel}`);
    }
    const novelId = Number(row['id']);
    const rows = database
      .prepare('SELECT id, seq, title FROM ws_novel_chapters WHERE novel_id = ? ORDER BY seq')
      .all(novelId);
    return {
      novelId,
      chapters: rows.map((item) => ({
        id: String(item['id']),
        seq: Number(item['seq']),
        title: String(item['title']),
      })),
    };
  } finally {
    database.close();
  }
}

export function translationDirName(target: TranslationTarget): string {
  return `translation_${target.toLowerCase()}`;
}

export function translationChapterPath(
  folder: string,
  novelId: number,
  target: TranslationTarget,
  chapterId: string,
): string {
  return join(novelDir(folder, novelId), translationDirName(target), `chapter_${chapterId}.json`);
}

export function guidelinesPath(folder: string, novelId: number): string {
  return join(novelDir(folder, novelId), 'translation.json');
}

export async function readTranslatedChapter(
  folder: string,
  novelId: number,
  target: TranslationTarget,
  chapterId: string,
): Promise<TranslatedChapterRecord | null> {
  try {
    const text = await readFile(translationChapterPath(folder, novelId, target, chapterId), 'utf8');
    const parsed = JSON.parse(text) as Partial<TranslatedChapterRecord>;
    return { title: parsed.title ?? '', paragraphs: parsed.paragraphs ?? [] };
  } catch {
    return null;
  }
}

export async function listTranslatedChapterIds(
  folder: string,
  novelId: number,
  target: TranslationTarget,
): Promise<string[]> {
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

export async function readGuidelines(
  folder: string,
  novelId: number,
  target: TranslationTarget,
): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(guidelinesPath(folder, novelId), 'utf8')) as {
      guidelines?: Record<string, string>;
    };
    return parsed.guidelines?.[target] ?? '';
  } catch {
    return '';
  }
}

export function readDictionaryById(
  folder: string,
  novelId: number,
  target?: TranslationTarget,
): DictionaryRow[] {
  const targets = target === undefined ? TARGETS : [target];
  return targets
    .flatMap((key) =>
      readStoredDictionary(folder, novelId, key).map((entry) => ({
        ...entry,
        novelId,
        target: key,
      })),
    )
    .sort((a, b) => a.id - b.id);
}

export async function readDictionary(
  folder: string,
  novel: string,
  target?: TranslationTarget,
): Promise<DictionaryRow[]> {
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
      warnings.push({ kind: 'source', chapterId, seq, n, entryId: null });
    }
    const sourceText = source.text.toLowerCase();
    const targetText = target.text.toLowerCase();
    for (const entry of dictionary) {
      const term = entry.src.trim();
      if (
        term !== '' &&
        sourceText.includes(term.toLowerCase()) &&
        !targetText.includes(entry.dst.toLowerCase())
      ) {
        warnings.push({ kind: 'dict', chapterId, seq, n, entryId: entry.id });
      }
    }
  }
  return warnings;
}

export async function readTranslationState(
  folder: string,
  novel: string,
  target: TranslationTarget,
): Promise<NovelTranslationState> {
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
  return {
    novelId: placed.novelId,
    guidelines: await readGuidelines(folder, placed.novelId, target),
    dictionary,
    chapters,
    warnings,
  };
}

export async function expectedWarnings(
  folder: string,
  novel: string,
  target: TranslationTarget,
): Promise<readonly ExpectedWarning[]> {
  return (await readTranslationState(folder, novel, target)).warnings;
}

export const DICT_ADDED = 'Added to the dictionary.';
export const DICT_SAVED = 'Saved the dictionary entry.';
export const DICT_DELETED = 'Dictionary entry deleted.';
export const DICT_REQUIRED = 'Enter both the source term and the translation.';
export const DICT_EMPTY_FIELD = 'The source term and translation cannot be empty.';
export const DICT_DUPLICATE = 'The dictionary already has an entry with this source term.';

export const GUIDE_UNCHANGED = 'No changes.';

export const RESULT_SAVED = 'Translation saved.';
export const RESULT_EMPTY = 'The paragraph cannot be empty.';
export const RESULT_UNCHANGED = 'No changes.';

export const STATUS_NONE = 'Not translated';
export const STATUS_DONE = 'Translated';
export const STATUS_QUEUED = 'Queued';
export const STATUS_RUNNING = 'Translating';

export const SUMMARY_NONE = 'None';
export const SUMMARY_RUNNING = 'Translating…';
export const SUMMARY_REVIEWED_LOOSE = 'All reviewed';

export const WARN_KIND_DICT = 'Dictionary';
export const WARN_FILTER_DICT = 'Dictionary';
export const WARN_EMPTY = 'No warnings';
export const WARN_REASON_DICT =
  'The source passage uses “Lin Feng”, but the translated passage does not contain “Lâm Phong” from the dictionary.';

export const RESULT_NONE_TITLE = 'Ch.3 has no translation yet';
export const RESULT_NONE_ACTION = 'Translate this chapter';

export const TRANSLATION_EMPTY_TITLE = 'No chapters to translate yet';

export const PIPELINE_STATUS_QUEUED = 'Queued';
export const PIPELINE_STATUS_RUNNING = 'Running';
export const PIPELINE_STATUS_COMPLETED = 'Completed';
export const PIPELINE_STATUS_FAILED = 'Failed';
export const PIPELINE_STATUS_CANCELLED = 'Cancelled';

export const PIPELINE_KIND_TRANSLATION = 'Translation';
export const PIPELINE_KIND_ANALYSIS = 'Analysis';

export const PIPELINE_EMPTY_TITLE = 'No pipeline has run yet';
export const PIPELINE_NO_MATCH_TITLE = 'No pipeline matches';
export const PIPELINE_BOTTOM_EMPTY = 'No pipelines running';
export const PIPELINE_LOG_EMPTY_TITLE = 'No pipeline selected';
export const PIPELINE_LOG_STARTED = 'started · Translation VI · 3 tasks';
export const PIPELINE_LOG_TASK_STARTED = 'Ch.1 · The Arrival started';
export const PIPELINE_LOG_TASK_FAILED = 'Ch.1 · The Arrival failed:';
export const PIPELINE_LOG_TASK_CANCELLED = 'Ch.2 · The Trial cancelled';
export const PIPELINE_FAILED_COUNT = '1 failed';
export const PIPELINE_QUEUED_COUNT = '+1 queued';
export const PIPELINE_PROGRESS = '0/3 done';

export const STATUSBAR_IDLE = 'Pipelines · Idle';
export const STATUSBAR_RUNNING = 'Pipelines · 1 running';

export const PROVIDER_NOT_JSON = 'The model did not return a JSON result.';
export const PROVIDER_WRONG_COUNT = 'The model returned 3 paragraphs but 4 were expected.';
export const PROVIDER_NOT_SET = 'No LLM provider is set for';

const SEEDED: readonly SeedPipeline[] = [
  { novel: AZURE, kind: 'translation', status: 'completed', tasks: [1, 2, 3] },
  {
    novel: HARBOR,
    kind: 'translation',
    status: 'failed',
    tasks: [
      { chapter: 1, status: 'completed' },
      { chapter: 2, status: 'failed', error: 'provider exited with code 1' },
    ],
  },
  {
    novel: EMBER,
    kind: 'analysis',
    status: 'cancelled',
    tasks: [
      { chapter: 1, status: 'completed' },
      { chapter: 2, status: 'cancelled' },
    ],
  },
  { novel: AZURE, kind: 'analysis', status: 'completed', tasks: [1, 2, 3] },
  { novel: HARBOR, kind: 'translation', status: 'completed', tasks: [1, 2] },
];

export function historySeed(): TranslationWorkspaceSeed {
  return {
    novels: [
      sampleNovel(),
      sampleNovel({ title: HARBOR, chapters: 2 }),
      sampleNovel({ title: EMBER, chapters: 2 }),
    ],
    pipelines: SEEDED,
  };
}

export function quietSeed(): TranslationWorkspaceSeed {
  return { novels: [sampleNovel(), sampleNovel({ title: HARBOR, chapters: 2 })] };
}

export async function openHistory(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  seed: TranslationWorkspaceSeed,
  name = 'history',
): Promise<string> {
  const folder = sandbox.workspace(name);
  await seedTranslationWorkspace(folder, seed);
  await openFromSplash(ui, picker, folder);
  await showPipelineHistory(ui);
  return folder;
}
