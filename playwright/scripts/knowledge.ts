import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, type Locator, type Page } from '@playwright/test';

// prettier-ignore
import { type AnalyzeMode, type ExtractionDialog, type GraphGroupKey, KnowledgeEditingPage, KnowledgeReviewPage, type KnowledgeTab, type PreviewState } from '../pages/knowledge.ts';
import type { Ui } from './fixtures.ts';
import { openFromSplash } from './flows.ts';
import type { PickerStub } from './picker.ts';
import { type SeedPipeline, seedPipelines } from './pipeline.ts';
import type { ProviderAnalysis, ProviderBehavior } from './provider.ts';
import type { Sandbox } from './sandbox.ts';
// prettier-ignore
import { readNovelPlace, readTranslatedChapter, SAMPLE_TITLE, sampleNovel, type SeededNovel, seedTranslation, type TranslationSeed } from './translation.ts';
// prettier-ignore
import { countWords, novelDir, readParagraphs, readWorkspace, type SeedNovel,type SeedOptions, seedWorkspace, WORKSPACE_DB_FILE } from './workspaces.ts';

export const CLEAN_ANALYSES: readonly SeedAnalysis[] = [
  {
    chapter: 1,
    personas: [{ name: 'Lin Feng' }, { name: 'Master Chen' }],
    entities: [
      { type: 'organization', name: 'Sky Sword Sect' },
      { type: 'location', name: 'Azure City' },
      { type: 'artifact', name: 'Frost Blade' },
    ],
    facts: [
      { pred: 'leader_of', subject: 'Master Chen', object: 'Sky Sword Sect' },
      { pred: 'owns', subject: 'Lin Feng', object: 'Frost Blade' },
      {
        pred: 'age',
        subject: 'Lin Feng',
        p: 4,
        quote: 'He was twenty years old and worked as a blacksmith.',
      },
      {
        pred: 'occupation',
        subject: 'Lin Feng',
        p: 4,
        quote: 'He was twenty years old and worked as a blacksmith.',
      },
    ],
  },
  {
    chapter: 2,
    personas: [{ name: 'Lin Feng' }, { name: 'Master Chen' }, { name: 'Su Yan' }],
    entities: [
      { type: 'organization', name: 'Sky Sword Sect' },
      { type: 'location', name: 'Azure City' },
      { type: 'artifact', name: 'Frost Blade' },
    ],
    facts: [
      {
        pred: 'member_of',
        subject: 'Su Yan',
        object: 'Sky Sword Sect',
        p: 3,
        quote: 'Su Yan, a healer of the sect, whispered that the blade was cursed.',
      },
      {
        pred: 'occupation',
        subject: 'Su Yan',
        p: 3,
        quote: 'Su Yan, a healer of the sect, whispered that the blade was cursed.',
      },
    ],
  },
  {
    chapter: 3,
    personas: [
      { name: 'Lin Feng' },
      { name: 'Master Chen' },
      { name: 'Su Yan', aliases: ['White Lotus'] },
    ],
    entities: [
      { type: 'organization', name: 'Sky Sword Sect' },
      { type: 'location', name: 'Azure City' },
      { type: 'artifact', name: 'Frost Blade' },
    ],
    facts: [{ pred: 'enemy_of', subject: 'Lin Feng', object: 'Master Chen', p: 2 }],
  },
];

export const RULE_FIXTURES: Readonly<Record<RuleName, readonly SeedAnalysis[]>> = {
  entity_duplicate: [
    { chapter: 1, personas: [{ name: 'Lin Feng' }] },
    { chapter: 2, personas: [{ name: 'Feng', character: 'Lin Feng' }] },
  ],
  source_stale: [{ chapter: 1, stale: true, personas: [{ name: 'Lin Feng' }] }],
  evidence: [
    {
      chapter: 1,
      personas: [{ name: 'Lin Feng' }],
      entities: [
        { type: 'location', name: 'Azure City', ev: [] },
        {
          type: 'artifact',
          name: 'Frost Blade',
          ev: [{ p: 3, q: 'a sword that appears nowhere in this paragraph' }],
        },
      ],
    },
  ],
  relation_signature: [
    {
      chapter: 2,
      personas: [{ name: 'Lin Feng' }, { name: 'Master Chen' }],
      facts: [{ pred: 'member_of', subject: 'Lin Feng', object: 'Master Chen', p: 2 }],
    },
  ],
  relation_unique: [
    {
      chapter: 1,
      personas: [{ name: 'Lin Feng' }, { name: 'Master Chen' }],
      entities: [{ type: 'organization', name: 'Sky Sword Sect' }],
      facts: [
        { pred: 'leader_of', subject: 'Master Chen', object: 'Sky Sword Sect' },
        {
          pred: 'leader_of',
          subject: 'Lin Feng',
          object: 'Sky Sword Sect',
          p: 3,
          quote: 'Lin Feng carried the Frost Blade, a relic left by his late father.',
        },
      ],
    },
  ],
  character_predicate: [
    {
      chapter: 1,
      personas: [{ name: 'Lin Feng' }],
      entities: [{ type: 'artifact', name: 'Frost Blade' }],
      facts: [{ pred: 'owns', subject: 'character:Lin Feng', object: 'Frost Blade', p: 3 }],
    },
  ],
  persona_link: [
    {
      chapter: 1,
      personas: [{ name: 'Lin Feng' }],
      entities: [{ type: 'persona', name: 'Master Chen' }],
    },
  ],
};

export async function seedKnowledgeWorkspace(
  folder: string,
  seed: KnowledgeWorkspaceSeed,
  options: SeedOptions = {},
): Promise<SeededKnowledgeWorkspace> {
  await seedWorkspace(folder, { ...options, novels: seed.novels });
  for (const translation of seed.translations ?? []) {
    await seedTranslation(folder, translation);
  }
  const knowledge: SeededKnowledge[] = [];
  for (const item of seed.knowledge ?? []) {
    knowledge.push(await seedKnowledge(folder, item));
  }
  const pipelines = await seedPipelines(folder, seed.pipelines ?? []);
  const novels: Record<string, SeededNovel> = {};
  for (const novel of seed.novels) {
    novels[novel.title] = await readWorkspace(folder, (db) => {
      const chapters: Record<number, string> = {};
      for (const chapter of db.chapters(novel.title)) {
        chapters[chapter.seq] = chapter.id;
      }
      return { id: db.novelId(novel.title), chapters };
    });
  }
  return { novels, knowledge, pipelines };
}

export const KNOWLEDGE_WORKSPACE_NAME = 'knowledge';

export interface KnowledgeOpenOptions {
  readonly novel?: string;
  readonly lang?: 'src' | 'VI' | 'EN';
  readonly seedOptions?: SeedOptions;
}

export interface OpenedKnowledge {
  readonly folder: string;
  readonly seeded: SeededKnowledgeWorkspace;
  readonly novel: string;
  readonly novelId: number;
  readonly chapters: Readonly<Record<number, string>>;
  readonly entityIds: Readonly<Record<string, string>>;
  readonly factIds: Readonly<Record<string, string>>;
}

