// prettier-ignore
import { BlockIds, CastMember, DraftEstimate, DraftLoad, DraftOption, DraftReason, DraftRequest, KbStatus, ScriptBeat, ScriptBlock, ScriptConfig, ScriptSource, ScriptUnit, SourceParagraph } from './scripting.models';
// prettier-ignore
import { chaptersOf, countWords, firstSpeaker, headingText, makeBlock, makeSource, splitQuotes } from './scripting.rules';

export type SpeakerHints = Record<string, string>;

export interface DraftAudioOptions {
  split: boolean;
  guess: boolean;
  cast: CastMember[];
  hints: SpeakerHints;
}

export interface DraftReasonInput {
  config: ScriptConfig;
  unit: ScriptUnit;
  source: ScriptSource | null;
  kb: KbStatus;
}

const TOKENS_IN_PER_WORD = 1.35;
const TOKENS_EXTRA_PER_WORD = 1.5;
const TOKENS_OUT_PER_WORD = 1.5;
const TOKENS_IN_PER_UNIT = 350;
const TOKENS_OUT_PER_UNIT = 120;
const COST_IN_PER_MILLION = 3;
const COST_OUT_PER_MILLION = 15;
const HEADING_PAUSE_MS = 800;

export function speakerFor(
  paragraph: SourceParagraph,
  who: string,
  guess: boolean,
  cast: CastMember[],
  hints: SpeakerHints,
): string {
  if (who) {
    return who;
  }
  return guess ? hints[paragraph.id] || firstSpeaker(cast) : '';
}

export function rowBlocks(
  ids: BlockIds,
  paragraph: SourceParagraph,
  who: string,
  guess: boolean,
  cast: CastMember[],
  hints: SpeakerHints,
): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  for (const segment of splitQuotes(paragraph.text)) {
    if (segment.quoted) {
      blocks.push(
        makeBlock(ids, 'dialogue', {
          who: speakerFor(paragraph, who, guess, cast, hints),
          text: segment.text.replace(/[,;]$/, '.'),
          ref: paragraph.id,
          snap: paragraph.text,
        }),
      );
    } else {
      blocks.push(
        makeBlock(ids, 'narration', {
          text: segment.text,
          ref: paragraph.id,
          snap: paragraph.text,
        }),
      );
    }
  }
  return blocks;
}

export function narrationBlock(ids: BlockIds, paragraph: SourceParagraph): ScriptBlock {
  return makeBlock(ids, 'narration', {
    text: paragraph.text,
    ref: paragraph.id,
    snap: paragraph.text,
  });
}

export function draftAudioBlocks(
  ids: BlockIds,
  unit: Pick<ScriptUnit, 'no' | 'title'>,
  paragraphs: SourceParagraph[],
  options: DraftAudioOptions,
): ScriptBlock[] {
  const blocks: ScriptBlock[] = [
    makeBlock(ids, 'heading', { text: headingText(unit.no, unit.title) }),
    makeBlock(ids, 'pause', { ms: HEADING_PAUSE_MS }),
  ];
  for (const paragraph of paragraphs) {
    if (options.split) {
      blocks.push(...rowBlocks(ids, paragraph, '', options.guess, options.cast, options.hints));
    } else {
      blocks.push(narrationBlock(ids, paragraph));
    }
  }
  return blocks;
}

export function defaultAudioBlocks(
  ids: BlockIds,
  unit: Pick<ScriptUnit, 'no' | 'title'>,
  paragraphs: SourceParagraph[],
): ScriptBlock[] {
  return draftAudioBlocks(ids, unit, paragraphs, {
    split: false,
    guess: true,
    cast: [],
    hints: {},
  });
}

export function aiAudioBlocks(
  ids: BlockIds,
  unit: Pick<ScriptUnit, 'no' | 'title'>,
  paragraphs: SourceParagraph[],
  cast: CastMember[],
  hints: SpeakerHints,
): ScriptBlock[] {
  return draftAudioBlocks(ids, unit, paragraphs, { split: true, guess: true, cast, hints });
}

export function sceneBlock(ids: BlockIds, beat: ScriptBeat): ScriptBlock {
  return makeBlock(ids, 'scene', {
    loc: beat.loc,
    time: beat.time,
    beat: beat.text,
    refs: beat.refs,
    chars: beat.chars,
  });
}

export function sceneBody(
  ids: BlockIds,
  scene: ScriptBlock,
  map: Record<string, string>,
): ScriptBlock[] {
  const body: ScriptBlock[] = [];
  let quoted = 0;
  for (const ref of scene.refs) {
    const text = map[ref];
    if (!text) {
      continue;
    }
    for (const segment of splitQuotes(text)) {
      if (segment.quoted) {
        const who = scene.chars.length ? scene.chars[quoted % scene.chars.length] : '';
        quoted += 1;
        body.push(makeBlock(ids, 'dialogue', { who, text: segment.text.replace(/[,;]$/, '.') }));
      } else {
        body.push(makeBlock(ids, 'action', { text: segment.text }));
      }
    }
  }
  return body;
}

