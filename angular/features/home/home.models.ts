import { PipelineSnapshot } from '@features/novel/novel.translation.models';
// prettier-ignore
import { ProjectModuleId, ProjectModuleState, ProjectSummary } from '@features/project/project.models';
import { LanguageKey } from '@shared/language/language.models';

export interface HomeProjectCard {
  project: ProjectSummary;
  states: ProjectModuleState[];
  percent: number;
}

export type HomeAttentionLevel = 'warn' | 'danger';

export interface HomeAttention {
  id: string;
  level: HomeAttentionLevel;
  kind: 'module' | 'pipeline';
  projectId: number | null;
  moduleId: ProjectModuleId | null;
  pipelineId: number | null;
  owner: string;
  detail?: string;
  pipeline?: PipelineSnapshot;
}

export interface HomeActivity {
  pipeline: PipelineSnapshot;
  owner: string;
  at: string;
}

export interface HomeStat {
  id: 'projects' | 'novels' | 'library' | 'pipelines';
  icon: string;
  labelKey: LanguageKey;
  value: number;
  note: string;
  warn: boolean;
}