export const DEFAULT_KNOWLEDGE_SEED: KnowledgeWorkspaceSeed = {
  novels: [sampleNovel()],
  knowledge: [{ novel: 'Azure Chronicle', analyses: CLEAN_ANALYSES }],
};

export function knowledgeEntry(ui: Ui, novel: string): Locator {
  return ui.main.explorer.group(novel).getByTestId('novel-explorer-knowledge');
}

export async function showKnowledge(
  ui: Ui,
  novel: string,
  lang?: 'src' | 'VI' | 'EN',
): Promise<void> {
  if (!(await ui.main.explorer.management.isVisible())) {
    await ui.main.showNovels();
  }
  await expect(ui.main.explorer.novel(novel)).toBeVisible();
  if (!(await knowledgeEntry(ui, novel).isVisible())) {
    await ui.main.explorer.novel(novel).click();
  }
  await knowledgeEntry(ui, novel).click();
  await expect(ui.main.knowledge.tab.filter({ hasText: novel })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(ui.main.knowledge.host).toBeVisible();
  await expect(ui.main.knowledge.root).toBeVisible();
  if (lang !== undefined) {
    await selectLang(ui, lang);
  }
}

export async function goToTab(ui: Ui, tab: KnowledgeTab): Promise<void> {
  await ui.main.knowledge.tabButton(tab).click();
  await expect(ui.main.knowledge.tabButton(tab)).toHaveAttribute('aria-pressed', 'true');
  await expect(ui.main.knowledge.tabRoot(tab)).toBeVisible();
}

export async function selectLang(ui: Ui, lang: 'src' | 'VI' | 'EN'): Promise<void> {
  await ui.main.knowledge.lang.selectOption(lang);
  await expect(ui.main.knowledge.lang).toHaveValue(lang);
}

export async function openKnowledge(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  seed: KnowledgeWorkspaceSeed = DEFAULT_KNOWLEDGE_SEED,
  tab?: KnowledgeTab,
  options: KnowledgeOpenOptions = {},
): Promise<OpenedKnowledge> {
  const folder = sandbox.workspace(KNOWLEDGE_WORKSPACE_NAME);
  const seeded = await seedKnowledgeWorkspace(folder, seed, options.seedOptions);
  await openFromSplash(ui, picker, folder);
  const novel = options.novel ?? seed.novels[0]?.title ?? '';
  const place = seeded.novels[novel];
  if (place === undefined) {
    throw new Error(`the seed has no novel titled ${novel}`);
  }
  await showKnowledge(ui, novel);
  const own = seed.knowledge?.find((item) => item.novel === novel);
  const hasKnowledge = own !== undefined && own.analyses.length > 0;
  if (hasKnowledge) {
    await selectLang(ui, options.lang ?? own.analyses[0]?.lang ?? 'src');
  }
  if (tab !== undefined && hasKnowledge) {
    await goToTab(ui, tab);
  }
  const first =
    seeded.knowledge[(seed.knowledge ?? []).findIndex((item) => item.novel === novel)] ??
    seeded.knowledge[0];
  return {
    folder,
    seeded,
    novel,
    novelId: place.id,
    chapters: place.chapters,
    entityIds: first?.entityIds ?? {},
    factIds: first?.factIds ?? {},
  };
}

export async function openAnalyzeDialog(ui: Ui): Promise<void> {
  const knowledge = ui.main.knowledge;
  const trigger = (await knowledge.analyze.isVisible())
    ? knowledge.analyze
    : knowledge.emptyAnalyze;
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(knowledge.analyzeDialog.panel).toBeVisible();
}

export async function startAnalysis(ui: Ui, mode: AnalyzeMode = 'missing'): Promise<void> {
  const dialog = ui.main.knowledge.analyzeDialog;
  await openAnalyzeDialog(ui);
  await dialog.mode(mode).click();
  await expect(dialog.start).toBeEnabled();
  await dialog.start.click();
  await expect(dialog.panel).toBeHidden();
}

export const EXTRACTION_NOVEL = 'Azure Chronicle';
export const EMPTY_NOVEL = 'Empty Novel';
export const CHAPTER_COUNT = 7;
export const TRANSLATED_COUNT = 5;
export const ANALYZED_COUNT = 2;
export const SMALL_COUNT = 3;
export const SLOW_MS = 2500;

export const EXTRACTION_ANALYSIS: ProviderAnalysis = {
  entities: [
    { type: 'persona', name: 'Lin Feng' },
    { type: 'persona', name: 'Master Chen' },
    { type: 'persona', name: 'Su Yan' },
    { type: 'organization', name: 'Sky Sword Sect' },
    { type: 'location', name: 'Azure City' },
    { type: 'artifact', name: 'Frost Blade' },
  ],
  facts: [
    { pred: 'leader_of', subject: 'Master Chen', object: 'Sky Sword Sect' },
    { pred: 'owns', subject: 'Lin Feng', object: 'Frost Blade' },
    {
      pred: 'occupation',
      subject: 'Lin Feng',
      quote: 'He was twenty years old and worked as a blacksmith.',
    },
  ],
};

export const SLOW_BEHAVIOR: ProviderBehavior = {
  mode: 'slow',
  delayMs: SLOW_MS,
  analysis: EXTRACTION_ANALYSIS,
};
export const FAST_BEHAVIOR: ProviderBehavior = { analysis: EXTRACTION_ANALYSIS };

export function seededNovel(): SeedNovel {
  return sampleNovel({ title: EXTRACTION_NOVEL, chapters: CHAPTER_COUNT });
}

export function plainSeed(): KnowledgeWorkspaceSeed {
  return { novels: [seededNovel(), { title: EMPTY_NOVEL, lang: 'ZH' }] };
}

export function smallSeed(): KnowledgeWorkspaceSeed {
  return { novels: [sampleNovel({ title: EXTRACTION_NOVEL, chapters: SMALL_COUNT })] };
}

export function partialSeed(): KnowledgeWorkspaceSeed {
  const chapters = Array.from({ length: TRANSLATED_COUNT }, (_, index) => ({ chapter: index + 1 }));
  return {
    novels: [seededNovel()],
    translations: [{ novel: EXTRACTION_NOVEL, target: 'VI', chapters }],
    knowledge: [{ novel: EXTRACTION_NOVEL, analyses: CLEAN_ANALYSES.slice(0, ANALYZED_COUNT) }],
  };
}

export function wordsOf(seqs: readonly number[]): number {
  const chapters = seededNovel().chapters ?? [];
  return seqs.reduce(
    (sum, seq) => sum + countWords((chapters[seq - 1]?.paragraphs ?? []).join('\n')),
    0,
  );
}

export function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export async function reopenKnowledge(
  ui: Ui,
  picker: PickerStub,
  folder: string,
  novel: string,
): Promise<void> {
  await openFromSplash(ui, picker, folder);
  await showKnowledge(ui, novel);
}

export function rangeLabel(seqs: readonly number[]): string {
  const first = seqs[0];
  const last = seqs[seqs.length - 1];
  return seqs.length > 1 ? `Ch.${first}–${last}` : `Ch.${first}`;
}

export async function expectSummary(
  ui: Ui,
  extraction: ExtractionDialog,
  run: readonly number[],
  batches: number,
  keep: readonly number[],
): Promise<void> {
  const dialog = ui.main.knowledge.analyzeDialog;
  await expect(dialog.run).toContainText(`${run.length} chapters`);
  await expect(dialog.run).toContainText(rangeLabel(run));
  await expect(dialog.pipeline).toContainText(analyzeBatches(batches));
  if (keep.length === 0) {
    await expect(extraction.keep).toHaveText('—');
  } else {
    await expect(extraction.keep).toContainText(`${keep.length} chapters`);
    await expect(extraction.keep).toContainText(rangeLabel(keep));
  }
  await expect(extraction.words).toHaveText(String(wordsOf(run)));
}

export const GRAPH_GROUPS: readonly GraphGroupKey[] = [
  'character',
  'persona',
  'location',
  'organization',
  'artifact',
  'skill',
  'term',
  'event',
];

const FLAG_CLASS = GRAPH_GROUPS.length + 1;
const MIN_NODE_AREA = 5;
const MIN_FILL_RATIO = 0.6;

export const VI_PARAGRAPHS: readonly string[] = [
  'Lâm Phong đến cổng Thanh Thành lúc bình minh.',
  'Sư phụ Trần, chưởng môn Thiên Kiếm Tông, quan sát hắn từ trên tháp.',
  'Lâm Phong mang theo Băng Kiếm, di vật của người cha quá cố.',
  'Hắn hai mươi tuổi và làm nghề thợ rèn.',
];

export const VI_ANALYSES: readonly SeedAnalysis[] = [
  {
    chapter: 1,
    lang: 'VI',
    personas: [{ name: 'Lâm Phong' }],
    entities: [
      { type: 'location', name: 'Thanh Thành' },
      { type: 'artifact', name: 'Băng Kiếm' },
    ],
    facts: [{ pred: 'owns', subject: 'Lâm Phong', object: 'Băng Kiếm' }],
  },
];

const FIRST = CLEAN_ANALYSES[0] as SeedAnalysis;
const SECOND = CLEAN_ANALYSES[1] as SeedAnalysis;
const THIRD = CLEAN_ANALYSES[2] as SeedAnalysis;

export const BROWSE_ANALYSES: readonly SeedAnalysis[] = [
  {
    ...FIRST,
    personas: [{ name: 'Lin Feng' }, { name: 'Master Chen', titles: ['Sect Leader'] }],
    entities: [
      ...(FIRST.entities ?? []),
      { type: 'term', name: 'relic', at: 3 },
      { type: 'skill', name: 'blacksmith', at: 4 },
    ],
  },
  {
    ...SECOND,
    personas: [...(SECOND.personas ?? []), { name: 'Feng', character: 'Lin Feng' }],
    entities: [...(SECOND.entities ?? []), { type: 'event', name: 'trial', at: 1 }],
  },
  THIRD,
];

export const BROWSE_SEED: KnowledgeWorkspaceSeed = {
  novels: [sampleNovel()],
  translations: [
    { novel: SAMPLE_TITLE, target: 'VI', chapters: [{ chapter: 1, paragraphs: VI_PARAGRAPHS }] },
  ],
  knowledge: [{ novel: SAMPLE_TITLE, analyses: [...BROWSE_ANALYSES, ...VI_ANALYSES] }],
};

export interface GraphNode {
  readonly group: GraphGroupKey;
  readonly x: number;
  readonly y: number;
  readonly area: number;
}

export interface GraphReading {
  readonly nodes: readonly GraphNode[];
  readonly flags: number;
}

interface RawGraph {
  readonly width: number;
  readonly height: number;
  readonly data: string;
}

export function groupCounts(reading: GraphReading): Partial<Record<GraphGroupKey, number>> {
  const counts: Partial<Record<GraphGroupKey, number>> = {};
  for (const node of reading.nodes) {
    counts[node.group] = (counts[node.group] ?? 0) + 1;
  }
  return counts;
}

async function captureGraph(page: Page): Promise<RawGraph> {
  return page.evaluate(
    (groups) => {
      const canvas = document.querySelector('[data-testid=graph-canvas]') as HTMLCanvasElement;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const probe = document.createElement('span');
      document.body.append(probe);
      const palette: number[][] = [];
      for (const color of groups) {
        probe.style.color = color;
        palette.push((getComputedStyle(probe).color.match(/\d+/g) as string[]).map(Number));
      }
      probe.remove();
      const classes = new Uint8Array(canvas.width * canvas.height);
      for (let index = 0; index < classes.length; index += 1) {
        const offset = index * 4;
        if (pixels[offset + 3] !== 255) {
          continue;
        }
        for (let kind = 0; kind < palette.length; kind += 1) {
          const rgb = palette[kind] as number[];
          if (
            pixels[offset] === rgb[0] &&
            pixels[offset + 1] === rgb[1] &&
            pixels[offset + 2] === rgb[2]
          ) {
            classes[index] = kind + 1;
            break;
          }
        }
      }
      let text = '';
      for (let index = 0; index < classes.length; index += 8192) {
        text += String.fromCharCode(...classes.subarray(index, index + 8192));
      }
      return { width: canvas.width, height: canvas.height, data: btoa(text) };
    },
    [...GRAPH_GROUPS.map((key) => legendColor(key)), 'var(--danger)'],
  );
}

function legendColor(key: GraphGroupKey): string {
  const tokens: Readonly<Record<GraphGroupKey, string>> = {
    character: 'var(--acc-twilight)',
    persona: 'var(--primary)',
    location: 'var(--info)',
    organization: 'var(--secondary)',
    artifact: 'var(--warning)',
    skill: 'var(--success)',
    term: 'var(--acc-sunset)',
    event: 'var(--acc-breeze)',
  };
  return tokens[key];
}

interface Blob {
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly area: number;
}

function components(raw: RawGraph, classes: Uint8Array): Blob[] {
  const seen = new Uint8Array(classes.length);
  const found: Blob[] = [];
  for (let start = 0; start < classes.length; start += 1) {
    const kind = classes[start] as number;
    if (kind === 0 || seen[start] === 1) {
      continue;
    }
    const stack = [start];
    seen[start] = 1;
    let area = 0;
    let x0 = raw.width;
    let y0 = raw.height;
    let x1 = 0;
    let y1 = 0;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % raw.width;
      const y = Math.floor(index / raw.width);
      area += 1;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      const around = [
        x > 0 ? index - 1 : -1,
        x < raw.width - 1 ? index + 1 : -1,
        y > 0 ? index - raw.width : -1,
        y < raw.height - 1 ? index + raw.width : -1,
      ];
      for (const next of around) {
        if (next >= 0 && seen[next] === 0 && classes[next] === kind) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    const box = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (area >= MIN_NODE_AREA && (kind === FLAG_CLASS || area / box >= MIN_FILL_RATIO)) {
      found.push({ kind, x: (x0 + x1) / 2, y: (y0 + y1) / 2, area });
    }
  }
  return found;
}

export async function readGraph(page: Page): Promise<GraphReading> {
  const raw = await captureGraph(page);
  const blobs = components(raw, new Uint8Array(Buffer.from(raw.data, 'base64')));
  const nodes = blobs
    .filter((blob) => blob.kind !== FLAG_CLASS)
    .map((blob) => ({
      group: GRAPH_GROUPS[blob.kind - 1] as GraphGroupKey,
      x: blob.x,
      y: blob.y,
      area: blob.area,
    }));
  return { nodes, flags: blobs.filter((blob) => blob.kind === FLAG_CLASS).length };
}

export const TYPE_LABEL: Readonly<Record<GraphGroupKey, string>> = {
  character: 'Character',
  persona: 'Persona',
  location: 'Location',
  organization: 'Organization',
  artifact: 'Artifact',
  skill: 'Skill',
  term: 'Term',
  event: 'Event',
};

export function listCount(count: number): string {
  return `Entities ${count}`;
}

export async function openBrowseWorkspace(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  seed: KnowledgeWorkspaceSeed = BROWSE_SEED,
): Promise<void> {
  const folder = sandbox.workspace(KNOWLEDGE_WORKSPACE_NAME);
  await seedKnowledgeWorkspace(folder, seed);
  await openFromSplash(ui, picker, folder);
}

export interface EvidenceInput {
  readonly chapter: number;
  readonly p: number;
  readonly quote: string;
}

export const EDITING_NOVEL = 'Azure Chronicle';

export const EDITING_SEED: KnowledgeWorkspaceSeed = DEFAULT_KNOWLEDGE_SEED;

export const MERGE_ANALYSES: readonly SeedAnalysis[] = [
  {
    chapter: 1,
    personas: [{ name: 'Lin Feng' }],
    entities: [{ type: 'artifact', name: 'Frost Blade' }],
    facts: [{ pred: 'owns', subject: 'character:Lin Feng', object: 'Frost Blade', p: 3 }],
  },
  { chapter: 2, personas: [{ name: 'Feng', character: 'Lin Feng' }] },
];

export const MERGE_SEED: KnowledgeWorkspaceSeed = {
  novels: [sampleNovel()],
  knowledge: [{ novel: EDITING_NOVEL, analyses: MERGE_ANALYSES }],
};

export const PREVIEW_ANALYSES: readonly SeedAnalysis[] = [
  {
    chapter: 1,
    personas: [{ name: 'Lin Feng' }, { name: 'Master Chen' }],
    entities: [
      { type: 'organization', name: 'Sky Sword Sect' },
      { type: 'location', name: 'Azure City' },
    ],
    facts: [{ pred: 'leader_of', subject: 'Master Chen', object: 'Sky Sword Sect' }],
  },
  { chapter: 2, personas: [{ name: 'Feng', character: 'Lin Feng' }] },
];

export const PREVIEW_SEED: KnowledgeWorkspaceSeed = {
  novels: [sampleNovel()],
  knowledge: [{ novel: EDITING_NOVEL, analyses: PREVIEW_ANALYSES }],
};

export const BASELINE_SEED: KnowledgeWorkspaceSeed = {
  novels: [sampleNovel()],
  knowledge: [{ novel: EDITING_NOVEL, analyses: CLEAN_ANALYSES }],
};

export const TOWER_EVIDENCE: EvidenceInput = {
  chapter: 1,
  p: 2,
  quote: 'Master Chen, the leader of the Sky Sword Sect, watched him from the tower.',
};

export function editingOf(ui: Ui): KnowledgeEditingPage {
  return new KnowledgeEditingPage(ui.main.root.page());
}

export function readState(folder: string): Promise<KnowledgeState> {
  return readKnowledgeState(folder, EDITING_NOVEL, 'src');
}

export function appliedCount(count: number): string {
  return `Applied ${count} changes`;
}

export function leftCount(count: number): string {
  return `${count} conflicts still need review`;
}

export async function openEditFromList(ui: Ui, name: string, type?: string): Promise<void> {
  const editing = editingOf(ui);
  await editing.listRow(name, type).first().dblclick();
  await expect(editing.panel).toBeVisible();
}

export async function openAddFromList(ui: Ui): Promise<void> {
  const editing = editingOf(ui);
  await editing.listAdd.click();
  await expect(editing.panel).toBeVisible();
  await expect(editing.entityCards).toHaveCount(1);
}

export async function openIssueEdit(ui: Ui, rule: string): Promise<void> {
  const editing = editingOf(ui);
  await editing.reviewEdit(rule).click();
  await expect(editing.panel).toBeVisible();
  await expect(editing.issue).toBeVisible();
}

export async function expectPreview(ui: Ui, state: PreviewState): Promise<void> {
  await expect(editingOf(ui).preview).toHaveAttribute('data-state', state);
}

export async function fillEvidence(ui: Ui, index: number, evidence: EvidenceInput): Promise<void> {
  const card = editingOf(ui).entityCardAt(index);
  await card.evidenceChapter.selectOption(String(evidence.chapter));
  await card.evidenceP.fill(String(evidence.p));
  await card.evidenceQuote.fill(evidence.quote);
}

export async function addEvidence(ui: Ui, index: number, evidence: EvidenceInput): Promise<void> {
  const card = editingOf(ui).entityCardAt(index);
  await fillEvidence(ui, index, evidence);
  await card.evidenceAdd.click();
  await expect(card.evidenceItems).toHaveCount(1);
}

export async function setName(ui: Ui, index: number, name: string): Promise<void> {
  const field = editingOf(ui).entityCardAt(index).name;
  await field.fill(name);
  await field.blur();
}

export async function cancelEditing(ui: Ui): Promise<void> {
  const editing = editingOf(ui);
  await editing.cancel.click();
  await expect(editing.panel).toBeHidden();
}

export async function confirmEditing(ui: Ui): Promise<void> {
  const editing = editingOf(ui);
  await expect(editing.confirm).toBeEnabled();
  await editing.confirm.click();
  await expect(editing.panel).toBeHidden();
}

export interface ReviewCase {
  readonly novel: string;
  readonly analyses: readonly SeedAnalysis[];
}

export const CLEAN_NOVEL = 'Clean Chronicle';
export const MIXED_NOVEL = 'Mixed Chronicle';

export const MIXED_ANALYSES: readonly SeedAnalysis[] = [
  ...(RULE_FIXTURES.evidence as readonly SeedAnalysis[]),
  { chapter: 2, personas: [{ name: 'Feng', character: 'Lin Feng' }] },
  { chapter: 3, stale: true, personas: [{ name: 'Su Yan' }] },
];

export const STALE_RULES: readonly string[] = ['source_stale', 'source_stale', 'source_stale'];

export const MIXED_RULES: readonly string[] = [
  'evidence',
  'evidence',
  'entity_duplicate',
  ...STALE_RULES,
];

export const FIX_ANALYSES: readonly SeedAnalysis[] = [
  {
    chapter: 1,
    personas: [{ name: 'Lin Feng' }],
    entities: [
      { type: 'artifact', name: 'Frost Blade' },
      { type: 'persona', name: 'Master Chen' },
    ],
    facts: [{ pred: 'owns', subject: 'character:Lin Feng', object: 'Frost Blade', p: 3 }],
  },
  {
    chapter: 2,
    personas: [{ name: 'Feng', character: 'Lin Feng' }],
    entities: [{ type: 'location', name: 'Azure City', ev: [] }],
  },
  { chapter: 3, stale: true, personas: [{ name: 'Su Yan' }] },
];

export const STALE_ANALYSES: readonly SeedAnalysis[] = [
  { chapter: 1, personas: [{ name: 'Lin Feng' }] },
  { chapter: 2, stale: true, personas: [{ name: 'Su Yan' }] },
];

export const RULE_NOVELS: Readonly<Record<string, RuleName>> = {
  'Duplicate Chronicle': 'entity_duplicate',
  'Stale Chronicle': 'source_stale',
  'Evidence Chronicle': 'evidence',
  'Signature Chronicle': 'relation_signature',
};

export function reviewSeed(cases: readonly ReviewCase[]): KnowledgeWorkspaceSeed {
  return {
    novels: cases.map((item) => sampleNovel({ title: item.novel })),
    knowledge: cases.map((item) => ({ novel: item.novel, analyses: item.analyses })),
  };
}

export function ruleCases(): ReviewCase[] {
  return Object.entries(RULE_NOVELS).map(([novel, rule]) => ({
    novel,
    analyses: RULE_FIXTURES[rule],
  }));
}

export function cleanCase(): ReviewCase {
  return { novel: CLEAN_NOVEL, analyses: CLEAN_ANALYSES };
}

export function reviewPage(ui: Ui): KnowledgeReviewPage {
  return new KnowledgeReviewPage(ui.main.knowledge.root.page());
}

export async function reviewNovel(ui: Ui, novel: string): Promise<KnowledgeReviewPage> {
  await showKnowledge(ui, novel);
  await selectLang(ui, 'src');
  await goToTab(ui, 'review');
  return reviewPage(ui);
}

export async function issueRules(review: KnowledgeReviewPage): Promise<string[]> {
  return review.issues.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-rule') ?? ''),
  );
}

export async function expectIssueRules(
  review: KnowledgeReviewPage,
  rules: readonly string[],
): Promise<void> {
  await expect.poll(async () => (await issueRules(review)).sort()).toEqual([...rules].sort());
}

const ONTOLOGY_VERSION = 1;
const KNOWLEDGE_BASE_TIME = Date.UTC(2026, 0, 4, 10, 0, 0);
const CHARACTER = 'character';
const PERSONA = 'persona';
const PERSONA_OF = 'persona_of';

export type KnowledgeLang = 'src' | 'VI' | 'EN';

export type EntityKind =
  'character' | 'persona' | 'location' | 'organization' | 'artifact' | 'skill' | 'term' | 'event';

export type RuleName =
  | 'character_predicate'
  | 'persona_link'
  | 'relation_signature'
  | 'relation_unique'
  | 'entity_duplicate'
  | 'evidence'
  | 'source_stale';

export interface SeedEvidence {
  readonly p: number;
  readonly q: string;
}

export interface SeedEntity {
  readonly type: EntityKind;
  readonly name: string;
  readonly titles?: readonly string[];
  readonly aliases?: readonly string[];
  readonly at?: number;
  readonly ev?: readonly SeedEvidence[];
}

export interface SeedPersona {
  readonly name: string;
  readonly character?: string;
  readonly titles?: readonly string[];
  readonly aliases?: readonly string[];
  readonly at?: number;
  readonly ev?: readonly SeedEvidence[];
}

export interface SeedFact {
  readonly pred: string;
  readonly subject: string;
  readonly object?: string;
  readonly p?: number;
  readonly quote?: string;
  readonly ev?: readonly SeedEvidence[];
}

export interface SeedAnalysis {
  readonly chapter: number;
  readonly lang?: KnowledgeLang;
  readonly personas?: readonly SeedPersona[];
  readonly entities?: readonly SeedEntity[];
  readonly facts?: readonly SeedFact[];
  readonly stale?: boolean;
  readonly sourceHash?: string;
  readonly analyzedAt?: string;
  readonly dbStatus?: boolean;
}

export interface KnowledgeSeed {
  readonly novel: string;
  readonly analyses: readonly SeedAnalysis[];
}

export interface KnowledgeWorkspaceSeed {
  readonly novels: readonly SeedNovel[];
  readonly translations?: readonly TranslationSeed[];
  readonly knowledge?: readonly KnowledgeSeed[];
  readonly pipelines?: readonly SeedPipeline[];
}

export interface FileEvidence {
  p: number;
  q: string;
}

export interface FileEntity {
  id: string;
  type: string;
  name: string;
  titles?: string[];
  aliases?: string[];
  ev: FileEvidence[];
}

export interface FileFact {
  id: string;
  pred: string;
  subject: string;
  object?: string;
  ev: FileEvidence[];
}

export interface FileAnalysis {
  ontology: number;
  sourceHash: string;
  analyzedAt: string;
  entities: FileEntity[];
  facts: FileFact[];
}

export interface SeededKnowledge {
  readonly novelId: number;
  readonly chapters: Readonly<Record<number, string>>;
  readonly entityIds: Readonly<Record<string, string>>;
  readonly factIds: Readonly<Record<string, string>>;
}

export interface SeededKnowledgeWorkspace {
  readonly novels: Readonly<Record<string, SeededNovel>>;
  readonly knowledge: readonly SeededKnowledge[];
  readonly pipelines: readonly number[];
}

export function norm(text: string): string {
  return text.normalize('NFC').split(/\s+/).filter(Boolean).join(' ').toLowerCase();
}

function shortHash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 12);
}