export function aiFilmBlocks(
  ids: BlockIds,
  beats: ScriptBeat[],
  map: Record<string, string>,
): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  for (const beat of beats) {
    const scene = sceneBlock(ids, beat);
    const body = sceneBody(ids, scene, map);
    blocks.push(scene, ...(body.length ? body : [makeBlock(ids, 'action', { text: beat.text })]));
  }
  return blocks;
}

export function draftBlocksFor(
  ids: BlockIds,
  request: DraftRequest,
  hints: SpeakerHints,
): ScriptBlock[] | null {
  if (request.preset === 'audiobook') {
    return request.source
      ? aiAudioBlocks(ids, request.unit, request.source, request.cast, hints)
      : null;
  }
  const map = request.source ? makeSource(request.source).map : {};
  return aiFilmBlocks(ids, request.beats, map);
}

function reasonOf(key: DraftReason['key'], params: DraftReason['params'] = {}): DraftReason {
  return { key, params };
}

export function draftReasonOf(input: DraftReasonInput): DraftReason | null {
  const { config, unit, source, kb } = input;
  if (unit.status === 'locked') {
    return reasonOf('scripting.draft.reason.locked');
  }
  if (unit.meta) {
    return reasonOf('scripting.draft.reason.meta');
  }
  if (config.preset === 'audiobook') {
    return source ? null : reasonOf('scripting.draft.reason.noSource');
  }
  if (!kb.novel) {
    return reasonOf('scripting.draft.reason.noNovel');
  }
  if (!kb.available) {
    return reasonOf('scripting.draft.reason.noKb');
  }
  if (chaptersOf(unit).length === 0) {
    return reasonOf('scripting.draft.reason.noChapters');
  }
  return kb.missing.length
    ? reasonOf('scripting.draft.reason.missingKb', { chapters: kb.missing.join(', ') })
    : null;
}

export function draftOptionOf(input: DraftReasonInput): DraftOption {
  return {
    unit: input.unit,
    reason: draftReasonOf(input),
    hasContent: !!input.unit.blocks && input.unit.blocks.length > 0,
  };
}

function wordsOfTexts(texts: string[]): number {
  let total = 0;
  for (const text of texts) {
    total += countWords(text);
  }
  return total;
}

export function draftLoadOf(
  config: ScriptConfig,
  source: ScriptSource | null,
  beats: ScriptBeat[],
): DraftLoad {
  if (config.preset === 'audiobook') {
    return {
      words: source ? wordsOfTexts(source.list.map((item) => item.text)) : 0,
      extra: 0,
      beats: 0,
    };
  }
  const map = source ? source.map : {};
  const refs = [...new Set(beats.flatMap((beat) => beat.refs))];
  const texts: string[] = [];
  for (const ref of refs) {
    if (map[ref]) {
      texts.push(map[ref]);
    }
  }
  return {
    words: wordsOfTexts(texts),
    extra: wordsOfTexts(beats.map((beat) => beat.text)),
    beats: beats.length,
  };
}

export function estimateDraft(loads: DraftLoad[]): DraftEstimate {
  let words = 0;
  let extra = 0;
  for (const load of loads) {
    words += load.words;
    extra += load.extra;
  }
  const tin =
    words * TOKENS_IN_PER_WORD + extra * TOKENS_EXTRA_PER_WORD + TOKENS_IN_PER_UNIT * loads.length;
  const tout = words * TOKENS_OUT_PER_WORD + TOKENS_OUT_PER_UNIT * loads.length;
  return {
    tin: Math.round(tin),
    tout: Math.round(tout),
    cost: (tin / 1e6) * COST_IN_PER_MILLION + (tout / 1e6) * COST_OUT_PER_MILLION,
  };
}

export function defaultDraftSelection(
  options: DraftOption[],
  currentUnitId: string | null,
  selected: string[],
): string[] {
  const allowed = options.filter((option) => !option.reason);
  const valid = selected.every((id) => allowed.some((option) => option.unit.id === id));
  if (valid && selected.length > 0) {
    return selected;
  }
  const first =
    allowed.find((option) => option.unit.id === currentUnitId) ??
    allowed.find((option) => !option.hasContent) ??
    allowed[0];
  return first ? [first.unit.id] : [];
}

export function toggleDraftUnit(selected: string[], unitId: string, checked: boolean): string[] {
  const rest = selected.filter((id) => id !== unitId);
  return checked ? [...rest, unitId] : rest;
}
