import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';

import { expect } from '@playwright/test';

import type { Ui } from './fixtures.ts';
import { openFromSplash } from './flows.ts';
import type { PickerStub } from './picker.ts';
import type { Sandbox } from './sandbox.ts';
import { type SeedNovel, seedWorkspace } from './workspaces.ts';

export const WORKSPACE_NAME = 'library';

export function fraction(done: number, total: number): string {
  return `${done} /${total}`;
}

export async function openLibrary(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  novels: readonly SeedNovel[] = [],
): Promise<string> {
  const folder = sandbox.workspace(WORKSPACE_NAME);
  await seedWorkspace(folder, { novels });
  await openFromSplash(ui, picker, folder);
  return folder;
}

async function revealExplorer(ui: Ui): Promise<void> {
  if (!(await ui.main.explorer.management.isVisible())) {
    await ui.main.showNovels();
  }
  await expect(ui.main.explorer.management).toBeVisible();
}

export async function showNovelList(ui: Ui): Promise<void> {
  await revealExplorer(ui);
  await ui.main.explorer.management.click();
  await expect(ui.main.novels.root).toBeVisible();
}

export async function openChapters(ui: Ui, name: string): Promise<void> {
  await revealExplorer(ui);
  await expect(ui.main.explorer.novel(name)).toBeVisible();
  if (!(await ui.main.explorer.chapters(name).isVisible())) {
    await ui.main.explorer.novel(name).click();
  }
  await ui.main.explorer.chapters(name).click();
  await expect(ui.main.chapters.root).toBeVisible();
}

export async function openReader(ui: Ui, name: string, seq: number): Promise<void> {
  await openChapters(ui, name);
  await ui.main.chapters.rowAt(seq).click();
  await expect(ui.main.reader.root).toBeVisible();
}

export async function selectNovel(ui: Ui, name: string): Promise<void> {
  await ui.main.novels.card(name).click();
  await expect(ui.main.panel.root).toBeVisible();
}

export async function pickPackage(ui: Ui, picker: PickerStub, path: string): Promise<void> {
  await picker.queue('novel_package_pick', path);
  await ui.main.importDialog.pick.click();
}

export async function checkPackage(ui: Ui, picker: PickerStub, path: string): Promise<void> {
  await ui.main.novels.importButton.click();
  await expect(ui.main.importDialog.root).toBeVisible();
  await pickPackage(ui, picker, path);
  await ui.main.importDialog.check.click();
}

export async function previewPackage(ui: Ui, picker: PickerStub, path: string): Promise<void> {
  await checkPackage(ui, picker, path);
  await expect(ui.main.importDialog.resultOk).toBeVisible();
  await ui.main.importDialog.next.click();
  await expect(ui.main.importDialog.form).toBeVisible();
}

export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export interface PackageManifest {
  readonly formatVersion?: number;
  readonly title?: string;
  readonly name?: string;
  readonly author?: string;
  readonly lang?: string;
  readonly cover?: string;
  readonly chapters?: readonly { readonly file: string; readonly title: string }[];
}

export interface PackageChapter {
  readonly title: string;
  readonly text: string;
}

export interface PackageSpec {
  readonly title: string;
  readonly name?: string;
  readonly author?: string;
  readonly lang?: string;
  readonly chapters: readonly PackageChapter[];
  readonly cover?: Buffer;
}

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

export interface ReadPackage {
  readonly manifest: PackageManifest;
  readonly entries: ReadonlyMap<string, Buffer>;
  readonly names: readonly string[];
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const STORED = 0;
const DEFLATED = 8;

function localHeader(entry: ZipEntry, name: Buffer): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(STORED, 8);
  header.writeUInt32LE(crc32(entry.data), 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(name.length, 26);
  return header;
}

function centralHeader(entry: ZipEntry, name: Buffer, offset: number): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(STORED, 10);
  header.writeUInt32LE(crc32(entry.data), 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(offset, 42);
  return header;
}

function endRecord(count: number, size: number, offset: number): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(END_SIGNATURE, 0);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  return record;
}

export function zipBytes(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const local = Buffer.concat([localHeader(entry, name), name, entry.data]);
    centrals.push(Buffer.concat([centralHeader(entry, name, offset), name]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  return Buffer.concat([...locals, central, endRecord(entries.length, central.length, offset)]);
}

function chapterFile(index: number, count: number): string {
  const width = Math.max(3, String(count).length);
  return `chapters/${String(index + 1).padStart(width, '0')}.md`;
}

export function packageEntries(spec: PackageSpec): ZipEntry[] {
  const manifest: PackageManifest = {
    formatVersion: 1,
    title: spec.title,
    ...(spec.name === undefined ? {} : { name: spec.name }),
    ...(spec.author === undefined ? {} : { author: spec.author }),
    lang: spec.lang ?? 'en',
    ...(spec.cover === undefined ? {} : { cover: 'cover.png' }),
    chapters: spec.chapters.map((chapter, index) => ({
      file: chapterFile(index, spec.chapters.length),
      title: chapter.title,
    })),
  };
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
  ];
  if (spec.cover !== undefined) {
    entries.push({ name: 'cover.png', data: spec.cover });
  }
  for (const [index, chapter] of spec.chapters.entries()) {
    entries.push({
      name: chapterFile(index, spec.chapters.length),
      data: Buffer.from(chapter.text, 'utf8'),
    });
  }
  return entries;
}

export async function writeBytes(path: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function writePackage(path: string, spec: PackageSpec): Promise<void> {
  await writeBytes(path, zipBytes(packageEntries(spec)));
}

export async function writeRawPackage(
  path: string,
  manifest: PackageManifest,
  files: Readonly<Record<string, string>> = {},
): Promise<void> {
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) },
  ];
  for (const [name, text] of Object.entries(files)) {
    entries.push({ name, data: Buffer.from(text, 'utf8') });
  }
  await writeBytes(path, zipBytes(entries));
}

function findEnd(bytes: Buffer): number {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (bytes.readUInt32LE(index) === END_SIGNATURE) {
      return index;
    }
  }
  throw new Error('not a zip archive');
}

function entryData(bytes: Buffer, method: number, size: number, localOffset: number): Buffer {
  const nameLength = bytes.readUInt16LE(localOffset + 26);
  const extraLength = bytes.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const raw = bytes.subarray(start, start + size);
  if (method === DEFLATED) {
    return inflateRawSync(raw);
  }
  if (method === STORED) {
    return Buffer.from(raw);
  }
  throw new Error(`unsupported zip method ${method}`);
}

export async function readPackage(path: string): Promise<ReadPackage> {
  const bytes = await readFile(path);
  const end = findEnd(bytes);
  const count = bytes.readUInt16LE(end + 10);
  const entries = new Map<string, Buffer>();
  const names: string[] = [];
  let cursor = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    const method = bytes.readUInt16LE(cursor + 10);
    const size = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    entries.set(name, entryData(bytes, method, size, localOffset));
    names.push(name);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const manifest = JSON.parse(
    (entries.get('manifest.json') ?? Buffer.from('{}')).toString('utf8'),
  ) as PackageManifest;
  return { manifest, entries, names };
}

export function entryText(archive: ReadPackage, name: string): string {
  const data = archive.entries.get(name);
  if (data === undefined) {
    throw new Error(`the package has no entry ${name}`);
  }
  return data.toString('utf8');
}
