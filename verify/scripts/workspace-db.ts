import { DatabaseSync } from "node:sqlite";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceMigrationsDir } from "./paths.ts";

export const WORKSPACE_DB_FILE = "workspace.dreamydb";

const FUTURE_VERSION = "99.0.0";

export interface MigrationScript {
  readonly version: string;
  readonly seq: number;
  readonly name: string;
  readonly key: string;
  readonly sql: string;
}

export interface SeedNovel {
  readonly title: string;
  readonly lang?: string;
  readonly author?: string;
}

export interface SeedOptions {
  readonly upTo?: string;
  readonly newer?: boolean;
  readonly novels?: readonly SeedNovel[];
}

function parseVersion(text: string): number[] {
  return text.split(".").map((part) => Number.parseInt(part, 10));
}

function compareScripts(left: MigrationScript, right: MigrationScript): number {
  const a = parseVersion(left.version);
  const b = parseVersion(right.version);
  for (let index = 0; index < a.length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.seq - right.seq;
}

function toScript(fileName: string, sql: string): MigrationScript {
  const stem = fileName.replace(/\.sql$/, "");
  const [head = "", name = ""] = stem.split("__");
  const [version = "", seq = ""] = head.split("_");
  return { version, seq: Number.parseInt(seq, 10), name, key: head, sql };
}

export async function migrationScripts(): Promise<MigrationScript[]> {
  const files = (await readdir(workspaceMigrationsDir)).filter((file) => file.endsWith(".sql"));
  const scripts: MigrationScript[] = [];
  for (const file of files) {
    scripts.push(toScript(file, await readFile(join(workspaceMigrationsDir, file), "utf8")));
  }
  return scripts.sort(compareScripts);
}

export async function migrationKeys(): Promise<string[]> {
  return (await migrationScripts()).map((script) => script.key);
}

function selectScripts(scripts: MigrationScript[], upTo: string | undefined): MigrationScript[] {
  if (upTo === undefined) {
    return scripts;
  }
  const last = scripts.findIndex((script) => script.key === upTo);
  if (last < 0) {
    throw new Error(`unknown migration ${upTo}`);
  }
  return scripts.slice(0, last + 1);
}

function applyScripts(database: DatabaseSync, scripts: MigrationScript[]): void {
  const appliedAt = new Date().toISOString();
  for (const script of scripts) {
    database.exec(script.sql);
    database
      .prepare("INSERT INTO sys_migration_history (version, seq, name, applied_at) VALUES (?, ?, ?, ?)")
      .run(script.version, script.seq, script.name, appliedAt);
  }
}

function insertNovels(database: DatabaseSync, novels: readonly SeedNovel[]): void {
  const insert = database.prepare(
    "INSERT INTO ws_novels (title, name, author, lang, description, origin, created_at, updated_at) VALUES (?, ?, ?, ?, '', 'created', ?, ?)",
  );
  const now = new Date().toISOString();
  for (const novel of novels) {
    insert.run(novel.title, novel.title, novel.author ?? "", novel.lang ?? "VI", now, now);
  }
}

function markNewer(database: DatabaseSync): void {
  database
    .prepare("INSERT INTO sys_migration_history (version, seq, name, applied_at) VALUES (?, 1, 'from_the_future', ?)")
    .run(FUTURE_VERSION, new Date().toISOString());
}

export async function seedWorkspace(folder: string, options: SeedOptions = {}): Promise<void> {
  await mkdir(folder, { recursive: true });
  const scripts = selectScripts(await migrationScripts(), options.upTo);
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  try {
    database.exec("BEGIN");
    applyScripts(database, scripts);
    insertNovels(database, options.novels ?? []);
    if (options.newer) {
      markNewer(database);
    }
    database.exec("COMMIT");
  } finally {
    database.close();
  }
}

export async function writeCorruptDatabase(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, WORKSPACE_DB_FILE), "this is not a sqlite database ".repeat(200));
}

export async function seedBlockedUpgrade(folder: string): Promise<void> {
  const keys = await migrationKeys();
  const blocking = (await migrationScripts()).find((script) => script.version !== "0.0.0");
  if (blocking === undefined) {
    throw new Error("no migration beyond the base schema to block");
  }
  const previous = keys[keys.indexOf(blocking.key) - 1];
  await seedWorkspace(folder, { upTo: previous, novels: [{ title: "Before Upgrade" }] });
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  try {
    database.exec(blocking.sql);
  } finally {
    database.close();
  }
}

export class WorkspaceDb {
  private constructor(private readonly database: DatabaseSync) {}

  static open(folder: string): WorkspaceDb {
    return new WorkspaceDb(new DatabaseSync(join(folder, WORKSPACE_DB_FILE), { readOnly: true }));
  }

  migrations(): string[] {
    const rows = this.database.prepare("SELECT version, seq FROM sys_migration_history").all();
    return rows
      .map((row) => `${String(row["version"])}_${String(row["seq"])}`)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  }

  tables(): string[] {
    const rows = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    return rows.map((row) => String(row["name"]));
  }

  novelTitles(): string[] {
    const rows = this.database.prepare("SELECT title FROM ws_novels ORDER BY id").all();
    return rows.map((row) => String(row["title"]));
  }

  close(): void {
    this.database.close();
  }
}

export async function readWorkspace<T>(folder: string, read: (db: WorkspaceDb) => T): Promise<T> {
  const db = WorkspaceDb.open(folder);
  try {
    return read(db);
  } finally {
    db.close();
  }
}