export function entityId(type: string, name: string): string {
  return `E${shortHash([type, norm(name)])}`;
}

export function factId(pred: string, subject: string, object: string | null): string {
  return `F${shortHash([pred, subject, object ?? ''])}`;
}

export function textHash(paragraphs: readonly string[]): string {
  return createHash('sha256').update(paragraphs.join('\n')).digest('hex');
}

export function entityKey(type: string, name: string): string {
  return `${type}:${name}`;
}

export function analysisDir(folder: string, novelId: number, lang: KnowledgeLang): string {
  return join(
    novelDir(folder, novelId),
    `knowledgebase_${lang === 'src' ? 'src' : lang.toLowerCase()}`,
  );
}

export function analysisPath(
  folder: string,
  novelId: number,
  lang: KnowledgeLang,
  chapterId: string,
): string {
  return join(analysisDir(folder, novelId, lang), `chapter_${chapterId}.json`);
}

function sentencesOf(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() !== '');
}

function evidenceFor(
  paragraphs: readonly string[],
  needles: readonly string[],
  at: number | undefined,
): FileEvidence {
  const wanted = needles.map(norm);
  const matches = (paragraph: string): boolean =>
    wanted.every((needle) => norm(paragraph).includes(needle));
  const index = at !== undefined ? at - 1 : paragraphs.findIndex(matches);
  const paragraph = paragraphs[index];
  if (paragraph === undefined) {
    throw new Error(
      `knowledge seed cannot find evidence for ${needles.join(' + ')} in the chapter text`,
    );
  }
  const sentence = sentencesOf(paragraph).find((candidate) =>
    wanted.every((needle) => norm(candidate).includes(needle)),
  );
  return { p: index + 1, q: sentence ?? paragraph };
}

