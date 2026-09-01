import { defaultAudioBlocks } from './scripting.default';
// prettier-ignore
import { BlockIds, BlockPatch, BlockType, CastAddResult, CastMember, ChapterRange, MoveDirection, ResetResult, Script, ScriptBlock, ScriptChange, ScriptConfig, ScriptPreset, ScriptSource, ScriptUnit } from './scripting.models';
// prettier-ignore
import { appendUnit, BLOCK_TYPES, configOf, DEFAULT_PAUSE_MS, findBlock, findUnit, firstSpeaker, makeBlock, MAX_PAUSE_MS, NEXT_BLOCK_TYPE, replaceUnit } from './scripting.rules';

const NO_VIEW = {};

function unchanged(script: Script): ScriptChange {
  return { script, view: NO_VIEW };
}

function idsOf(script: Script): BlockIds {
  return { seq: script.seq };
}

function withBlocks(
  script: Script,
  unit: ScriptUnit,
  blocks: ScriptBlock[],
  ids: BlockIds,
  stamp: string,
): Script {
  return { ...replaceUnit(script, { ...unit, blocks, updated: stamp }), seq: ids.seq };
}

function lastDialogueSpeaker(blocks: ScriptBlock[]): string | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].type === 'dialogue' && blocks[index].who) {
      return blocks[index].who;
    }
  }
  return null;
}

function sharesRow(after: ScriptBlock | undefined, type: BlockType): boolean {
  return !!after && !!after.ref && type !== 'heading' && type !== 'pause';
}

export function insertBlock(
  script: Script,
  unitId: string,
  afterId: string | null,
  type: BlockType,
  cast: CastMember[],
  stamp: string,
  extra: Partial<ScriptBlock> = {},
): ScriptChange {
  const unit = findUnit(script, unitId);
  if (!unit?.blocks) {
    return unchanged(script);
  }
  const ids = idsOf(script);
  const after = findBlock(unit, afterId);
  const row = sharesRow(after, type);
  const who = type === 'dialogue' ? (lastDialogueSpeaker(unit.blocks) ?? firstSpeaker(cast)) : '';
  const block = makeBlock(ids, type, {
    who,
    ref: row && after ? after.ref : null,
    ...extra,
  });
  const at = after ? unit.blocks.indexOf(after) + 1 : unit.blocks.length;
  const blocks = [...unit.blocks.slice(0, at), block, ...unit.blocks.slice(at)];
  return {
    script: withBlocks(script, unit, blocks, ids, stamp),
    view: { sel: block.id, focus: block.id },
  };
}

export function removeBlock(
  script: Script,
  unitId: string,
  blockId: string,
  stamp: string,
): ScriptChange {
  const unit = findUnit(script, unitId);
  const block = findBlock(unit, blockId);
  if (!unit?.blocks || !block) {
    return unchanged(script);
  }
  const at = unit.blocks.indexOf(block);
  const blocks = unit.blocks.filter((item) => item !== block);
  const near = blocks[Math.max(0, at - 1)];
  return {
    script: withBlocks(script, unit, blocks, idsOf(script), stamp),
    view: {
      sel: near ? near.id : null,
      focus: near && BLOCK_TYPES[near.type].text ? near.id : null,
    },
  };
}

export function setBlockType(
  script: Script,
  unitId: string,
  blockId: string,
  type: BlockType,
  cast: CastMember[],
  stamp: string,
): ScriptChange {
  const unit = findUnit(script, unitId);
  const block = findBlock(unit, blockId);
  if (!unit?.blocks || !block) {
    return unchanged(script);
  }
  const next: ScriptBlock = {
    ...block,
    type,
    who: type === 'dialogue' && !block.who ? firstSpeaker(cast) : block.who,
    ms: type === 'pause' && !block.ms ? DEFAULT_PAUSE_MS : block.ms,
  };
  const blocks = unit.blocks.map((item) => (item === block ? next : item));
  return {
    script: withBlocks(script, unit, blocks, idsOf(script), stamp),
    view: { focus: BLOCK_TYPES[type].text ? block.id : null },
  };
}

