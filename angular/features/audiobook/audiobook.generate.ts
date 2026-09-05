import { LibraryVoice } from '../library/library.voices.models';
import { engineName } from '../library/library.voices.rules';
import { PipelineSnapshot, PipelineTask, TaskRequest } from '../novel/novel.translation.models';
import { ScriptBlock, ScriptUnit } from '../scripting/scripting.models';
import { CloudAccount } from '../settings/cloud.models';
// prettier-ignore
import { AudioEnv, AudioStart, CloudBilling, GenerateGroup, GeneratePlan, GenerationJob, PreviewRequest, SegmentRequest, VoiceAvailability } from './audiobook.models';
import { COST_PER_CHAR, segmentInfo, todoBlocks, voicingOf } from './audiobook.rules';

export const LOCAL_GROUP = 'local';

export const AUDIO_KIND = 'audio';

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

export function segmentRequestOf(env: AudioEnv, block: ScriptBlock): SegmentRequest | null {
  const { speaker, voice, speed } = voicingOf(env, block);
  if (!voice) {
    return null;
  }
  return {
    text: block.text,
    speaker: speaker ? speaker.id : null,
    voice: voice.id,
    speed,
    paren: block.paren,
  };
}

export function previewRequestOf(voice: LibraryVoice, speed: number): PreviewRequest {
  return { voiceId: voice.id, speed, text: voice.sampleText || PREVIEW_FALLBACK_TEXT };
}

export function audioStartOf(env: AudioEnv, unitId: string, blocks: ScriptBlock[]): AudioStart {
  const tasks: TaskRequest[] = [];
  const requests: Record<string, SegmentRequest> = {};
  for (const block of blocks) {
    const request = segmentRequestOf(env, block);
    if (request) {
      tasks.push({ chapterId: unitId, segmentId: block.id });
      requests[block.id] = request;
    }
  }
  return { tasks, requests };
}

function isPending(task: PipelineTask): boolean {
  return task.status === 'queued' || task.status === 'running';
}

function collectJobs(pipeline: PipelineSnapshot, jobs: GenerationJob[]): void {
  for (const task of pipeline.tasks) {
    if (task.segmentId !== null && isPending(task)) {
      jobs.push({ unitId: task.chapterId, blockId: task.segmentId });
    }
  }
}

export function audioJobsOf(pipelines: PipelineSnapshot[], projectId: number): GenerationJob[] {
  const jobs: GenerationJob[] = [];
  for (const pipeline of pipelines) {
    if (pipeline.kind === AUDIO_KIND && pipeline.projectId === projectId) {
      collectJobs(pipeline, jobs);
    }
  }
  return jobs;
}

export function pipelineUnits(pipeline: PipelineSnapshot): string[] {
  const units: string[] = [];
  for (const task of pipeline.tasks) {
    if (!units.includes(task.chapterId)) {
      units.push(task.chapterId);
    }
  }
  return units;
}