class ChapterBuilder {
  readonly entities: FileEntity[] = [];
  readonly facts: FileFact[] = [];

  constructor(private readonly paragraphs: readonly string[]) {}

  private nextEntityId(): string {
    return `E${this.entities.length + 1}`;
  }

  private nextFactId(): string {
    return `F${this.facts.length + 1}`;
  }

  addEntity(entity: SeedEntity): FileEntity {
    const found = this.entities.find(
      (item) => item.type === entity.type && norm(item.name) === norm(entity.name),
    );
    if (found) {
      return found;
    }
    const ev = entity.ev
      ? entity.ev.map((item) => ({ ...item }))
      : [this.nameEvidence(entity.name, entity.at)];
    const created: FileEntity = {
      id: this.nextEntityId(),
      type: entity.type,
      name: entity.name,
      ev,
    };
    if (entity.titles && entity.titles.length > 0) {
      created.titles = [...entity.titles];
    }
    if (entity.aliases && entity.aliases.length > 0) {
      created.aliases = [...entity.aliases];
    }
    this.entities.push(created);
    return created;
  }

  private nameEvidence(name: string, at: number | undefined): FileEvidence {
    return evidenceFor(this.paragraphs, [name], at);
  }

  addPersona(persona: SeedPersona): void {
    const created = this.addEntity({
      type: PERSONA,
      name: persona.name,
      titles: persona.titles,
      aliases: persona.aliases,
      at: persona.at,
      ev: persona.ev,
    });
    const character = this.addEntity({
      type: CHARACTER,
      name: persona.character ?? persona.name,
      ev: created.ev,
    });
    this.facts.push({
      id: this.nextFactId(),
      pred: PERSONA_OF,
      subject: created.id,
      object: character.id,
      ev: created.ev.map((item) => ({ ...item })),
    });
  }

