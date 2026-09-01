import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { workspaceMigrationsDir } from './paths.ts';

export const WORKSPACE_DB_FILE = 'workspace.dreamydb';

const FUTURE_VERSION = '99.0.0';

export interface MigrationScript {
  readonly version: string;
  readonly seq: number;
  readonly name: string;
  readonly key: string;
  readonly sql: string;
}

export interface SeedChapter {
  readonly title: string;
  readonly paragraphs?: readonly string[];
  readonly translated?: boolean;
  readonly analyzed?: boolean;
}

export interface SeedNovel {
  readonly title: string;
  readonly name?: string;
  readonly lang?: string;
  readonly author?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly chapters?: readonly SeedChapter[];
  readonly cover?: Buffer;
}

export interface NovelRecord {
  readonly id: number;
  readonly title: string;
  readonly name: string;
  readonly author: string;
  readonly lang: string;
  readonly description: string;
  readonly origin: string;
}

export interface ChapterRecord {
  readonly id: string;
  readonly seq: number;
  readonly title: string;
  readonly wordCount: number;
  readonly translationStatus: string;
  readonly analysisStatus: string;
}

export interface ChapterFile {
  readonly paragraphs: readonly { readonly text: string; readonly hashcheck: string }[];
}

interface PlacedChapter {
  readonly novelId: number;
  readonly id: string;
  readonly paragraphs: readonly string[];
}

export interface SeedOptions {
  readonly upTo?: string;
  readonly newer?: boolean;
  readonly novels?: readonly SeedNovel[];
}

function parseVersion(text: string): number[] {
  return text.split('.').map((part) => Number.parseInt(part, 10));
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
  const stem = fileName.replace(/\.sql$/, '');
  const [head = '', name = ''] = stem.split('__');
  const [version = '', seq = ''] = head.split('_');
  return { version, seq: Number.parseInt(seq, 10), name, key: head, sql };
}

export async function migrationScripts(): Promise<MigrationScript[]> {
  const files = (await readdir(workspaceMigrationsDir)).filter((file) => file.endsWith('.sql'));
  const scripts: MigrationScript[] = [];
  for (const file of files) {
    scripts.push(toScript(file, await readFile(join(workspaceMigrationsDir, file), 'utf8')));
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
      .prepare(
        'INSERT INTO sys_migration_history (version, seq, name, applied_at) VALUES (?, ?, ?, ?)',
      )
      .run(script.version, script.seq, script.name, appliedAt);
  }
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function chapterParagraphs(chapter: SeedChapter): readonly string[] {
  return chapter.paragraphs ?? [`${chapter.title} begins here.`, `${chapter.title} goes on.`];
}

function insertChapters(
  database: DatabaseSync,
  novelId: number,
  chapters: readonly SeedChapter[],
): PlacedChapter[] {
  if (chapters.length === 0) {
    return [];
  }
  const insert = database.prepare(
    'INSERT INTO ws_novel_chapters (id, novel_id, seq, title, word_count, translation_status, analysis_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const now = new Date().toISOString();
  const placed: PlacedChapter[] = [];
  for (const [index, chapter] of chapters.entries()) {
    const id = randomBytes(16).toString('hex');
    const paragraphs = chapterParagraphs(chapter);
    const words = countWords(paragraphs.join('\n'));
    const translation = chapter.translated ? 'done' : 'none';
    const analysis = chapter.analyzed ? 'done' : 'none';
    insert.run(id, novelId, index + 1, chapter.title, words, translation, analysis, now, now);
    placed.push({ novelId, id, paragraphs });
  }
  return placed;
}

function insertTags(database: DatabaseSync, novelId: number, tags: readonly string[]): void {
  if (tags.length === 0) {
    return;
  }
  const insert = database.prepare("INSERT INTO ws_tags (id, tag, type) VALUES (?, ?, 'novel')");
  for (const tag of tags) {
    insert.run(String(novelId), tag);
  }
}

function insertNovels(database: DatabaseSync, novels: readonly SeedNovel[]): PlacedChapter[] {
  const insert = database.prepare(
    "INSERT INTO ws_novels (title, name, author, lang, description, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'created', ?, ?)",
  );
  const now = new Date().toISOString();
  const placed: PlacedChapter[] = [];
  for (const novel of novels) {
    const result = insert.run(
      novel.title,
      novel.name ?? novel.title,
      novel.author ?? '',
      novel.lang ?? 'VI',
      novel.description ?? '',
      now,
      now,
    );
    const novelId = Number(result.lastInsertRowid);
    insertTags(database, novelId, novel.tags ?? []);
    placed.push(...insertChapters(database, novelId, novel.chapters ?? []));
  }
  return placed;
}

export function chapterFileName(chapterId: string): string {
  return `chapter_${chapterId}.json`;
}

export function novelDir(folder: string, novelId: number): string {
  return join(folder, 'novels', String(novelId));
}

async function writeChapterFiles(folder: string, placed: readonly PlacedChapter[]): Promise<void> {
  for (const chapter of placed) {
    const dir = novelDir(folder, chapter.novelId);
    await mkdir(dir, { recursive: true });
    const paragraphs = chapter.paragraphs.map((text) => ({
      text,
      hashcheck: createHash('sha256').update(text).digest('hex'),
    }));
    await writeFile(
      join(dir, chapterFileName(chapter.id)),
      JSON.stringify({ paragraphs }, null, 2),
    );
  }
}

async function writeCovers(folder: string, novels: readonly SeedNovel[]): Promise<void> {
  for (const [index, novel] of novels.entries()) {
    if (novel.cover) {
      const dir = novelDir(folder, index + 1);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'cover.png'), novel.cover);
    }
  }
}

