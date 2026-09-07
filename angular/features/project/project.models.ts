import { TargetLang } from '@features/novel/novel.models';

export type ProjectTemplateId = 'audiobook' | 'filmseries' | 'blank';

export type ProjectSrcKind = 'original' | 'translation';

export type ProjectStatus = 'active' | 'archived';

export type ProjectViewMode = 'grid' | 'list';

export interface ProjectSummary {
  id: number;
  name: string;
  folder: string;
  template: ProjectTemplateId;
  description: string;
  novelId: number | null;
  novelMissing: boolean;
  srcKind: ProjectSrcKind | null;
  srcLang: string | null;
  archived: boolean;
  modules: ProjectModuleId[];
  createdAt: string;
  updatedAt: string;
  openedAt: string;
}

export interface ProjectInput {
  name: string;
  template: ProjectTemplateId;
  description: string;
  novelId: number | null;
  srcKind: ProjectSrcKind | null;
  srcLang: TargetLang | null;
}

export type ProjectTextVersion = 'original' | TargetLang;

export interface ProjectPatch {
  name?: string;
  description?: string;
  modules?: ProjectModuleId[];
}

export interface ProjectError {
  code: string;
  detail: string;
}

export interface ProjectFilters {
  templates: ProjectTemplateId[];
  status: ProjectStatus[];
}

export interface ProjectTemplate {
  id: ProjectTemplateId;
  icon: string;
  modules: ProjectModuleId[];
  labelKey: `project.template.${ProjectTemplateId}`;
  blurbKey: `project.template.${ProjectTemplateId}.blurb`;
}

export interface ProjectTemplateCount {
  template: ProjectTemplateId;
  count: number;
}

export interface ProjectStatusCount {
  status: ProjectStatus;
  count: number;
}

export interface ProjectTotals {
  projects: number;
  active: number;
  archived: number;
}

export type ProjectModuleId =
  'scripting' | 'character' | 'world' | 'storyboard' | 'audiobook' | 'canvas' | 'video';

export type ProjectModuleStage = 'pre' | 'prod' | 'post';

export type ProjectModuleStatus = 'idle' | 'doing' | 'done' | 'stale';

export interface ProjectModule {
  id: ProjectModuleId;
  stage: ProjectModuleStage;
  icon: string;
  implemented: boolean;
  labelKey: `project.module.${ProjectModuleId}`;
  blurbKey: `project.module.${ProjectModuleId}.blurb`;
}

export interface ProjectModuleState {
  id: ProjectModuleId;
  state: ProjectModuleStatus;
  done: number;
  total: number;
  note: string;
}

export interface ProjectModuleRow {
  module: ProjectModule;
  state: ProjectModuleState;
}