  private resolve(ref: string): FileEntity {
    const colon = ref.indexOf(':');
    const typed = colon > 0 ? ref.slice(0, colon) : '';
    const name = typed === '' ? ref : ref.slice(colon + 1);
    const matches = this.entities.filter(
      (item) => norm(item.name) === norm(name) && (typed === '' || item.type === typed),
    );
    const preferred = matches.find((item) => item.type !== CHARACTER) ?? matches[0];
    if (!preferred) {
      throw new Error(`knowledge seed references an unknown entity ${ref}`);
    }
    return preferred;
  }

  addFact(fact: SeedFact): void {
    const subject = this.resolve(fact.subject);
    const object = fact.object === undefined ? undefined : this.resolve(fact.object);
    const needles =
      fact.quote !== undefined ? [fact.quote] : [subject.name, ...(object ? [object.name] : [])];
    const ev = fact.ev ? fact.ev.map((item) => ({ ...item })) : [this.factEvidence(needles, fact)];
    const created: FileFact = { id: this.nextFactId(), pred: fact.pred, subject: subject.id, ev };
    if (object) {
      created.object = object.id;
    }
    this.facts.push(created);
  }

  private factEvidence(needles: readonly string[], fact: SeedFact): FileEvidence {
    if (fact.quote !== undefined && fact.p === undefined) {
      const found = this.paragraphs.findIndex((paragraph) =>
        norm(paragraph).includes(norm(fact.quote ?? '')),
      );
      return { p: found + 1, q: fact.quote };
    }
    if (fact.quote !== undefined) {
      return { p: fact.p ?? 1, q: fact.quote };
    }
    return evidenceFor(this.paragraphs, needles, fact.p);
  }
}

