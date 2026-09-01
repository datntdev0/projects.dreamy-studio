import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { DirEntry, ProjectError, ProjectFilters, ProjectModule, ProjectModuleId, ProjectModuleRow, ProjectModuleStage, ProjectModuleState, ProjectModuleStatus, ProjectStatus, ProjectSummary, ProjectTemplate, ProjectTemplateId } from './project.models';

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'audiobook',
    icon: 'mic',
    labelKey: 'project.template.audiobook',
    blurbKey: 'project.template.audiobook.blurb',
  },
  {
    id: 'filmseries',
    icon: 'film',
    labelKey: 'project.template.filmseries',
    blurbKey: 'project.template.filmseries.blurb',
  },
  {
    id: 'blank',
    icon: 'folder',
    labelKey: 'project.template.blank',
    blurbKey: 'project.template.blank.blurb',
  },
];

function moduleDef(
  id: ProjectModuleId,
  stage: ProjectModuleStage,
  icon: string,
  implemented: boolean,
): ProjectModule {
  return {
    id,
    stage,
    icon,
    implemented,
    labelKey: `project.module.${id}`,
    blurbKey: `project.module.${id}.blurb`,
  };
}

export const PROJECT_MODULES: ProjectModule[] = [
  moduleDef('scripting', 'pre', 'pen', true),
  moduleDef('character', 'pre', 'user', false),
  moduleDef('world', 'pre', 'cube', false),
  moduleDef('storyboard', 'pre', 'frames', false),
  moduleDef('audiobook', 'prod', 'mic', true),
  moduleDef('canvas', 'prod', 'nodes', false),
  moduleDef('video', 'post', 'film', false),
];

export const PROJECT_MODULE_STAGES: ProjectModuleStage[] = ['pre', 'prod', 'post'];

const MODULE_BADGE_CLASSES: Record<ProjectModuleStatus, string> = {
  idle: '',
  doing: 'badge-running',
  done: 'badge-success',
  stale: 'badge-warning',
};

function matchesProject(project: ProjectSummary, filters: ProjectFilters, needle: string): boolean {
  const templateOk = filters.templates.length === 0 || filters.templates.includes(project.template);
  const statusOk = filters.status.length === 0 || filters.status.includes(projectStatus(project));
  const queryOk =
    !needle || `${project.name} ${project.description}`.toLocaleLowerCase().includes(needle);
  return templateOk && statusOk && queryOk;
}

function compareProjectNames(a: ProjectSummary, b: ProjectSummary): number {
  return (
    Number(a.archived) - Number(b.archived) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

function compareProjectUpdates(a: ProjectSummary, b: ProjectSummary): number {
  return Number(a.archived) - Number(b.archived) || b.updatedAt.localeCompare(a.updatedAt);
}

function compareDirectoryEntries(a: DirEntry, b: DirEntry): number {
  return (
    Number(b.kind === 'dir') - Number(a.kind === 'dir') ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

export function validateProjectName(name: string): 'empty' | null {
  return name.trim() ? null : 'empty';
}

export function toggled<T>(values: T[], value: T): T[] {
  const index = values.indexOf(value);
  return index < 0 ? [...values, value] : [...values.slice(0, index), ...values.slice(index + 1)];
}

export function validateRange(rangeFrom: number | null, rangeTo: number | null): boolean {
  if (rangeFrom === null && rangeTo === null) {
    return true;
  }
  return (
    Number.isInteger(rangeFrom) &&
    Number.isInteger(rangeTo) &&
    (rangeFrom as number) > 0 &&
    (rangeTo as number) >= (rangeFrom as number)
  );
}

export function projectStatus(project: Pick<ProjectSummary, 'archived'>): ProjectStatus {
  return project.archived ? 'archived' : 'active';
}

export function filterProjects(
  projects: ProjectSummary[],
  filters: ProjectFilters,
  query: string,
): ProjectSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  const visible: ProjectSummary[] = [];
  for (const project of projects) {
    if (matchesProject(project, filters, needle)) {
      visible.push(project);
    }
  }
  return visible;
}

export function sortProjects(
  projects: ProjectSummary[],
  sort: 'updated' | 'name',
): ProjectSummary[] {
  return [...projects].sort(sort === 'name' ? compareProjectNames : compareProjectUpdates);
}

export function sortDirEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort(compareDirectoryEntries);
}

export function treeKey(projectId: number, path: string): string {
  return `${projectId}:${path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}`;
}

function isProjectError(value: unknown): value is ProjectError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate['code'] === 'string' && typeof candidate['detail'] === 'string';
}

export function toProjectError(error: unknown): ProjectError {
  const payload = error instanceof DesktopIpcError ? error.cause : error;
  return isProjectError(payload) ? payload : { code: 'unknown', detail: String(payload) };
}

export function isProjectTemplate(value: string): value is ProjectTemplateId {
  for (const template of PROJECT_TEMPLATES) {
    if (template.id === value) {
      return true;
    }
  }
  return false;
}

export function templateIcon(id: ProjectTemplateId): string {
  for (const template of PROJECT_TEMPLATES) {
    if (template.id === id) {
      return template.icon;
    }
  }
  return 'folder';
}

export function projectCode(id: number): string {
  return `PRJ-${String(id).padStart(4, '0')}`;
}

export function isProjectModuleId(value: string): value is ProjectModuleId {
  for (const module of PROJECT_MODULES) {
    if (module.id === value) {
      return true;
    }
  }
  return false;
}

export function projectModule(id: ProjectModuleId): ProjectModule {
  for (const module of PROJECT_MODULES) {
    if (module.id === id) {
      return module;
    }
  }
  return PROJECT_MODULES[0];
}

export function idleModuleState(id: ProjectModuleId): ProjectModuleState {
  return { id, state: 'idle', done: 0, total: 0, note: '' };
}

function stateById(
  states: ProjectModuleState[],
  id: ProjectModuleId,
): ProjectModuleState | undefined {
  for (const state of states) {
    if (state.id === id) {
      return state;
    }
  }
  return undefined;
}

function moduleRowOf(states: ProjectModuleState[], module: ProjectModule): ProjectModuleRow {
  return { module, state: stateById(states, module.id) ?? idleModuleState(module.id) };
}

export function completeModuleStates(
  states: ProjectModuleState[] | null | undefined,
): ProjectModuleState[] {
  const known = states ?? [];
  const complete: ProjectModuleState[] = [];
  for (const module of PROJECT_MODULES) {
    complete.push(stateById(known, module.id) ?? idleModuleState(module.id));
  }
  return complete;
}

export function moduleRows(states: ProjectModuleState[]): ProjectModuleRow[] {
  const rows: ProjectModuleRow[] = [];
  for (const module of PROJECT_MODULES) {
    rows.push(moduleRowOf(states, module));
  }
  return rows;
}

export function moduleStateKey(status: ProjectModuleStatus): LanguageKey {
  return `project.module.state.${status}`;
}

export function moduleBadgeClass(status: ProjectModuleStatus): string {
  return MODULE_BADGE_CLASSES[status];
}
