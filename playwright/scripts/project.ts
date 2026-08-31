import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, type Page } from "@playwright/test";
import type { Ui } from "./fixtures.ts";
import { openFromSplash } from "./flows.ts";
import { seedLibrary, type LibrarySeed } from "./library.ts";
import type { PickerStub } from "./picker.ts";
import type { Sandbox } from "./sandbox.ts";
import { WORKSPACE_DB_FILE, seedWorkspace, type SeedNovel } from "./workspaces.ts";
import type { TemplateId } from "../pages/project.ts";

export const PROJECT_WORKSPACE_NAME = "projects";

export const PROJECT_NAME_REQUIRED = /nhập tên project|enter a project name/i;
export const PROJECT_CREATED = /đã tạo project|created project/i;
export const PROJECT_DELETED = /đã xóa project|deleted project/i;
export const RANGE_INVALID = /phạm vi chương không hợp lệ|chapter range is invalid/i;
export const SOURCE_NOVEL_NOT_FOUND = /không tìm thấy novel nguồn|source novel could not be found/i;
export const DELETE_NOTE = /không bị ảnh hưởng|not affected/i;
export const AUDIOBOOK = /Audiobook/;
export const FILMSERIES = /Filmseries/;
export const BLANK = /Dự án trống|Blank project/;
export const AUDIOBOOK_BLURB = /audio có người dẫn chuyện|with a narrator/;
export const FILMSERIES_BLURB = /Dựng phim nhiều tập|multi-episode film/;
export const BLANK_BLURB = /Bắt đầu từ trống|Start empty/;
export const ACTIVE = /Active|Đang làm/;
export const ARCHIVED = /Archived|Lưu trữ/;
export const ORIGINAL = /Bản gốc|Original/;
export const NO_NOVEL = /Không gắn novel|No novel linked/;
export const NOVEL_DELETED = /Novel nguồn đã bị xóa|Source novel deleted/;
export const SOURCE_NOTE = /đúng phiên bản văn bản|tied to the text version/i;
export const COLUMN_PROJECT = /^Project$/;
export const COLUMN_TYPE = /^(Type|Loại)$/;
export const COLUMN_STATUS = /^(Status|Trạng thái)$/;
export const COLUMN_UPDATED = /^(Updated|Cập nhật)$/;

export const HARBOR_CHAPTERS = [{ title: "One" }, { title: "Two" }, { title: "Three" }, { title: "Four" }, { title: "Five" }];

const DEFAULT_STAMP = "2026-01-01T12:00:00.000Z";
const MISSING_NOVEL_ID = 999;
const FOLDER_OPEN_COMMAND = "project_folder_open";

export interface SeedProject {
  readonly name: string;
  readonly template?: TemplateId;
  readonly description?: string;
  readonly novel?: string;
  readonly missingNovel?: boolean;
  readonly range?: readonly [number, number];
  readonly archived?: boolean;
  readonly updatedAt?: string;
  readonly dirs?: readonly string[];
  readonly files?: Readonly<Record<string, string>>;
}

export interface ProjectsOptions {
  readonly novels?: readonly SeedNovel[];
  readonly projects?: readonly SeedProject[];
  readonly library?: LibrarySeed;
}

export interface ProjectRecord {
  readonly id: number;
  readonly name: string;
  readonly template: string;
  readonly description: string;
  readonly novelId: number | null;
  readonly srcKind: string | null;
  readonly srcLang: string | null;
  readonly rangeFrom: number | null;
  readonly rangeTo: number | null;
  readonly archived: boolean;
}

interface FolderOpenWindow {
  __dreamyFolderOpens?: unknown[];
}

export function projectFolder(workspace: string, id: number): string {
  return join(workspace, "projects", String(id));
}

function novelRef(database: DatabaseSync, project: SeedProject): { id: number | null; lang: string | null } {
  if (project.missingNovel) {
    return { id: MISSING_NOVEL_ID, lang: "VI" };
  }
  if (project.novel === undefined) {
    return { id: null, lang: null };
  }
  const row = database.prepare("SELECT id, lang FROM ws_novels WHERE title = ?").get(project.novel);
  if (row === undefined) {
    throw new Error(`no novel titled ${project.novel}`);
  }
  return { id: Number(row["id"]), lang: String(row["lang"]) };
}

async function writeProjectFiles(dir: string, project: SeedProject): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const sub of project.dirs ?? []) {
    await mkdir(join(dir, sub), { recursive: true });
  }
  for (const [relative, text] of Object.entries(project.files ?? {})) {
    await mkdir(dirname(join(dir, relative)), { recursive: true });
    await writeFile(join(dir, relative), text);
  }
}