async function sourceTextOf(
  folder: string,
  novelId: number,
  chapterId: string,
  lang: KnowledgeLang,
): Promise<string[]> {
  if (lang === 'src') {
    return readParagraphs(folder, novelId, chapterId);
  }
  const translated = await readTranslatedChapter(folder, novelId, lang, chapterId);
  if (translated === null) {
    throw new Error(
      `knowledge seed for ${lang} needs a ${lang} translation of chapter ${chapterId}`,
    );
  }
  return translated.paragraphs.map((paragraph) => paragraph.text);
}

export function buildAnalysis(
  paragraphs: readonly string[],
  seed: SeedAnalysis,
  position: number,
): FileAnalysis {
  const builder = new ChapterBuilder(paragraphs);
  for (const entity of seed.entities ?? []) {
    builder.addEntity(entity);
  }
  for (const persona of seed.personas ?? []) {
    builder.addPersona(persona);
  }
  for (const fact of seed.facts ?? []) {
    builder.addFact(fact);
  }
  const real = textHash(paragraphs);
  const sourceHash =
    seed.sourceHash ?? (seed.stale ? textHash([...paragraphs, 'an earlier version']) : real);
  return {
    ontology: ONTOLOGY_VERSION,
    sourceHash,
    analyzedAt: seed.analyzedAt ?? new Date(KNOWLEDGE_BASE_TIME + position * 1000).toISOString(),
    entities: builder.entities,
    facts: builder.facts,
  };
}

export async function writeAnalysis(
  folder: string,
  novelId: number,
  lang: KnowledgeLang,
  chapterId: string,
  analysis: FileAnalysis,
): Promise<void> {
  await mkdir(analysisDir(folder, novelId, lang), { recursive: true });
  await writeFile(
    analysisPath(folder, novelId, lang, chapterId),
    JSON.stringify(analysis, null, 2),
  );
}

function cleanRecord(analysis: FileAnalysis): FileAnalysis {
  return {
    ...analysis,
    entities: analysis.entities.map((entity) => {
      const { titles, aliases, ...rest } = entity;
      return {
        ...rest,
        ...(titles && titles.length > 0 ? { titles } : {}),
        ...(aliases && aliases.length > 0 ? { aliases } : {}),
      };
    }),
  };
}

function globalIds(
  analysis: FileAnalysis,
  entityIds: Record<string, string>,
  factIds: Record<string, string>,
): void {
  const local = new Map<string, string>();
  for (const entity of analysis.entities) {
    const id = entityId(entity.type, entity.name);
    local.set(entity.id, id);
    entityIds[entityKey(entity.type, entity.name)] = id;
  }
  const names = new Map(analysis.entities.map((entity) => [entity.id, entity.name]));
  for (const fact of analysis.facts) {
    const subject = local.get(fact.subject);
    const object = fact.object === undefined ? null : (local.get(fact.object) ?? null);
    if (subject === undefined) {
      continue;
    }
    const key = `${fact.pred}:${names.get(fact.subject) ?? fact.subject}${fact.object === undefined ? '' : `>${names.get(fact.object) ?? fact.object}`}`;
    factIds[key] = factId(fact.pred, subject, object);
  }
}

