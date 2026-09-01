import { WireKnowledge } from '@features/novel/novel.knowledge.models';
import { WireChapter, WireTranslation } from '@features/novel/novel.translation.models';
import { ProjectModuleState } from '@features/project/project.models';
import { draftBlocksFor } from '@features/scripting/scripting.draft';
// prettier-ignore
import { CastMember, DraftRequest, DraftResult, Script, ScriptUnit } from '@features/scripting/scripting.models';
// prettier-ignore
import { findUnit, replaceUnit, scriptProgress, staleRefsOf } from '@features/scripting/scripting.rules';

import { LANTERN_CHAPTERS, LANTERN_VI, LANTERN_VI_TITLES } from './novel-translation.fixtures';
import { PROJECT_FIXTURES, projectModuleStatesFor } from './project-management.fixtures';
import { IpcHandlers } from './screen.mocks';
import { mockUnitSource, seedScripts, SPEAKER_HINTS, TEA_WOMAN } from './scripting.fixtures';

const DRAFT_DELAY_MS = 700;
const THIRD_CHAPTER = 3;

interface ScriptingState {
  scripts: Record<number, Script>;
  progress: Record<number, ProjectModuleState>;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function numberArg(args: Record<string, unknown>, key: string): number {
  return Number(args[key]);
}

function scriptOf(state: ScriptingState, args: Record<string, unknown>): Script {
  const script = state.scripts[numberArg(args, 'projectId')];
  if (!script) {
    throw { code: 'not_found', detail: 'This project has no script yet.' };
  }
  return script;
}

function hasScriptingModule(projectId: number): boolean {
  return projectModuleStatesFor(projectId).some((row) => row.id === 'scripting');
}

function staleUnits(projectId: number, script: Script): number {
  const project = PROJECT_FIXTURES.find((item) => item.id === projectId);
  if (!project) {
    return 0;
  }
  return script.units.filter((unit) => staleRefsOf(unit, mockUnitSource(project, unit)).length > 0)
    .length;
}

function refreshProgress(state: ScriptingState, projectId: number): void {
  const script = state.scripts[projectId];
  if (script && hasScriptingModule(projectId)) {
    state.progress[projectId] = scriptProgress(script, staleUnits(projectId, script));
  }
}

function store(state: ScriptingState, projectId: number, script: Script): void {
  state.scripts[projectId] = script;
  refreshProgress(state, projectId);
}

function saveScript(state: ScriptingState, args: Record<string, unknown>): void {
  store(state, numberArg(args, 'projectId'), clone(args['script'] as Script));
}

function saveUnit(state: ScriptingState, args: Record<string, unknown>): void {
  const projectId = numberArg(args, 'projectId');
  const script = scriptOf(state, args);
  const unit = clone(args['unit'] as ScriptUnit);
  if (!findUnit(script, unit.id)) {
    throw { code: 'not_found', detail: `Unknown unit ${unit.id}.` };
  }
  store(state, projectId, { ...replaceUnit(script, unit), seq: numberArg(args, 'seq') });
}

function saveCast(state: ScriptingState, args: Record<string, unknown>): void {
  const script = scriptOf(state, args);
  const extraCast = clone(args['extraCast'] as CastMember[]);
  store(state, numberArg(args, 'projectId'), { ...script, extraCast });
}

async function generateDraft(
  state: ScriptingState,
  args: Record<string, unknown>,
): Promise<DraftResult> {
  await pause(DRAFT_DELAY_MS);
  const projectId = numberArg(args, 'projectId');
  const script = scriptOf(state, args);
  const unit = findUnit(script, String(args['unitId']));
  if (!unit || unit.status === 'locked') {
    throw { code: 'locked', detail: 'The unit is locked or missing.' };
  }
  const ids = { seq: script.seq };
  const blocks = draftBlocksFor(ids, args['request'] as DraftRequest, SPEAKER_HINTS);
  if (!blocks) {
    throw { code: 'no_source', detail: 'The unit has no source content.' };
  }
  const drafted: ScriptUnit = {
    ...unit,
    blocks,
    meta: null,
    status: 'draft',
    updated: new Date().toISOString(),
  };
  store(state, projectId, { ...replaceUnit(script, drafted), seq: ids.seq });
  return clone({ unit: drafted, seq: ids.seq });
}

function modulesOf(state: ScriptingState, args: Record<string, unknown>): ProjectModuleState[] {
  const projectId = numberArg(args, 'projectId');
  const progress = state.progress[projectId];
  return projectModuleStatesFor(projectId).map((row) =>
    row.id === 'scripting' && progress ? { ...progress } : row,
  );
}

function thirdChapter(): WireChapter {
  const paragraphs = LANTERN_CHAPTERS[THIRD_CHAPTER - 1].paragraphs;
  return {
    title: LANTERN_VI_TITLES[THIRD_CHAPTER - 1],
    paragraphs: paragraphs.map((_, index) => ({
      n: index + 1,
      originalHashcheck: `mock-${THIRD_CHAPTER}-${index + 1}`,
      text: LANTERN_VI[`${THIRD_CHAPTER}.${index + 1}`],
      note: '',
    })),
  };
}

export function withThirdChapter(wire: WireTranslation, target: string): WireTranslation {
  const id = `ch-${THIRD_CHAPTER}`;
  if (target !== 'VI' || wire.chapters[id]) {
    return wire;
  }
  return { ...wire, chapters: { ...wire.chapters, [id]: thirdChapter() } };
}

function withTeaWoman(wire: WireKnowledge): WireKnowledge {
  return wire.items.length > 0 ? { ...wire, items: [...wire.items, clone(TEA_WOMAN)] } : wire;
}

function knowledgeHandlers(base: IpcHandlers): IpcHandlers {
  const source = base['knowledge_get'];
  return source ? { knowledge_get: (args) => withTeaWoman(source(args) as WireKnowledge) } : {};
}

export function scriptingHandlers(base: IpcHandlers, stale = true): IpcHandlers {
  const state: ScriptingState = { scripts: seedScripts(stale), progress: {} };
  return {
    scripting_get: (args) => {
      const script = state.scripts[numberArg(args, 'projectId')];
      return script ? clone(script) : null;
    },
    scripting_save: (args) => saveScript(state, args),
    scripting_unit_save: (args) => saveUnit(state, args),
    scripting_cast_save: (args) => saveCast(state, args),
    scripting_draft_generate: (args) => generateDraft(state, args),
    project_modules: (args) => modulesOf(state, args),
    ...knowledgeHandlers(base),
    translation_get: (args) =>
      withThirdChapter(base['translation_get'](args) as WireTranslation, String(args['target'])),
  };
}
