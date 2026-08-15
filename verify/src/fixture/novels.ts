import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import type { Page } from "@playwright/test";
import { invoke } from "../app/ipc.ts";
import { prototypeNovelCorpus, prototypeNovelData, prototypeNovels } from "../paths.ts";
import { zip, type ZipEntry } from "./zip.ts";

const PACKAGE_EXTENSION = "dsnovel";
const WORKSPACE_DB_FILE = "workspace.dreamydb";
const SAMPLE_NOVEL = "NOV-0001";
const TRANSLATED = "draft";
const REVIEW = "review";
const ANALYZED = "done";
const STALE = "stale";

export interface ProtoNovel {
  readonly id: string;
  readonly pack: string | null;
  readonly title: string;
  readonly display?: string;
  readonly author: string;
  readonly lang: string;
  readonly desc: string;
  readonly updated: string;
  readonly coverFile?: string;
  readonly tags: readonly string[];
}

export interface NovelData {
  readonly novels: readonly ProtoNovel[];
  readonly translated: Readonly<Record<number, string>>;
  readonly analyzed: Readonly<Record<number, string>>;
}

interface NovelWindow {
  NV?: {
    state: {
      novels: ProtoNovel[];
      tr: { chapters: Record<string, { noSample?: boolean; paras: Record<string, { st: string }> }> };
      kb: { analyzed: Record<string, string>; items: { stale?: string; ev: { p: string }[] }[] };
    };
  };
}

interface Created {
  readonly id: number;
}

export interface SeededNovel {
  readonly proto: ProtoNovel;
  readonly id: number;
}

interface PackageManifest {
  readonly cover?: string;
  readonly chapters: readonly { readonly file: string }[];
}

export function packDirectory(pack: string): string {
  return join(prototypeNovels, pack);
}

async function entryOf(pack: string, name: string): Promise<ZipEntry> {
  return { name, data: await readFile(join(packDirectory(pack), name)) };
}

async function stageNovelPackage(pack: string, directory: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(packDirectory(pack), "manifest.json"), "utf8")) as PackageManifest;
  const names = ["manifest.json", ...(manifest.cover ? [manifest.cover] : []), ...manifest.chapters.map((chapter) => chapter.file)];
  const entries = await Promise.all(names.map((name) => entryOf(pack, name)));
  await mkdir(directory, { recursive: true });
  const target = join(directory, `${pack}.${PACKAGE_EXTENSION}`);
  await writeFile(target, zip(entries));
  return target;
}

export async function loadNovels(): Promise<NovelData> {
  const sandbox = { window: {} as NovelWindow };
  for (const path of [prototypeNovelCorpus, prototypeNovelData]) {
    runInNewContext(await readFile(path, "utf8"), sandbox, { filename: path });
  }
  const state = sandbox.window.NV?.state;
  if (!state) {
    throw new Error(`${prototypeNovelData} did not define window.NV`);
  }
  const stale = new Set(state.kb.items.filter((item) => item.stale).flatMap((item) => item.ev.map((evidence) => Number(evidence.p.split(".")[0]))));
  const analyzed: Record<number, string> = {};
  for (const [chapter, status] of Object.entries(state.kb.analyzed)) {
    if (status === ANALYZED) {
      analyzed[Number(chapter)] = stale.has(Number(chapter)) ? STALE : ANALYZED;
    }
  }
  const translated: Record<number, string> = {};
  for (const [chapter, entry] of Object.entries(state.tr.chapters)) {
    const reviewing = Object.values(entry.paras).some((para) => para.st === "review");
    translated[Number(chapter)] = reviewing ? REVIEW : TRANSLATED;
  }
  return { novels: state.novels, translated, analyzed };
}

function inputOf(novel: ProtoNovel): Record<string, unknown> {
  return { title: novel.title, name: novel.display ?? "", author: novel.author, lang: novel.lang, description: novel.desc, tags: novel.tags };
}

async function setCover(page: Page, id: number, file: string | undefined): Promise<void> {
  if (file === undefined) {
    return;
  }
  const data = (await readFile(join(prototypeNovels, file))).toString("base64");
  await invoke(page, "novel_cover_set", { id, dataUrl: `data:image/png;base64,${data}` });
}

async function seedNovel(page: Page, novel: ProtoNovel, staging: string): Promise<number> {
  const meta = inputOf(novel);
  try {
    if (novel.pack === null) {
      const created = await invoke<Created>(page, "novel_create", { input: meta });
      await setCover(page, created.id, novel.coverFile);
      return created.id;
    }
    const path = await stageNovelPackage(novel.pack, staging);
    return (await invoke<Created>(page, "novel_package_import", { path, meta })).id;
  } catch (error) {
    throw new Error(`cannot seed novel ${novel.title}: ${String(error)}`);
  }
}

export async function seedNovels(page: Page, data: NovelData, stagingRoot: string): Promise<SeededNovel[]> {
  const seeded: SeededNovel[] = [];
  // The prototype lists novels newest first and the app ids ascend with creation, so create them oldest first.
  for (const proto of [...data.novels].reverse()) {
    seeded.push({ proto, id: await seedNovel(page, proto, join(stagingRoot, "novel")) });
  }
  return seeded;
}

/** The prototype writes wall-clock times and the app shows stored UTC times in local time, so read the prototype time as local. */
function localTimestamp(local: string): string {
  const [date, time = "00:00"] = local.split(" ");
  return new Date(`${date}T${time}:00`).toISOString();
}

export function pinNovels(workspacePath: string, data: NovelData, seeded: readonly SeededNovel[]): void {
  const db = new DatabaseSync(join(workspacePath, WORKSPACE_DB_FILE));
  try {
    for (const entry of seeded) {
      const stamp = localTimestamp(entry.proto.updated);
      db.prepare("UPDATE ws_novels SET created_at = ?, updated_at = ? WHERE id = ?").run(stamp, stamp, entry.id);
      db.prepare("UPDATE ws_novel_chapters SET created_at = ?, updated_at = ? WHERE novel_id = ?").run(stamp, stamp, entry.id);
    }
    const sample = seeded.find((entry) => entry.proto.id === SAMPLE_NOVEL);
    if (sample) {
      pinProgress(db, sample.id, "translation_status", data.translated);
      pinProgress(db, sample.id, "analysis_status", data.analyzed);
    }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

function pinProgress(db: DatabaseSync, novelId: number, column: string, statuses: Readonly<Record<number, string>>): void {
  for (const [seq, status] of Object.entries(statuses)) {
    db.prepare(`UPDATE ws_novel_chapters SET ${column} = ? WHERE novel_id = ? AND seq = ?`).run(status, novelId, Number(seq));
  }
}
