// prettier-ignore
import { Script, ScriptBlock, ScriptSource, ScriptUnit, SourceParagraph } from '@features/scripting/scripting.models';
import { configOf, makeSource } from '@features/scripting/scripting.rules';

export function scriptBlock(overrides: Partial<ScriptBlock> = {}): ScriptBlock {
  return {
    id: 'B1',
    type: 'narration',
    text: 'Hello world.',
    who: '',
    paren: '',
    ms: 0,
    loc: '',
    time: 'MORNING',
    ref: null,
    beat: '',
    refs: [],
    chars: [],
    ...overrides,
  };
}

export function scriptUnit(overrides: Partial<ScriptUnit> = {}): ScriptUnit {
  return {
    id: 'U01',
    no: 1,
    ch: 1,
    chs: null,
    title: 'First',
    blocks: null,
    meta: null,
    updated: '',
    ...overrides,
  };
}

export function script(units: ScriptUnit[] = [], overrides: Partial<Script> = {}): Script {
  return {
    cfg: configOf('audiobook'),
    choose: false,
    extraCast: [],
    units,
    seq: 0,
    useq: units.length,
    ...overrides,
  };
}

export function paragraphs(...texts: string[]): SourceParagraph[] {
  return texts.map((text, index) => ({ id: `1.${index + 1}`, text }));
}

export function source(...texts: string[]): ScriptSource {
  return makeSource(paragraphs(...texts));
}
