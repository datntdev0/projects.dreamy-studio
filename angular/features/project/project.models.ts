export type ProjectTemplateId = "audiobook" | "filmseries" | "blank";

export type ProjectSrcKind = "original" | "translation";

export type ProjectStatus = "active" | "archived";

export type ProjectViewMode = "grid" | "list";

export type ProjectSort = "updated" | "name";

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
  rangeFrom: number | null;
  rangeTo: number | null;
  archived: boolean;
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
  rangeFrom: number | null;
  rangeTo: number | null;
}

export interface ProjectPatch {
  name?: string;
  description?: string;
}

export interface DirEntry {
  name: string;
  kind: "dir" | "file";
  size: number;
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
