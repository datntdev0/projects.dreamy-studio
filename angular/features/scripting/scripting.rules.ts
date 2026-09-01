import { ProjectModuleState, ProjectTemplateId } from '../project/project.models';
// prettier-ignore
import { BlockIds, BlockType, BlockTypeDef, CastMember, ChapterRange, Script, ScriptBlock, ScriptConfig, ScriptMetrics, ScriptPreset, ScriptPresetDef, ScriptScene, ScriptSource, ScriptUnit, ScriptView, SourceParagraph, SpeakerClass, UnitMeta, UnitStats } from './scripting.models';

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
  return findUnit(script, unitId) ?? script.units[0] ?? null;
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

export function unitStatsOf(config: ScriptConfig, metrics: ScriptMetrics): UnitStats {
  return {
    blocks: metrics.blocks,
    words: metrics.words,
    secs: metrics.secs,
    scenes: config.types.includes('scene') ? metrics.scenes : null,
  };
}

export function hasDefaultFor(config: ScriptConfig, source: ScriptSource | null): boolean {
  return config.types.includes('narration') && source !== null;
}

export function hasContent(unit: ScriptUnit): boolean {
  return (unit.blocks !== null && unit.blocks.length > 0) || unit.meta !== null;
}

export function scriptProgress(script: Script): ProjectModuleState {
  const done = script.units.filter(hasContent).length;
  const total = script.units.length;
  const state = done === total ? 'done' : done > 0 ? 'doing' : 'idle';
  return { id: 'scripting', state, done, total, note: `${done}/${total} ${script.cfg.unit}s` };
}

export function emptyView(): ScriptView {
  return {
    unit: null,
    sel: null,
    focus: null,
    goto: null,
  };
}
