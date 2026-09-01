import { WireKnowledge } from '@features/novel/novel.knowledge.models';
import { WireChapter, WireTranslation } from '@features/novel/novel.translation.models';
import { ProjectModuleState } from '@features/project/project.models';
// prettier-ignore
import { CastMember, Script, ScriptUnit } from '@features/scripting/scripting.models';
import { findUnit, replaceUnit, scriptProgress } from '@features/scripting/scripting.rules';

import { LANTERN_CHAPTERS, LANTERN_VI, LANTERN_VI_TITLES } from './novel-translation.fixtures';
import { projectModuleStatesFor } from './project-management.fixtures';
import { IpcHandlers } from './screen.mocks';
import { seedScripts, TEA_WOMAN } from './scripting.fixtures';

const THIRD_CHAPTER = 3;

export interface ScriptingState {
  scripts: Record<number, Script>;
  progress: Record<number, ProjectModuleState>;
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

function refreshProgress(state: ScriptingState, projectId: number): void {
  const script = state.scripts[projectId];
  if (script && hasScriptingModule(projectId)) {
    state.progress[projectId] = scriptProgress(script);
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

export function createScriptingState(): ScriptingState {
  return { scripts: seedScripts(), progress: {} };
}

export function scriptingHandlers(
  base: IpcHandlers,
  state: ScriptingState = createScriptingState(),
): IpcHandlers {
  return {
    scripting_get: (args) => {
      const script = state.scripts[numberArg(args, 'projectId')];
      return script ? clone(script) : null;
    },
    scripting_save: (args) => saveScript(state, args),
    scripting_unit_save: (args) => saveUnit(state, args),
    scripting_cast_save: (args) => saveCast(state, args),
    project_modules: (args) => modulesOf(state, args),
    ...knowledgeHandlers(base),
    translation_get: (args) =>
      withThirdChapter(base['translation_get'](args) as WireTranslation, String(args['target'])),
  };
}