export async function seedKnowledge(folder: string, seed: KnowledgeSeed): Promise<SeededKnowledge> {
  const placed = await readWorkspace(folder, (db) => ({
    novelId: db.novelId(seed.novel),
    chapters: db.chapters(seed.novel),
  }));
  const chapters: Record<number, string> = {};
  for (const chapter of placed.chapters) {
    chapters[chapter.seq] = chapter.id;
  }
  const entityIds: Record<string, string> = {};
  const factIds: Record<string, string> = {};
  const analyzed: string[] = [];
  for (const [position, analysis] of seed.analyses.entries()) {
    const chapterId = chapters[analysis.chapter];
    if (chapterId === undefined) {
      throw new Error(`knowledge seed references an unknown chapter ${analysis.chapter}`);
    }
    const lang = analysis.lang ?? 'src';
    const paragraphs = await sourceTextOf(folder, placed.novelId, chapterId, lang);
    const built = cleanRecord(buildAnalysis(paragraphs, analysis, position));
    await writeAnalysis(folder, placed.novelId, lang, chapterId, built);
    globalIds(built, entityIds, factIds);
    if (analysis.dbStatus !== false) {
      analyzed.push(chapterId);
    }
  }
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  try {
    const update = database.prepare(
      "UPDATE ws_novel_chapters SET analysis_status = 'done' WHERE id = ?",
    );
    for (const id of analyzed) {
      update.run(id);
    }
  } finally {
    database.close();
  }
  return { novelId: placed.novelId, chapters, entityIds, factIds };
}

export interface MergedEntity {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly chapters: readonly number[];
  readonly titles: readonly string[];
  readonly aliases: readonly string[];
  readonly evidence: readonly (FileEvidence & { readonly chapter: number })[];
}

export interface MergedFact {
  readonly id: string;
  readonly pred: string;
  readonly subject: string;
  readonly object: string | null;
  readonly chapters: readonly number[];
  readonly evidence: readonly (FileEvidence & { readonly chapter: number })[];
}

export interface KnowledgeState {
  readonly novelId: number;
  readonly lang: KnowledgeLang;
  readonly files: Readonly<Record<number, FileAnalysis>>;
  readonly stale: readonly number[];
  readonly entities: readonly MergedEntity[];
  readonly facts: readonly MergedFact[];
}

export async function readAnalysis(
  folder: string,
  novelId: number,
  lang: KnowledgeLang,
  chapterId: string,
): Promise<FileAnalysis | null> {
  try {
    return JSON.parse(
      await readFile(analysisPath(folder, novelId, lang, chapterId), 'utf8'),
    ) as FileAnalysis;
  } catch {
    return null;
  }
}

export async function listAnalysisIds(
  folder: string,
  novelId: number,
  lang: KnowledgeLang,
): Promise<string[]> {
  try {
    const names = await readdir(analysisDir(folder, novelId, lang));
    return names
      .map((name) => /^chapter_([0-9a-f]{32})\.json$/.exec(name)?.[1])
      .filter((id): id is string => id !== undefined)
      .sort();
  } catch {
    return [];
  }
}

async function currentText(
  folder: string,
  novelId: number,
  lang: KnowledgeLang,
  chapterId: string,
): Promise<string[] | null> {
  if (lang === 'src') {
    return readParagraphs(folder, novelId, chapterId);
  }
  const translated = await readTranslatedChapter(folder, novelId, lang, chapterId);
  return translated === null ? null : translated.paragraphs.map((paragraph) => paragraph.text);
}

function union(into: string[], values: readonly string[] | undefined): void {
  const seen = new Set(into.map(norm));
  for (const value of values ?? []) {
    if (!seen.has(norm(value))) {
      seen.add(norm(value));
      into.push(value);
    }
  }
}

function mergeEntities(files: Readonly<Record<number, FileAnalysis>>): MergedEntity[] {
  const merged = new Map<
    string,
    {
      type: string;
      name: string;
      chapters: Set<number>;
      titles: string[];
      aliases: string[];
      evidence: (FileEvidence & { chapter: number })[];
    }
  >();
  for (const [seq, file] of Object.entries(files)) {
    for (const entity of file.entities) {
      const id = entityId(entity.type, entity.name);
      const current = merged.get(id) ?? {
        type: entity.type,
        name: entity.name,
        chapters: new Set<number>(),
        titles: [],
        aliases: [],
        evidence: [],
      };
      current.chapters.add(Number(seq));
      union(current.titles, entity.titles);
      union(current.aliases, entity.aliases);
      current.evidence.push(...entity.ev.map((item) => ({ ...item, chapter: Number(seq) })));
      merged.set(id, current);
    }
  }
  return [...merged.entries()].map(([id, item]) => ({
    id,
    type: item.type,
    name: item.name,
    chapters: [...item.chapters].sort((a, b) => a - b),
    titles: item.titles,
    aliases: item.aliases,
    evidence: item.evidence,
  }));
}

function mergeFacts(files: Readonly<Record<number, FileAnalysis>>): MergedFact[] {
  const merged = new Map<
    string,
    {
      pred: string;
      subject: string;
      object: string | null;
      chapters: Set<number>;
      evidence: (FileEvidence & { chapter: number })[];
    }
  >();
  for (const [seq, file] of Object.entries(files)) {
    const ids = new Map(
      file.entities.map((entity) => [entity.id, entityId(entity.type, entity.name)]),
    );
    for (const fact of file.facts) {
      const subject = ids.get(fact.subject);
      const object = fact.object === undefined ? null : (ids.get(fact.object) ?? null);
      if (
        subject === undefined ||
        (fact.object !== undefined && object === null) ||
        object === subject
      ) {
        continue;
      }
      const id = factId(fact.pred, subject, object);
      const current = merged.get(id) ?? {
        pred: fact.pred,
        subject,
        object,
        chapters: new Set<number>(),
        evidence: [],
      };
      current.chapters.add(Number(seq));
      current.evidence.push(...fact.ev.map((item) => ({ ...item, chapter: Number(seq) })));
      merged.set(id, current);
    }
  }
  return [...merged.entries()].map(([id, item]) => ({
    id,
    pred: item.pred,
    subject: item.subject,
    object: item.object,
    chapters: [...item.chapters].sort((a, b) => a - b),
    evidence: item.evidence,
  }));
}

export async function readKnowledgeState(
  folder: string,
  novel: string,
  lang: KnowledgeLang = 'src',
): Promise<KnowledgeState> {
  const placed = readNovelPlace(folder, novel);
  const files: Record<number, FileAnalysis> = {};
  const stale: number[] = [];
  for (const chapter of placed.chapters) {
    const file = await readAnalysis(folder, placed.novelId, lang, chapter.id);
    if (file === null) {
      continue;
    }
    files[chapter.seq] = file;
    const text = await currentText(folder, placed.novelId, lang, chapter.id);
    if (text === null || textHash(text) !== file.sourceHash) {
      stale.push(chapter.seq);
    }
  }
  return {
    novelId: placed.novelId,
    lang,
    files,
    stale,
    entities: mergeEntities(files),
    facts: mergeFacts(files),
  };
}

