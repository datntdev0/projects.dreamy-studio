import { LibraryVoice } from '../library/library.voices.models';
import { engineName } from '../library/library.voices.rules';
import { ScriptBlock, ScriptUnit } from '../scripting/scripting.models';
import { CloudAccount } from '../settings/cloud.models';
import {
  AudioEnv,
  CloudBilling,
  GenerateGroup,
  GeneratePlan,
  PreviewRequest,
  SegmentRequest,
  VoiceAvailability,
} from './audiobook.models';
import {
  COST_PER_CHAR,
  readText,
  rulesSignature,
  segmentInfo,
  todoBlocks,
  voicingOf,
} from './audiobook.rules';

export const LOCAL_GROUP = 'local';

export const PREVIEW_FALLBACK_TEXT = 'The lamp keeper climbed the stairs as the tide rolled in.';

export function billingOf(accounts: CloudAccount[], engineId: string): CloudBilling {
  const account = accounts.find((item) => item.id === engineId);
  return account && !account.requiresKey ? 'free' : 'paid';
}

function groupKeyOf(voice: LibraryVoice | null): string {
  return voice && voice.engineKind === 'cloud' ? voice.engine : LOCAL_GROUP;
}

function groupOf(
  key: string,
  availability: VoiceAvailability,
  accounts: CloudAccount[],
): GenerateGroup {
  if (key === LOCAL_GROUP) {
    return { key, kind: 'local', name: '', billing: 'local', chars: 0, cost: 0 };
  }
  return {
    key,
    kind: 'cloud',
    name: engineName(availability.engines, key),
    billing: billingOf(accounts, key),
    chars: 0,
    cost: 0,
  };
}

export function withCost(group: GenerateGroup): GenerateGroup {
  return { ...group, cost: group.billing === 'paid' ? group.chars * COST_PER_CHAR : 0 };
}

export function generateGroups(
  env: AudioEnv,
  availability: VoiceAvailability,
  accounts: CloudAccount[],
  blocks: ScriptBlock[],
): GenerateGroup[] {
  const groups = new Map<string, GenerateGroup>();
  for (const block of blocks) {
    const key = groupKeyOf(voicingOf(env, block).voice);
    const group = groups.get(key) ?? groupOf(key, availability, accounts);
    groups.set(key, { ...group, chars: group.chars + block.text.length });
  }
  return [...groups.values()].map(withCost);
}

export function generatePlanOf(
  env: AudioEnv,
  availability: VoiceAvailability,
  accounts: CloudAccount[],
  unit: ScriptUnit,
): GeneratePlan {
  const blocks = todoBlocks(env, unit);
  const groups = generateGroups(env, availability, accounts, blocks);
  return {
    unitId: unit.id,
    unitNo: unit.no,
    segmentIds: blocks.map((block) => block.id),
    segments: blocks.length,
    regenerated: blocks.filter((block) => segmentInfo(env, unit, block).state !== 'none').length,
    groups,
    cost: groups.reduce((sum, group) => sum + group.cost, 0),
  };
}

export function segmentRequestOf(
  env: AudioEnv,
  block: ScriptBlock,
  activeSymbols: string[],
): SegmentRequest | null {
  const { voice, speed } = voicingOf(env, block);
  if (!voice) {
    return null;
  }
  return {
    text: block.text,
    readText: readText(env.book.lex, block.text),
    voice: voice.id,
    speed,
    rules: rulesSignature(env.book.lex, block.text),
    paren: block.paren,
    symbols: activeSymbols,
  };
}

export function previewRequestOf(voice: LibraryVoice, speed: number): PreviewRequest {
  return { voiceId: voice.id, speed, text: voice.sampleText || PREVIEW_FALLBACK_TEXT };
}
