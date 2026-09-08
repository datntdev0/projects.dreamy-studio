import { PipelineSnapshot } from '@features/novel/novel.translation.models';
import type { Decorator } from '@storybook/angular-vite';

import { mixedHistory, pipelineHistory } from '../features/pipeline.fixtures';
import { AUDIOBOOK_CLOUD_ACCOUNTS } from './audiobook.fixtures';
import { projectScreenHandlers } from './project-management.mocks';
import { IpcHandlers, withScreen } from './screen.mocks';

const HOME_PROJECT_ID = 1;

const LIBRARY_ASSETS = { image: 24, sound: 9, video: 4, prompt: 12, voice: 8 };
const NO_ASSETS = { image: 0, sound: 0, video: 0, prompt: 0, voice: 0 };

export interface HomeScenario {
  empty?: boolean;
  healthy?: boolean;
}

function ownedByProject(pipeline: PipelineSnapshot): PipelineSnapshot {
  return pipeline.kind === 'audio'
    ? { ...pipeline, novelId: null, projectId: HOME_PROJECT_ID }
    : pipeline;
}

function isHealthy(pipeline: PipelineSnapshot): boolean {
  return pipeline.status !== 'failed';
}

function homeHistory(healthy: boolean): PipelineSnapshot[] {
  const history = [...mixedHistory(), ...pipelineHistory()].map(ownedByProject);
  return healthy ? history.filter(isHealthy) : history;
}

function matchesOwner(args: Record<string, unknown>, pipeline: PipelineSnapshot): boolean {
  if (args['projectId'] !== undefined) {
    return pipeline.projectId === Number(args['projectId']);
  }
  return pipeline.projectId === null && pipeline.novelId === Number(args['novelId']);
}

function historyHandler(history: PipelineSnapshot[]): IpcHandlers[string] {
  return (args) => history.filter(matchesOwner.bind(null, args));
}

export function homeScreenHandlers(scenario: HomeScenario = {}): IpcHandlers {
  const empty = scenario.empty === true;
  const assets = empty ? NO_ASSETS : LIBRARY_ASSETS;
  const handlers = projectScreenHandlers({ empty });
  return {
    ...handlers,
    library_summary: () => ({ assets, unfiled: NO_ASSETS }),
    pipeline_history_list: historyHandler(empty ? [] : homeHistory(scenario.healthy === true)),
    ...(scenario.healthy ? { project_modules: () => [] } : {}),
  };
}

export function withHome(scenario: HomeScenario = {}): { decorators: Decorator[] } {
  return withScreen(homeScreenHandlers(scenario), AUDIOBOOK_CLOUD_ACCOUNTS);
}