export async function seedProjects(workspace: string, projects: readonly SeedProject[]): Promise<void> {
  const database = new DatabaseSync(join(workspace, WORKSPACE_DB_FILE));
  const ids: number[] = [];
  try {
    const insert = database.prepare(
      "INSERT INTO ws_projects (name, template, description, novel_id, src_kind, src_lang, range_from, range_to, archived, created_at, updated_at, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const project of projects) {
      const novel = novelRef(database, project);
      const stamp = project.updatedAt ?? DEFAULT_STAMP;
      const kind = novel.id === null ? null : "original";
      const [from, to] = novel.id === null || project.range === undefined ? [null, null] : project.range;
      const result = insert.run(project.name, project.template ?? "audiobook", project.description ?? "", novel.id, kind, novel.lang, from, to, project.archived ? 1 : 0, DEFAULT_STAMP, stamp, stamp);
      ids.push(Number(result.lastInsertRowid));
    }
  } finally {
    database.close();
  }
  for (const [index, project] of projects.entries()) {
    await writeProjectFiles(projectFolder(workspace, ids[index] ?? index + 1), project);
  }
}

export async function seedProjectsWorkspace(workspace: string, options: ProjectsOptions): Promise<void> {
  await seedWorkspace(workspace, { novels: options.novels ?? [] });
  await seedProjects(workspace, options.projects ?? []);
  if (options.library !== undefined) {
    await seedLibrary(workspace, options.library);
  }
}

export async function showCatalog(ui: Ui): Promise<void> {
  const project = ui.main.project;
  if (!(await project.explorer.catalog.isVisible())) {
    await project.rail.click();
  }
  await project.explorer.catalog.click();
  await expect(project.catalog.root).toBeVisible();
}

export async function openProjectsView(ui: Ui, picker: PickerStub, sandbox: Sandbox, options: ProjectsOptions = {}): Promise<string> {
  const workspace = sandbox.workspace(PROJECT_WORKSPACE_NAME);
  await seedProjectsWorkspace(workspace, options);
  await openFromSplash(ui, picker, workspace);
  await showCatalog(ui);
  return workspace;
}

export async function selectProject(ui: Ui, name: string): Promise<void> {
  await ui.main.project.catalog.card(name).click();
  await expect(ui.main.project.panel.name).toHaveText(name);
}

export async function openProjectTab(ui: Ui, name: string): Promise<void> {
  await showCatalog(ui);
  await ui.main.project.catalog.card(name).dblclick();
  await expect(ui.main.project.view.title).toHaveText(name);
}

export async function openSettings(ui: Ui): Promise<void> {
  await ui.main.project.view.tabSettings.click();
  await expect(ui.main.project.view.settings).toBeVisible();
}

export async function openProjectSettings(ui: Ui, name: string): Promise<void> {
  await openProjectTab(ui, name);
  await openSettings(ui);
}

export async function openProjectFiles(ui: Ui, name: string): Promise<void> {
  await openProjectTab(ui, name);
  await expect(ui.main.project.view.files).toBeVisible();
}

export function readProjects(workspace: string): ProjectRecord[] {
  const database = new DatabaseSync(join(workspace, WORKSPACE_DB_FILE), { readOnly: true });
  try {
    const sql = "SELECT id, name, template, description, novel_id, src_kind, src_lang, range_from, range_to, archived FROM ws_projects ORDER BY id";
    return database.prepare(sql).all().map((row) => ({
      id: Number(row["id"]),
      name: String(row["name"]),
      template: String(row["template"]),
      description: String(row["description"]),
      novelId: row["novel_id"] === null ? null : Number(row["novel_id"]),
      srcKind: row["src_kind"] === null ? null : String(row["src_kind"]),
      srcLang: row["src_lang"] === null ? null : String(row["src_lang"]),
      rangeFrom: row["range_from"] === null ? null : Number(row["range_from"]),
      rangeTo: row["range_to"] === null ? null : Number(row["range_to"]),
      archived: Number(row["archived"]) === 1,
    }));
  } finally {
    database.close();
  }
}

export function removeNovel(workspace: string, title: string): void {
  const database = new DatabaseSync(join(workspace, WORKSPACE_DB_FILE));
  try {
    database.exec("PRAGMA busy_timeout = 5000");
    const row = database.prepare("SELECT id FROM ws_novels WHERE title = ?").get(title);
    if (row === undefined) {
      throw new Error(`no novel titled ${title}`);
    }
    database.prepare("DELETE FROM ws_novel_chapters WHERE novel_id = ?").run(Number(row["id"]));
    database.prepare("DELETE FROM ws_novels WHERE id = ?").run(Number(row["id"]));
  } finally {
    database.close();
  }
}

function wrapFolderOpen(command: string): void {
  const scope = window as unknown as FolderOpenWindow;
  if (scope.__dreamyFolderOpens) {
    return;
  }
  const calls: unknown[] = [];
  scope.__dreamyFolderOpens = calls;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (target.hostname !== "ipc.localhost" || target.pathname !== `/${command}`) {
      return original(input, init);
    }
    calls.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
    const headers = { "Content-Type": "application/json", "Tauri-Response": "ok" };
    return Promise.resolve(new Response("null", { headers }));
  };
}

function readFolderOpens(): unknown[] {
  return (window as unknown as FolderOpenWindow).__dreamyFolderOpens ?? [];
}

export async function stubFolderOpen(page: Page): Promise<void> {
  await page.evaluate(wrapFolderOpen, FOLDER_OPEN_COMMAND);
}

export function folderOpens(page: Page): Promise<unknown[]> {
  return page.evaluate(readFolderOpens);
}
