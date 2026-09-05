import { WireKnowledge } from '@features/novel/novel.knowledge.models';
import { NovelSummary } from '@features/novel/novel.models';
import { ProjectSummary } from '@features/project/project.models';
import type { Decorator } from '@storybook/angular-vite';

import { AUDIOBOOK_CLOUD_ACCOUNTS } from './audiobook.fixtures';
import { audiobookHandlers } from './audiobook.mocks';
import { knowledgeScreenHandlers } from './novel-knowledge.mocks';
// prettier-ignore
import { PROJECT_DIRECTORY, PROJECT_FIXTURES, PROJECT_NOVELS, projectCoverFor, projectModuleStatesFor } from './project-management.fixtures';
import { IpcHandlers, withScreen } from './screen.mocks';
import { createScriptingState, scriptingHandlers } from './scripting.mocks';

const ANALYZED_CHAPTERS = [1, 2];

const NO_ASSETS = { image: 0, sound: 0, video: 0, prompt: 0 };

const SHELL_HANDLERS: IpcHandlers = {
  app_info: () => ({ name: 'Dreamy Studio', version: '0.0.0' }),
  workspace_current: () => ({ name: 'Dreamy Studio', path: String.raw`D:\Dreamy Studio` }),
  library_summary: () => ({ assets: NO_ASSETS, unfiled: NO_ASSETS }),
};

export interface ProjectScenario {
  empty?: boolean;
}

function findProject(projects: ProjectSummary[], id: number): ProjectSummary | undefined {
  for (const project of projects) {
    if (project.id === id) {
      return project;
    }
  }
  return undefined;
}

function projectHandlers(projects: ProjectSummary[]): IpcHandlers {
  return {
    project_list: () => projects,
    project_open: (args) => findProject(projects, Number(args['id'])),
    project_modules: (args) => projectModuleStatesFor(Number(args['projectId'])),
    project_dir_list: () => PROJECT_DIRECTORY,
    project_cover_get: (args) => projectCoverFor(Number(args['id'])),
  };
}

function novelHandlers(base: IpcHandlers, empty: boolean): IpcHandlers {
  return {
    novel_list: (args) =>
      empty ? [] : [...(base['novel_list'](args) as NovelSummary[]), ...PROJECT_NOVELS],
  };
}

function analyzedOnly(wire: WireKnowledge): WireKnowledge {
  const analyzed = Object.fromEntries(
    Object.entries(wire.analyzed).filter(([seq]) => ANALYZED_CHAPTERS.includes(Number(seq))),
  );
  return { ...wire, analyzed };
}

function knowledgeHandlers(source: IpcHandlers): IpcHandlers {
  return { knowledge_get: (args) => analyzedOnly(source['knowledge_get'](args) as WireKnowledge) };
}

export function projectScreenHandlers(scenario: ProjectScenario = {}): IpcHandlers {
  const empty = scenario.empty === true;
  const base = knowledgeScreenHandlers({ chapters: !empty });
  const scriptingState = createScriptingState();
  const scripting = scriptingHandlers(base, scriptingState);
  const audiobook = audiobookHandlers(scriptingState, scripting['project_modules'], base);
  return {
    ...base,
    ...SHELL_HANDLERS,
    ...novelHandlers(base, empty),
    ...projectHandlers(empty ? [] : PROJECT_FIXTURES),
    ...scripting,
    ...audiobook,
    ...knowledgeHandlers(scripting),
  };
}

export function withProjects(scenario: ProjectScenario = {}): { decorators: Decorator[] } {
  return withScreen(projectScreenHandlers(scenario), AUDIOBOOK_CLOUD_ACCOUNTS);
}