export function findEntity(
  state: KnowledgeState,
  name: string,
  type?: string,
): MergedEntity | undefined {
  return state.entities.find(
    (entity) => norm(entity.name) === norm(name) && (type === undefined || entity.type === type),
  );
}

export function entityNames(state: KnowledgeState, type?: string): string[] {
  return state.entities
    .filter((entity) => type === undefined || entity.type === type)
    .map((entity) => entity.name);
}

const ANALYZE_BATCH_SIZE = 5;

export function analyzeStarted(count: number): string {
  return `Started analyzing ${count} chapters.`;
}

export function analyzeWarnNoSource(skipped: readonly number[]): string {
  return `${skipped.length} chapters have no content in this version and are skipped · ${rangeLabel(skipped)}.`;
}

export function analyzeWarnOverwrite(count: number): string {
  return `${count} chapters that already have results will be overwritten.`;
}

export function analyzeBatches(batches: number): string {
  return `${batches} batches of up to ${ANALYZE_BATCH_SIZE} chapters`;
}

export const ANALYZE_MODE_MISSING_NONE = 'Every chapter has results';
export const PROVIDER_UNSET = 'No provider is set for the knowledge feature.';
export const PROVIDER_UNREADY = 'The provider is not ready. Check it in Settings → LLM.';
export const PROVIDER_HINT = 'Set in Settings → LLM for the knowledge feature.';

export const EDIT_APPLIED = 'No conflicts remain.';
export const EDIT_APPLIED_LEFT = 'conflicts still need review';
export const EDIT_EVIDENCE_INVALID = 'Enter the chapter, the paragraph and the quote.';
export const EDIT_EVIDENCE_REQUIRED = 'Add at least one evidence quote.';
export const EDIT_NAME_REQUIRED = 'Enter a name.';
export const EDIT_MERGE_TYPE = 'Only entities of the same type can be merged.';
export const EDIT_PREVIEW_IDLE =
  'No changes yet. Once you edit, the conflict check result appears here.';
export const EDIT_PREVIEW_INVALID =
  'Some items are incomplete: a name is empty, a fact is missing an endpoint, or a new item has no evidence.';
export const EDIT_PREVIEW_CLEAN = 'No new conflicts detected.';
export const EDIT_PREVIEW_WARN = 'The change will create new conflicts:';
export const EDIT_PREVIEW_RESOLVED = 'This conflict will be resolved.';
export const EDIT_PREVIEW_OPEN = 'This conflict remains after the edit.';
export const EDIT_STATE_SAME = 'Unchanged';
export const EDIT_STATE_EDITED = 'Edited';
export const EDIT_STATE_NEW = 'New';
export const EDIT_STATE_DELETED = 'Deleted';
export const EDIT_STATE_MERGED = 'Merged';
export const EDIT_STATE_REMOVED = 'Removed';
export const EDIT_TYPE_REFUSED =
  'A persona with titles or aliases cannot change type. Remove its titles and aliases first.';
export const EDIT_EVIDENCE_EMPTY =
  'No evidence yet. A claim without evidence is flagged in Review.';

export function addChange(name: string): string {
  return `Add “${name}”`;
}

export function editChange(name: string, fields: readonly string[]): string {
  return `Edit “${name}”: ${fields.map((field) => EDIT_FIELD_LABELS[field]).join(', ')}`;
}

export function mergeChange(names: readonly string[], target: string): string {
  return `Merge ${names.join(', ')} into “${target}”`;
}

export const REMOVE_TITLE = 'Delete from knowledge';
export const REMOVE_WARNING = 'Facts that point to it are deleted too. This cannot be undone.';

const EDIT_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  type: 'Type',
  titles: 'Titles',
  aliases: 'Aliases',
};

export function removeMessage(name: string): string {
  return `Delete “${name}”?`;
}

export const REVIEW_DONE_MOVED = 'Moved to the persona.';
export const REVIEW_DONE_CREATED = 'Character created and linked.';
export const REVIEW_DONE_KEPT = 'Done.';
export const REVIEW_DONE_MERGED = 'Entities merged.';
export const REVIEW_DONE_REMOVED = 'Deleted.';
export const REVIEW_EMPTY = 'No conflicts';
export const REVIEW_HINT = 'Checks run in code, not in an LLM.';
export const REVIEW_SEVERITY_ERROR = 'Error';
export const REVIEW_SEVERITY_WARNING = 'Warning';
export const REVIEW_ACTION_KEEP = 'Keep as is';
export const REVIEW_ACTION_REANALYZE = 'Re-analyze…';
export const REVIEW_ACTION_CREATE_CHARACTER = 'Create character from persona';
export const REVIEW_ACTION_ASK = 'Ask Assistant for fixes';

export function reviewActionMove(name: string): string {
  return `Move to “${name}”`;
}

export function reviewActionMerge(from: string, to: string): string {
  return `Merge “${from}” into “${to}”`;
}

export const RULE_LABELS = {
  character_predicate: 'Character predicate',
  persona_link: 'Persona without character',
  relation_signature: 'Wrong entity types',
  dangling_ref: 'Missing entity',
  relation_unique: 'Duplicate role',
  entity_duplicate: 'Possible duplicate',
  evidence: 'Evidence',
  source_stale: 'Source changed',
} as const;

export const CHECK_CHARACTER_PREDICATE = 'is set on the character';
export const CHECK_PERSONA_NONE = 'does not belong to any character';
export const CHECK_PERSONA_MANY = 'belongs to several characters';
export const CHECK_SIGNATURE = 'requires Persona → Organization, but this is Persona → Persona.';
export const CHECK_DANGLING = 'points to an entity that was rejected or no longer exists';
export const CHECK_RELATION_UNIQUE = 'but only one is allowed';
export const CHECK_DUPLICATE = 'may be the same';
export const CHECK_EVIDENCE_NONE = 'No evidence is attached to';
export const CHECK_EVIDENCE_QUOTE = 'was not found in its source paragraph';
export const CHECK_STALE = 'changed after this item was analyzed';

export const KNOWLEDGE_EMPTY_TITLE = 'No knowledge yet';
export const KNOWLEDGE_EMPTY_CHAPTERS = 'This novel has no chapters';
export const LIST_EMPTY_TITLE = 'No items match';
export const GRAPH_EMPTY = 'No knowledge to show';
export const DETAIL_EMPTY = 'Select an entity in the Graph or the List to see its details.';
export const OMNISCIENT_EMPTY_TITLE = 'No knowledgebase in focus';
export const OMNISCIENT_MODE_OMNISCIENT = 'Omniscient';
export const OMNISCIENT_MODE_CHAPTER = 'Spoiler-safe';

export const BACKEND_NAME_NOT_FOUND = 'name not found in chapters';
export const BACKEND_QUOTE_NOT_FOUND = 'quote not found in';
export const BACKEND_VALUE_NOT_FOUND =
  'not found in the text of the chapters containing the persona';
export const BACKEND_MERGE_TYPE = 'merged entities must share a type';
export const BACKEND_NAME_EMPTY = 'name must not be empty';
export const BACKEND_ENTITY_EVIDENCE = 'an entity needs evidence';
export const GENERIC_ERROR = 'The operation could not be completed.';