function markNewer(database: DatabaseSync): void {
  database
    .prepare(
      "INSERT INTO sys_migration_history (version, seq, name, applied_at) VALUES (?, 1, 'from_the_future', ?)",
    )
    .run(FUTURE_VERSION, new Date().toISOString());
}

export async function seedWorkspace(folder: string, options: SeedOptions = {}): Promise<void> {
  await mkdir(folder, { recursive: true });
  const scripts = selectScripts(await migrationScripts(), options.upTo);
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  let placed: PlacedChapter[] = [];
  try {
    database.exec('BEGIN');
    applyScripts(database, scripts);
    placed = insertNovels(database, options.novels ?? []);
    if (options.newer) {
      markNewer(database);
    }
    database.exec('COMMIT');
  } finally {
    database.close();
  }
  await writeChapterFiles(folder, placed);
  await writeCovers(folder, options.novels ?? []);
}

export async function writeCorruptDatabase(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, WORKSPACE_DB_FILE), 'this is not a sqlite database '.repeat(200));
}

export async function seedBlockedUpgrade(folder: string): Promise<void> {
  const keys = await migrationKeys();
  const blocking = (await migrationScripts()).find((script) => script.version !== '0.0.0');
  if (blocking === undefined) {
    throw new Error('no migration beyond the base schema to block');
  }
  const previous = keys[keys.indexOf(blocking.key) - 1];
  await seedWorkspace(folder, { upTo: previous, novels: [{ title: 'Before Upgrade' }] });
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
    return new WorkspaceDb(
      new DatabaseSync(join(folder, WORKSPACE_DB_FILE), { readOnly: true, timeout: 5000 }),
    );
  }

  migrations(): string[] {
    const rows = this.database.prepare('SELECT version, seq FROM sys_migration_history').all();
    return rows
      .map((row) => `${String(row['version'])}_${String(row['seq'])}`)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  }

  tables(): string[] {
    const rows = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    return rows.map((row) => String(row['name']));
  }

  novelTitles(): string[] {
    const rows = this.database.prepare('SELECT title FROM ws_novels ORDER BY id').all();
    return rows.map((row) => String(row['title']));
  }

  novels(): NovelRecord[] {
    const rows = this.database
      .prepare(
        'SELECT id, title, name, author, lang, description, origin FROM ws_novels ORDER BY id',
      )
      .all();
    return rows.map((row) => ({
      id: Number(row['id']),
      title: String(row['title']),
      name: String(row['name']),
      author: String(row['author']),
      lang: String(row['lang']),
      description: String(row['description']),
      origin: String(row['origin']),
    }));
  }

  novelId(title: string): number {
    const row = this.database.prepare('SELECT id FROM ws_novels WHERE title = ?').get(title);
    if (row === undefined) {
      throw new Error(`no novel titled ${title}`);
    }
    return Number(row['id']);
  }

  tags(title: string): string[] {
    const rows = this.database
      .prepare("SELECT tag FROM ws_tags WHERE type = 'novel' AND id = ? ORDER BY tag")
      .all(String(this.novelId(title)));
    return rows.map((row) => String(row['tag']));
  }

  chapters(title: string): ChapterRecord[] {
    const sql =
      'SELECT id, seq, title, word_count, translation_status, analysis_status FROM ws_novel_chapters WHERE novel_id = ? ORDER BY seq';
    const rows = this.database.prepare(sql).all(this.novelId(title));
    return rows.map((row) => ({
      id: String(row['id']),
      seq: Number(row['seq']),
      title: String(row['title']),
      wordCount: Number(row['word_count']),
      translationStatus: String(row['translation_status']),
      analysisStatus: String(row['analysis_status']),
    }));
  }

  chapterCount(): number {
    const row = this.database.prepare('SELECT COUNT(*) AS total FROM ws_novel_chapters').get();
    return Number(row?.['total'] ?? 0);
  }

  close(): void {
    this.database.close();
  }
}

export async function readChapterFile(
  folder: string,
  novelId: number,
  chapterId: string,
): Promise<ChapterFile> {
  const text = await readFile(join(novelDir(folder, novelId), chapterFileName(chapterId)), 'utf8');
  return JSON.parse(text) as ChapterFile;
}

export async function readParagraphs(
  folder: string,
  novelId: number,
  chapterId: string,
): Promise<string[]> {
  const file = await readChapterFile(folder, novelId, chapterId);
  return file.paragraphs.map((paragraph) => paragraph.text);
}

export async function readWorkspace<T>(folder: string, read: (db: WorkspaceDb) => T): Promise<T> {
  const db = WorkspaceDb.open(folder);
  try {
    return read(db);
  } finally {
    db.close();
  }
}