export function pauseMs(seconds: number): number {
  return Math.max(
    0,
    Math.min(MAX_PAUSE_MS, Math.round((Number.isNaN(seconds) ? 0 : seconds) * 1000)),
  );
}

export function applyPatch(block: ScriptBlock, patch: BlockPatch): ScriptBlock {
  return {
    ...block,
    text: patch.text ?? block.text,
    who: patch.who ?? block.who,
    paren: patch.paren ?? block.paren,
    loc: patch.loc === undefined ? block.loc : patch.loc.toUpperCase(),
    time: patch.time ?? block.time,
    beat: patch.beat ?? block.beat,
    ms: patch.seconds === undefined ? block.ms : pauseMs(patch.seconds),
  };
}

export function patchBlock(
  script: Script,
  unitId: string,
  blockId: string,
  patch: BlockPatch,
  stamp: string,
): ScriptChange {
  const unit = findUnit(script, unitId);
  const block = findBlock(unit, blockId);
  if (!unit?.blocks || !block) {
    return unchanged(script);
  }
  const blocks = unit.blocks.map((item) => (item === block ? applyPatch(block, patch) : item));
  return { script: withBlocks(script, unit, blocks, idsOf(script), stamp), view: NO_VIEW };
}

export function moveBlock(
  script: Script,
  unitId: string,
  blockId: string,
  direction: MoveDirection,
  stamp: string,
): ScriptChange {
  const unit = findUnit(script, unitId);
  const block = findBlock(unit, blockId);
  if (!unit?.blocks || !block) {
    return unchanged(script);
  }
  const from = unit.blocks.indexOf(block);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= unit.blocks.length) {
    return unchanged(script);
  }
  const blocks = [...unit.blocks];
  blocks[from] = unit.blocks[to];
  blocks[to] = block;
  return {
    script: withBlocks(script, unit, blocks, idsOf(script), stamp),
    view: { sel: block.id },
  };
}

export function duplicateBlock(
  script: Script,
  unitId: string,
  blockId: string,
  stamp: string,
): ScriptChange {
  const unit = findUnit(script, unitId);
  const block = findBlock(unit, blockId);
  if (!unit?.blocks || !block) {
    return unchanged(script);
  }
  const ids = idsOf(script);
  ids.seq += 1;
  const copy: ScriptBlock = { ...block, id: `B${ids.seq}` };
  const at = unit.blocks.indexOf(block) + 1;
  const blocks = [...unit.blocks.slice(0, at), copy, ...unit.blocks.slice(at)];
  return { script: withBlocks(script, unit, blocks, ids, stamp), view: { sel: copy.id } };
}

export function typeAfterEnter(config: ScriptConfig, type: BlockType): BlockType {
  const candidates: BlockType[] = [NEXT_BLOCK_TYPE[type], 'narration', 'action', 'dialogue'];
  const picked = candidates.find((candidate) => config.types.includes(candidate));
  return picked ?? config.types.find((candidate) => BLOCK_TYPES[candidate].text) ?? type;
}

export function cycleType(config: ScriptConfig, type: BlockType, backwards: boolean): BlockType {
  const texts = config.types.filter((candidate) => BLOCK_TYPES[candidate].text);
  if (texts.length === 0) {
    return type;
  }
  const at = texts.indexOf(type);
  return texts[(at + (backwards ? -1 : 1) + texts.length) % texts.length];
}

export function startUnit(
  script: Script,
  unitId: string,
  cast: CastMember[],
  stamp: string,
): ScriptChange {
  const unit = findUnit(script, unitId);
  if (!unit) {
    return unchanged(script);
  }
  const emptied: Script = replaceUnit(script, { ...unit, blocks: [], meta: null });
  return insertBlock(emptied, unitId, null, script.cfg.types[0], cast, stamp);
}

