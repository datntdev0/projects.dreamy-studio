import { ProjectModuleState, ProjectTemplateId } from '../project/project.models';
// prettier-ignore
import { BlockIds, BlockType, BlockTypeDef, CastMember, ChapterRange, CheckRow, CheckSummary, IssueKind, IssueLevel, QuoteSegment, RailMark, Script, ScriptBlock, ScriptConfig, ScriptIssue, ScriptMetrics, ScriptPreset, ScriptPresetDef, ScriptScene, ScriptSource, ScriptUnit, ScriptView, SourceParagraph, SourceRow, SpeakerClass, UnitMeta, UnitStats } from './scripting.models';

export const SCRIPT_PRESETS: ScriptPresetDef[] = [
  {
    id: 'audiobook',
    icon: 'mic',
    labelKey: 'scripting.preset.audiobook',
    shortKey: 'scripting.preset.audiobook.short',
    blurbKey: 'scripting.preset.audiobook.blurb',
  },
  {
    id: 'film',
    icon: 'film',
    labelKey: 'scripting.preset.film',
    shortKey: 'scripting.preset.film.short',
    blurbKey: 'scripting.preset.film.blurb',
  },
];

const PRESET_CONFIGS: Record<ScriptPreset, ScriptConfig> = {
  audiobook: {
    preset: 'audiobook',
    unit: 'chapter',
    types: ['heading', 'narration', 'dialogue', 'pause', 'note'],
    layout: 'page',
    source: true,
    speakers: true,
    ranges: false,
    freeUnits: false,
  },
  film: {
    preset: 'film',
    unit: 'episode',
    types: ['scene', 'action', 'dialogue', 'note'],
    layout: 'page',
    source: false,
    speakers: true,
    ranges: true,
    freeUnits: true,
  },
};

function blockTypeDef(
  type: BlockType,
  icon: string,
  text: boolean,
  who: boolean,
): [BlockType, BlockTypeDef] {
  return [
    type,
    {
      type,
      icon,
      text,
      who,
      labelKey: `scripting.type.${type}`,
      hintKey: `scripting.type.${type}.hint`,
    },
  ];
}

export const BLOCK_TYPES: Record<BlockType, BlockTypeDef> = Object.fromEntries([
  blockTypeDef('heading', 'list', true, false),
  blockTypeDef('narration', 'book', true, false),
  blockTypeDef('dialogue', 'users', true, true),
  blockTypeDef('pause', 'pause', false, false),
  blockTypeDef('note', 'info', true, false),
  blockTypeDef('scene', 'frames', false, false),
  blockTypeDef('action', 'film', true, false),
]) as Record<BlockType, BlockTypeDef>;

export const NEXT_BLOCK_TYPE: Record<BlockType, BlockType> = {
  heading: 'narration',
  narration: 'narration',
  dialogue: 'action',
  pause: 'narration',
  note: 'action',
  scene: 'action',
  action: 'action',
};

export const SPOKEN_TYPES: BlockType[] = ['heading', 'narration', 'dialogue', 'action'];

export const SCENE_TIMES: string[] = [
  'DAWN',
  'MORNING',
  'NOON',
  'AFTERNOON',
  'SUNSET',
  'NIGHT',
  'CONTINUOUS',
];

export const DEFAULT_SCENE_TIME = 'MORNING';

export const DEFAULT_PAUSE_MS = 800;

export const MAX_PAUSE_MS = 30000;

export const SPEECH_WORDS_PER_SECOND = 2.5;

export const NARRATOR_ID = 'narr';

export const UNKNOWN_SPEAKER = '?';

export const DEFAULT_CHAPTER_MAX = 99;

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

const QUOTE_PATTERN = /“([^”]*)”|"([^"]*)"/g;

const TEMPLATE_PRESETS: Record<ProjectTemplateId, ScriptPreset | null> = {
  audiobook: 'audiobook',
  filmseries: 'film',
  blank: null,
};

export function presetOfTemplate(template: ProjectTemplateId): ScriptPreset | null {
  return TEMPLATE_PRESETS[template];
}

export function configOf(preset: ScriptPreset): ScriptConfig {
  return { ...PRESET_CONFIGS[preset], types: [...PRESET_CONFIGS[preset].types] };
}

