import { DesktopIpcError } from "../../core/desktop/desktop-ipc-error";
import { DirEntry } from "./project.models";
import { ProjectError } from "./project.models";
import { ProjectFilters } from "./project.models";
import { ProjectStatus } from "./project.models";
import { ProjectSummary } from "./project.models";
import { ProjectTemplate } from "./project.models";
import { ProjectTemplateId } from "./project.models";

export const PROJECT_NAME_MAX = 60;

export const FORBIDDEN_NAME_CHARS = /[<>:"/\\|?*]/;

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { id: "audiobook", icon: "mic", labelKey: "project.template.audiobook", blurbKey: "project.template.audiobook.blurb" },
  { id: "filmseries", icon: "film", labelKey: "project.template.filmseries", blurbKey: "project.template.filmseries.blurb" },
  { id: "blank", icon: "folder", labelKey: "project.template.blank", blurbKey: "project.template.blank.blurb" },
];

function isDuplicateName(project: ProjectSummary, needle: string, exceptId: number | undefined): boolean {
  return project.id !== exceptId && project.name.trim().toLocaleLowerCase() === needle;
}

function folderName(folder: string): string {
  const normalized = folder.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

function matchesProject(project: ProjectSummary, filters: ProjectFilters, needle: string): boolean {
  const templateOk = filters.templates.length === 0 || filters.templates.includes(project.template);
  const statusOk = filters.status.length === 0 || filters.status.includes(projectStatus(project));
  const queryOk = !needle || `${project.name} ${project.description}`.toLocaleLowerCase().includes(needle);
  return templateOk && statusOk && queryOk;
}

function compareProjectNames(a: ProjectSummary, b: ProjectSummary): number {
  return Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function compareProjectUpdates(a: ProjectSummary, b: ProjectSummary): number {
  return Number(a.archived) - Number(b.archived) || b.updatedAt.localeCompare(a.updatedAt);
}

function compareDirectoryEntries(a: DirEntry, b: DirEntry): number {
  return Number(b.kind === "dir") - Number(a.kind === "dir") || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function validateProjectName(name: string, projects: ProjectSummary[], exceptId?: number): "empty" | "tooLong" | "forbidden" | "duplicate" | null {
  const value = name.trim();
  if (!value) {
    return "empty";
  }
  if (value.length > PROJECT_NAME_MAX) {
    return "tooLong";
  }
  if (FORBIDDEN_NAME_CHARS.test(value)) {
    return "forbidden";
  }
  const needle = value.toLocaleLowerCase();
  for (const project of projects) {
    if (isDuplicateName(project, needle, exceptId)) {
      return "duplicate";
    }
  }
  return null;
}

export function slugOf(name: string): string {
  return name.replace(/[Đđ]/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

export function folderPreview(name: string, existingFolders: string[]): string {
  const base = slugOf(name);
  const folders = new Set<string>();
  for (const folder of existingFolders) {
    folders.add(folderName(folder));
  }
  if (!folders.has(base.toLowerCase())) {
    return `projects/${base}`;
  }
  let suffix = 2;
  while (folders.has(`${base}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `projects/${base}-${suffix}`;
}

export function toggled<T>(values: T[], value: T): T[] {
  const index = values.indexOf(value);
  return index < 0 ? [...values, value] : [...values.slice(0, index), ...values.slice(index + 1)];
}

export function validateRange(rangeFrom: number | null, rangeTo: number | null): boolean {
  if (rangeFrom === null && rangeTo === null) {
    return true;
  }
  return Number.isInteger(rangeFrom) && Number.isInteger(rangeTo) && (rangeFrom as number) > 0 && (rangeTo as number) >= (rangeFrom as number);
}

export function projectStatus(project: Pick<ProjectSummary, "archived">): ProjectStatus {
  return project.archived ? "archived" : "active";
}

export function filterProjects(projects: ProjectSummary[], filters: ProjectFilters, query: string): ProjectSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  const visible: ProjectSummary[] = [];
  for (const project of projects) {
    if (matchesProject(project, filters, needle)) {
      visible.push(project);
    }
  }
  return visible;
}

export function sortProjects(projects: ProjectSummary[], sort: "updated" | "name"): ProjectSummary[] {
  return [...projects].sort(sort === "name" ? compareProjectNames : compareProjectUpdates);
}

export function sortDirEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort(compareDirectoryEntries);
}

export function treeKey(projectId: number, path: string): string {
  return `${projectId}:${path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")}`;
}

function isProjectError(value: unknown): value is ProjectError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate["code"] === "string" && typeof candidate["detail"] === "string";
}

export function toProjectError(error: unknown): ProjectError {
  const payload = error instanceof DesktopIpcError ? error.cause : error;
  return isProjectError(payload) ? payload : { code: "unknown", detail: String(payload) };
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
  return "folder";
}

export function projectCode(id: number): string {
  return `PRJ-${String(id).padStart(4, "0")}`;
}