export function setUnitTitle(script: Script, unitId: string, title: string, stamp: string): Script {
  const unit = findUnit(script, unitId);
  return unit ? replaceUnit(script, { ...unit, title: title.trim(), updated: stamp }) : script;
}

export function setUnitChapters(
  script: Script,
  unitId: string,
  chs: ChapterRange,
  stamp: string,
): Script {
  const unit = findUnit(script, unitId);
  return unit ? replaceUnit(script, { ...unit, chs, updated: stamp }) : script;
}

export function addUnitWith(script: Script, chs: ChapterRange | null): Script {
  return appendUnit(script, { chs });
}

export function setPreset(script: Script, preset: ScriptPreset): Script {
  return {
    ...script,
    cfg: configOf(preset),
    choose: false,
    units: script.units.map((unit) => ({ ...unit, blocks: null })),
  };
}

function sameBlock(candidate: ScriptBlock, fresh: ScriptBlock): boolean {
  return (
    candidate.type === fresh.type &&
    candidate.ref === fresh.ref &&
    (fresh.type === 'pause' ? candidate.ms === fresh.ms : candidate.text === fresh.text)
  );
}

function reuseIds(fresh: ScriptBlock[], old: ScriptBlock[]): ScriptBlock[] {
  const used = new Set<string>();
  return fresh.map((block) => {
    const same = old.find((candidate) => !used.has(candidate.id) && sameBlock(candidate, block));
    if (!same) {
      return block;
    }
    used.add(same.id);
    return { ...block, id: same.id };
  });
}

export function applyDefault(
  script: Script,
  unitId: string,
  source: ScriptSource | null,
  stamp: string,
): Script | null {
  const unit = findUnit(script, unitId);
  if (!unit || !source) {
    return null;
  }
  const ids = idsOf(script);
  const fresh = defaultAudioBlocks(ids, source.list);
  const next: ScriptUnit = {
    ...unit,
    blocks: reuseIds(fresh, unit.blocks ?? []),
    meta: null,
    updated: stamp,
  };
  return { ...replaceUnit(script, next), seq: ids.seq };
}

export function resettableUnits(
  script: Script,
  sources: Record<string, ScriptSource | null>,
): ScriptUnit[] {
  return script.units.filter((unit) => !unit.meta && (sources[unit.id] ?? null) !== null);
}

export function resetUnits(
  script: Script,
  unitIds: string[],
  sources: Record<string, ScriptSource | null>,
  stamp: string,
): ResetResult {
  let current = script;
  let count = 0;
  for (const unitId of unitIds) {
    const next = applyDefault(current, unitId, sources[unitId] ?? null, stamp);
    if (next) {
      current = next;
      count += 1;
    }
  }
  return { script: current, count };
}

export function addExtraMember(
  script: Script,
  cast: CastMember[],
  name: string,
  id: string,
): { script: Script; result: CastAddResult } {
  const clean = name.trim();
  if (!clean) {
    return { script, result: 'empty' };
  }
  if (cast.some((member) => member.name.toLowerCase() === clean.toLowerCase())) {
    return { script, result: 'duplicate' };
  }
  const member: CastMember = { id, name: clean, kind: 'extra', c: cast.length };
  return { script: { ...script, extraCast: [...script.extraCast, member] }, result: 'added' };
}

export function renameExtraMember(script: Script, id: string, name: string): Script {
  const clean = name.trim();
  if (!clean || !script.extraCast.some((member) => member.id === id)) {
    return script;
  }
  const extraCast = script.extraCast.map((member) =>
    member.id === id ? { ...member, name: clean } : member,
  );
  return { ...script, extraCast };
}

export function castUsage(script: Script, id: string): number {
  let used = 0;
  for (const unit of script.units) {
    used += (unit.blocks ?? []).filter((block) => block.who === id).length;
  }
  return used;
}

export function removeExtraMember(script: Script, id: string): Script {
  if (!script.extraCast.some((member) => member.id === id) || castUsage(script, id) > 0) {
    return script;
  }
  return { ...script, extraCast: script.extraCast.filter((member) => member.id !== id) };
}
