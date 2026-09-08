import { LibrarySummary } from '@features/library/library.models';
import { PipelineSnapshot } from '@features/novel/novel.translation.models';
import { compareNewestFirst, firstError } from '@features/pipeline/pipeline.rules';
import { ProjectModuleState, ProjectSummary } from '@features/project/project.models';
import { enabledModuleStates, projectPercent } from '@features/project/project.rules';
import { LanguageKey } from '@shared/language/language.models';

import { HomeActivity, HomeAttention, HomeProjectCard } from './home.models';

const MORNING_END = 12;
const AFTERNOON_END = 18;

export function greetingKey(hour: number): LanguageKey {
  if (hour < MORNING_END) return 'home.greeting.morning';
  if (hour < AFTERNOON_END) return 'home.greeting.afternoon';
  return 'home.greeting.evening';
}

function compareOpenedDesc(a: ProjectSummary, b: ProjectSummary): number {
  return b.openedAt.localeCompare(a.openedAt);
}

function isLive(project: ProjectSummary): boolean {
  return !project.archived;
}

export function recentLiveProjects(projects: ProjectSummary[], limit: number): ProjectSummary[] {
  return projects.filter(isLive).sort(compareOpenedDesc).slice(0, limit);
}

export function projectCard(
  project: ProjectSummary,
  states: ProjectModuleState[],
): HomeProjectCard {
  const enabled = enabledModuleStates(project, states);
  return { project, states: enabled, percent: projectPercent(enabled) };
}

function isStale(state: ProjectModuleState): boolean {
  return state.state === 'stale';
}

function staleAttention(project: ProjectSummary, state: ProjectModuleState): HomeAttention {
  return {
    id: `module:${project.id}:${state.id}`,
    level: 'warn',
    kind: 'module',
    projectId: project.id,
    moduleId: state.id,
    pipelineId: null,
    owner: project.name,
    detail: state.note,
  };
}

export function moduleAttention(cards: HomeProjectCard[]): HomeAttention[] {
  return cards.flatMap(cardAttention);
}

function cardAttention(card: HomeProjectCard): HomeAttention[] {
  return card.states.filter(isStale).map(staleAttention.bind(null, card.project));
}

function isFailed(pipeline: PipelineSnapshot): boolean {
  return pipeline.status === 'failed';
}

function failedAttention(
  ownerOf: (pipeline: PipelineSnapshot) => string,
  pipeline: PipelineSnapshot,
): HomeAttention {
  return {
    id: `pipeline:${pipeline.id}`,
    level: 'danger',
    kind: 'pipeline',
    projectId: pipeline.projectId,
    moduleId: null,
    pipelineId: pipeline.id,
    owner: ownerOf(pipeline),
    detail: firstError(pipeline),
    pipelineKind: pipeline.kind,
  };
}

export function pipelineAttention(
  pipelines: PipelineSnapshot[],
  ownerOf: (pipeline: PipelineSnapshot) => string,
): HomeAttention[] {
  return pipelines.filter(isFailed).map(failedAttention.bind(null, ownerOf));
}

export function failedCount(pipelines: PipelineSnapshot[]): number {
  return pipelines.filter(isFailed).length;
}

function activityAt(pipeline: PipelineSnapshot): string {
  return pipeline.finishedAt ?? pipeline.startedAt ?? pipeline.createdAt;
}

function activityOf(
  ownerOf: (pipeline: PipelineSnapshot) => string,
  pipeline: PipelineSnapshot,
): HomeActivity {
  return { pipeline, owner: ownerOf(pipeline), at: activityAt(pipeline) };
}

export function recentActivity(
  pipelines: PipelineSnapshot[],
  ownerOf: (pipeline: PipelineSnapshot) => string,
  limit: number,
): HomeActivity[] {
  return [...pipelines]
    .sort(compareNewestFirst)
    .slice(0, limit)
    .map(activityOf.bind(null, ownerOf));
}

export function libraryTotal(summary: LibrarySummary): number {
  return Object.values(summary.assets).reduce(sum, 0);
}

function sum(total: number, value: number): number {
  return total + value;
}