export function presetDef(preset: ScriptPreset): ScriptPresetDef {
  return SCRIPT_PRESETS.find((item) => item.id === preset) ?? SCRIPT_PRESETS[0];
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function numberWord(value: number): string {
  return NUMBER_WORDS[value] ?? String(value);
}

export function countWords(text: string | null | undefined): number {
  const trimmed = String(text ?? '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function trimSegment(segment: QuoteSegment): QuoteSegment {
  return { quoted: segment.quoted, text: segment.text.trim().replace(/^[\s,;:.]+/, '') };
}

function hasContent(segment: QuoteSegment): boolean {
  return /[\p{L}\p{N}]/u.test(segment.text);
}

export function splitQuotes(text: string): QuoteSegment[] {
  const raw: QuoteSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(QUOTE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      raw.push({ quoted: false, text: text.slice(last, index) });
    }
    raw.push({ quoted: true, text: match[1] ?? match[2] ?? '' });
    last = index + match[0].length;
  }
  if (last < text.length) {
    raw.push({ quoted: false, text: text.slice(last) });
  }
  return raw.map(trimSegment).filter(hasContent);
}

export function headingText(no: number, title: string): string {
  return `Chapter ${numberWord(no)}.${title ? ` ${title}.` : ''}`;
}

export function makeBlock(
  ids: BlockIds,
  type: BlockType,
  overrides: Partial<ScriptBlock> = {},
): ScriptBlock {
  ids.seq += 1;
  return {
    id: `B${ids.seq}`,
    type,
    text: '',
    who: '',
    paren: '',
    ms: 0,
    loc: '',
    time: DEFAULT_SCENE_TIME,
    ref: null,
    snap: null,
    beat: '',
    refs: [],
    chars: [],
    ...overrides,
  };
}

export function placeholderMeta(words: number): UnitMeta {
  return { blocks: Math.max(8, Math.round(words / 38)), words };
}

export function newScript(preset: ScriptPreset, overrides: Partial<Script> = {}): Script {
  return {
    cfg: configOf(preset),
    choose: false,
    extraCast: [],
    units: [],
    seq: 0,
    useq: 0,
    ...overrides,
  };
}

export function makeUnit(script: Script, overrides: Partial<ScriptUnit> = {}): ScriptUnit {
  const useq = script.useq + 1;
  return {
    id: `U${pad2(useq)}`,
    no: useq,
    ch: null,
    chs: null,
    title: '',
    status: 'draft',
    blocks: null,
    meta: null,
    updated: '',
    ...overrides,
  };
}

export function appendUnit(script: Script, overrides: Partial<ScriptUnit> = {}): Script {
  const unit = makeUnit(script, overrides);
  return { ...script, units: [...script.units, unit], useq: script.useq + 1 };
}

export function findUnit(script: Script, unitId: string | null): ScriptUnit | undefined {
  return script.units.find((unit) => unit.id === unitId);
}

export function findBlock(
  unit: ScriptUnit | null | undefined,
  id: string | null,
): ScriptBlock | undefined {
  return unit?.blocks?.find((block) => block.id === id);
}

export function replaceUnit(script: Script, unit: ScriptUnit): Script {
  return { ...script, units: script.units.map((item) => (item.id === unit.id ? unit : item)) };
}

export function activeUnit(script: Script, unitId: string | null): ScriptUnit | null {
  return (
    findUnit(script, unitId) ??
    script.units.find((unit) => unit.status !== 'locked') ??
    script.units[0] ??
    null
  );
}

export function chaptersOf(unit: Pick<ScriptUnit, 'ch' | 'chs'>): number[] {
  if (unit.chs) {
    const [from, to] = unit.chs;
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }
  return unit.ch ? [unit.ch] : [];
}

export function nextChapterRange(
  current: ChapterRange | null,
  index: 0 | 1,
  raw: number,
  max: number,
): ChapterRange {
  const base: ChapterRange = current ?? [1, 1];
  const value = Math.max(1, Math.min(max, Math.trunc(raw) || base[index]));
  const next: ChapterRange = [base[0], base[1]];
  next[index] = value;
  if (next[0] > next[1]) {
    next[index === 0 ? 1 : 0] = value;
  }
  return next;
}

export function nextUnitChapters(script: Script, novelChapters: number): ChapterRange | null {
  const last = script.units[script.units.length - 1];
  if (!last?.chs) {
    return null;
  }
  const from = Math.min(last.chs[1] + 1, novelChapters || last.chs[1] + 1);
  return [from, from];
}

export function makeSource(list: SourceParagraph[]): ScriptSource {
  const map: Record<string, string> = {};
  for (const paragraph of list) {
    map[paragraph.id] = paragraph.text;
  }
  return { list, map };
}

export function paragraphNumber(ref: string): number {
  return parseInt(ref.split('.')[1] ?? '', 10);
}

export function paragraphChapter(ref: string): number {
  return parseInt(ref.split('.')[0] ?? '', 10);
}

export function firstSpeaker(cast: CastMember[]): string {
  return cast.find((member) => member.kind !== 'narrator')?.id ?? '';
}

export function narratorMember(): CastMember {
  return { id: NARRATOR_ID, name: 'Narrator', kind: 'narrator', c: -1 };
}

export function castOf(
  preset: ScriptPreset,
  characters: { id: string; name: string }[],
  extra: CastMember[],
): CastMember[] {
  const members: CastMember[] = characters.map((item, index) => ({
    id: item.id,
    name: item.name,
    kind: 'kb',
    c: index,
  }));
  return [...(preset === 'audiobook' ? [narratorMember()] : []), ...members, ...extra];
}

export function speakerOf(cast: CastMember[], id: string): CastMember | undefined {
  return cast.find((member) => member.id === id);
}

export function speakerClass(member: CastMember | undefined): SpeakerClass {
  if (!member) {
    return 'spk-x';
  }
  return member.kind === 'narrator' ? 'spk-n' : `spk-${member.c % 6}`;
}

export function isStale(source: ScriptSource | null, block: ScriptBlock): boolean {
  if (!block.ref || !source || block.snap === null) {
    return false;
  }
  const current = source.map[block.ref];
  return current !== undefined && current !== block.snap;
}

export function staleRefsOf(unit: ScriptUnit, source: ScriptSource | null): string[] {
  if (!source || !unit.blocks) {
    return [];
  }
  const refs = new Set<string>();
  for (const block of unit.blocks) {
    if (block.ref && isStale(source, block)) {
      refs.add(block.ref);
    }
  }
  return [...refs];
}

export function uncoveredOf(unit: ScriptUnit, source: ScriptSource | null): SourceParagraph[] {
  if (!source || !unit.blocks) {
    return [];
  }
  const have = new Set<string>();
  for (const block of unit.blocks) {
    if (block.ref) {
      have.add(block.ref);
    }
  }
  return source.list.filter((paragraph) => !have.has(paragraph.id));
}

export function scenesOf(blocks: ScriptBlock[] | null): ScriptScene[] {
  const list = blocks ?? [];
  const scenes: ScriptScene[] = [];
  list.forEach((block, index) => {
    if (block.type === 'scene') {
      scenes.push({ block, index, no: scenes.length + 1, end: list.length, body: [] });
    }
  });
  return scenes.map((scene, position) => {
    const end = position + 1 < scenes.length ? scenes[position + 1].index : list.length;
    return { ...scene, end, body: list.slice(scene.index + 1, end) };
  });
}

function addTo(record: Record<string, number>, key: string, amount: number): void {
  record[key] = (record[key] ?? 0) + amount;
}

function speakerKey(block: ScriptBlock, narrator: string): string {
  if (block.type === 'dialogue') {
    return block.who || UNKNOWN_SPEAKER;
  }
  return block.type === 'narration' || block.type === 'heading' ? narrator : '';
}

export function metricsOf(cast: CastMember[], blocks: ScriptBlock[] | null): ScriptMetrics {
  const metrics: ScriptMetrics = {
    blocks: 0,
    words: 0,
    pause: 0,
    scenes: 0,
    lines: 0,
    secs: 0,
    byWho: {},
    byType: {},
  };
  const narrator = cast.find((member) => member.kind === 'narrator')?.id ?? NARRATOR_ID;
  for (const block of blocks ?? []) {
    metrics.blocks += 1;
    metrics.byType[block.type] = (metrics.byType[block.type] ?? 0) + 1;
    metrics.pause += block.type === 'pause' ? block.ms / 1000 : 0;
    metrics.scenes += block.type === 'scene' ? 1 : 0;
    metrics.lines += block.type === 'dialogue' ? 1 : 0;
    if (SPOKEN_TYPES.includes(block.type)) {
      const words = countWords(block.text);
      metrics.words += words;
      const key = speakerKey(block, narrator);
      if (key) {
        addTo(metrics.byWho, key, words);
      }
    }
  }
  metrics.secs = metrics.words / SPEECH_WORDS_PER_SECOND + metrics.pause;
  return metrics;
}

function issue(kind: IssueKind, level: IssueLevel, fields: Partial<ScriptIssue> = {}): ScriptIssue {
  return {
    kind,
    level,
    blockId: null,
    ref: null,
    messageKey: `scripting.issue.${kind}`,
    params: {},
    ...fields,
  };
}

function blockIssue(
  config: ScriptConfig,
  source: ScriptSource | null,
  block: ScriptBlock,
  seen: Set<string>,
): ScriptIssue[] {
  const found: ScriptIssue[] = [];
  const def = BLOCK_TYPES[block.type];
  if (def.text && block.type !== 'note' && !block.text.trim()) {
    found.push(issue('empty', 'error', { blockId: block.id, params: { type: block.type } }));
  }
  if (block.type === 'dialogue' && config.speakers && !block.who) {
    found.push(issue('who', 'error', { blockId: block.id }));
  }
  if (block.type === 'scene' && !block.loc.trim()) {
    found.push(issue('scene', 'error', { blockId: block.id }));
  }
  if (block.ref && isStale(source, block) && !seen.has(block.ref)) {
    seen.add(block.ref);
    found.push(
      issue('stale', 'warn', {
        blockId: block.id,
        ref: block.ref,
        params: { n: paragraphNumber(block.ref) },
      }),
    );
  }
  return found;
}

export function issuesOf(
  config: ScriptConfig,
  unit: ScriptUnit,
  source: ScriptSource | null,
): ScriptIssue[] {
  if (!unit.blocks || unit.blocks.length === 0) {
    return [issue('none', 'error', { params: { unit: config.unit } })];
  }
  const found: ScriptIssue[] = [];
  const seen = new Set<string>();
  for (const block of unit.blocks) {
    found.push(...blockIssue(config, source, block, seen));
  }
  if (config.source) {
    for (const paragraph of uncoveredOf(unit, source)) {
      found.push(
        issue('uncovered', 'warn', {
          ref: paragraph.id,
          params: { n: paragraphNumber(paragraph.id) },
        }),
      );
    }
  }
  if (config.types.includes('scene') && scenesOf(unit.blocks).length === 0) {
    found.push(issue('noscene', 'warn'));
  }
  return found;
}

interface CheckDef {
  kind: IssueKind;
  level: IssueLevel;
}

const CHECK_DEFS: CheckDef[] = [
  { kind: 'none', level: 'error' },
  { kind: 'empty', level: 'error' },
  { kind: 'who', level: 'error' },
  { kind: 'scene', level: 'error' },
  { kind: 'noscene', level: 'warn' },
  { kind: 'stale', level: 'warn' },
  { kind: 'uncovered', level: 'warn' },
];

function checkEnabled(kind: IssueKind, config: ScriptConfig, hasSource: boolean): boolean {
  if (kind === 'who') {
    return config.speakers;
  }
  if (kind === 'scene' || kind === 'noscene') {
    return config.types.includes('scene');
  }
  if (kind === 'stale' || kind === 'uncovered') {
    return config.source && hasSource;
  }
  return true;
}

export function checkRowsOf(
  config: ScriptConfig,
  issues: ScriptIssue[],
  hasSource: boolean,
): CheckRow[] {
  const rows: CheckRow[] = [];
  for (const def of CHECK_DEFS) {
    if (checkEnabled(def.kind, config, hasSource)) {
      const hits = issues.filter((item) => item.kind === def.kind);
      rows.push({
        kind: def.kind,
        level: def.level,
        labelKey: `scripting.check.${def.kind}`,
        count: hits.length,
        first: hits[0] ?? null,
      });
    }
  }
  return rows;
}

export function checkSummaryOf(rows: CheckRow[]): CheckSummary {
  return {
    errors: rows.filter((row) => row.count > 0 && row.level === 'error').length,
    warnings: rows.filter((row) => row.count > 0 && row.level === 'warn').length,
  };
}

export function sourceRowsOf(unit: ScriptUnit, source: ScriptSource): SourceRow[] {
  const blocks = unit.blocks ?? [];
  const index: Record<string, number> = {};
  source.list.forEach((paragraph, position) => {
    index[paragraph.id] = position;
  });
  const have = new Set<string>();
  for (const block of blocks) {
    if (block.ref) {
      have.add(block.ref);
    }
  }
  const done = new Set<string>();
  const rows: SourceRow[] = [];
  let current: SourceRow | null = null;
  for (const block of blocks) {
    const position = block.ref === null ? undefined : index[block.ref];
    if (block.ref && position !== undefined) {
      if (current && current.ref === block.ref) {
        current.blocks?.push(block);
      } else {
        pushMissing(rows, source, have, done, position);
        current = { ref: block.ref, para: source.list[position], blocks: [block] };
        rows.push(current);
      }
    } else {
      current = null;
      rows.push({ ref: null, para: null, blocks: [block] });
    }
  }
  pushMissing(rows, source, have, done, Infinity);
  return rows;
}

function pushMissing(
  rows: SourceRow[],
  source: ScriptSource,
  have: Set<string>,
  done: Set<string>,
  upto: number,
): void {
  source.list.forEach((paragraph, position) => {
    if (position < upto && !have.has(paragraph.id) && !done.has(paragraph.id)) {
      done.add(paragraph.id);
      rows.push({ ref: paragraph.id, para: paragraph, blocks: null });
    }
  });
}

export function unitStatsOf(
  config: ScriptConfig,
  metrics: ScriptMetrics,
  source: ScriptSource | null,
  uncovered: SourceParagraph[],
): UnitStats {
  const paragraphs = config.source && source ? source.list.length : null;
  return {
    blocks: metrics.blocks,
    words: metrics.words,
    secs: metrics.secs,
    scenes: config.types.includes('scene') ? metrics.scenes : null,
    paragraphs,
    covered: paragraphs === null ? null : paragraphs - uncovered.length,
  };
}

export function railMarkOf(unit: ScriptUnit, stale: number): RailMark {
  if (unit.status === 'locked') {
    return 'locked';
  }
  if (stale > 0) {
    return 'stale';
  }
  return unit.status === 'review' ? 'review' : 'draft';
}

export function hasDefaultFor(config: ScriptConfig, source: ScriptSource | null): boolean {
  return config.types.includes('narration') && source !== null;
}

export function scriptProgress(script: Script, staleUnits: number): ProjectModuleState {
  const done = script.units.filter((unit) => unit.status === 'locked').length;
  const total = script.units.length;
  const any = script.units.some(
    (unit) => unit.status !== 'draft' || (unit.blocks !== null && unit.blocks.length > 0),
  );
  const state = staleUnits ? 'stale' : done === total ? 'done' : done > 0 || any ? 'doing' : 'idle';
  const note = `${done}/${total} ${script.cfg.unit}s${staleUnits ? ` · ${staleUnits} need review` : ''}`;
  return { id: 'scripting', state, done, total, note };
}

export function emptyView(): ScriptView {
  return {
    unit: null,
    collapsed: {},
    sel: null,
    drawer: false,
    focus: null,
    goto: null,
    ref: null,
  };
}

export function toggledGroup(collapsed: Record<string, true>, ref: string): Record<string, true> {
  const next = { ...collapsed };
  if (next[ref]) {
    delete next[ref];
  } else {
    next[ref] = true;
  }
  return next;
}

export function anyGroupOpen(collapsed: Record<string, true>, source: ScriptSource): boolean {
  return source.list.some((paragraph) => !collapsed[paragraph.id]);
}

export function toggledAllGroups(
  collapsed: Record<string, true>,
  source: ScriptSource,
): Record<string, true> {
  if (!anyGroupOpen(collapsed, source)) {
    return {};
  }
  const next: Record<string, true> = {};
  for (const paragraph of source.list) {
    next[paragraph.id] = true;
  }
  return next;
}

export function withoutGroup(collapsed: Record<string, true>, ref: string): Record<string, true> {
  const next = { ...collapsed };
  delete next[ref];
  return next;
}
