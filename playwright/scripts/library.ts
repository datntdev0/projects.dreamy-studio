import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { crc32, deflateSync } from 'node:zlib';

import { expect, type Locator, type Page } from '@playwright/test';

// prettier-ignore
import { CollectionsPage, type InfoKind, LibraryDeletionPage, LibraryInfoPanel, type LibrarySectionList, LibraryTagsPage, PreviewPages, PromptAuthoringPage, type SectionKind,UploadDialog } from '../pages/library.ts';
import type { Ui } from './fixtures.ts';
import { openFromSplash } from './flows.ts';
import { writeBytes } from './novels.ts';
import { appExecutable, repoRoot } from './paths.ts';
import type { PickerStub } from './picker.ts';
import type { Sandbox } from './sandbox.ts';
import { type SeedOptions, seedWorkspace, WORKSPACE_DB_FILE } from './workspaces.ts';

export const LIBRARY_WORKSPACE_NAME = 'library';

const DRAG_ENTER = 'tauri://drag-enter';
const DRAG_OVER = 'tauri://drag-over';
const DRAG_DROP = 'tauri://drag-drop';
const DRAG_LEAVE = 'tauri://drag-leave';
const DROP_POSITION = { x: 120, y: 160 };

const SECTION_KINDS: Readonly<Record<Exclude<LibrarySection, 'collections'>, SectionKind>> = {
  images: 'image',
  sounds: 'sound',
  videos: 'video',
  prompts: 'prompt',
};

export interface OpenedLibrary {
  readonly folder: string;
  readonly ids: SeededLibrary;
}

interface TauriInternals {
  invoke(command: string, args: unknown): Promise<unknown>;
}

interface TauriEmit {
  readonly event: string;
  readonly payload: unknown;
}

function emitTauriEvent(input: TauriEmit): Promise<unknown> {
  const internals = (window as unknown as { __TAURI_INTERNALS__: TauriInternals })
    .__TAURI_INTERNALS__;
  return internals.invoke('plugin:event|emit', { event: input.event, payload: input.payload });
}

export async function openLibraryView(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  seed: LibrarySeed = {},
  section?: LibrarySection,
  options: SeedOptions = {},
): Promise<OpenedLibrary> {
  const folder = sandbox.workspace(LIBRARY_WORKSPACE_NAME);
  const ids = await seedLibraryWorkspace(folder, seed, options);
  await openFromSplash(ui, picker, folder);
  await showLibrary(ui);
  if (section !== undefined) {
    await showLibrarySection(ui, section);
  }
  return { folder, ids };
}

export async function showLibrary(ui: Ui): Promise<void> {
  if (!(await ui.main.library.explorer.root.isVisible())) {
    await ui.main.library.rail.click();
  }
  await expect(ui.main.library.explorer.root).toBeVisible();
}

export async function showLibrarySection(ui: Ui, section: LibrarySection): Promise<void> {
  await showLibrary(ui);
  if (section === 'collections') {
    await ui.main.library.explorer.taxonomy.click();
    await expect(ui.main.library.taxonomy.root).toBeVisible();
    return;
  }
  const kind = SECTION_KINDS[section];
  await ui.main.library.explorer.row(kind).click();
  await expect(ui.main.library.section(kind).root).toBeVisible();
}

export async function showLibraryCollection(ui: Ui, id: number): Promise<void> {
  await showLibrary(ui);
  await ui.main.library.explorer.collection(id).click();
  await expect(ui.main.library.collection.root).toBeVisible();
}

export async function expectLibraryCounts(
  ui: Ui,
  counts: Readonly<Record<LibraryKind, number>>,
): Promise<void> {
  await showLibrary(ui);
  for (const kind of Object.keys(counts) as LibraryKind[]) {
    await expect(ui.main.library.explorer.count(kind)).toHaveText(String(counts[kind]));
  }
}

export async function queuePick(
  picker: PickerStub,
  kind: LibraryKind,
  paths: readonly string[],
): Promise<void> {
  await picker.queue(PICK_COMMANDS[kind], [...paths]);
}

export async function emitDrag(page: Page, event: string, payload: unknown): Promise<void> {
  await page.evaluate(emitTauriEvent, { event, payload });
}

export async function hoverFiles(ui: Ui, paths: readonly string[]): Promise<void> {
  const page = ui.main.library.page;
  await emitDrag(page, DRAG_ENTER, { paths, position: DROP_POSITION });
  await emitDrag(page, DRAG_OVER, { position: DROP_POSITION });
}

export async function leaveDrag(ui: Ui): Promise<void> {
  await emitDrag(ui.main.library.page, DRAG_LEAVE, null);
}

export async function dropFiles(ui: Ui, paths: readonly string[]): Promise<void> {
  const page = ui.main.library.page;
  await hoverFiles(ui, paths);
  await emitDrag(page, DRAG_DROP, { paths, position: DROP_POSITION });
}

export type UploadKind = 'image' | 'sound' | 'video';

export const UPLOAD_KINDS: readonly UploadKind[] = ['image', 'sound', 'video'];

export const UPLOAD_EXTENSIONS: Readonly<Record<UploadKind, string>> = {
  image: 'png',
  sound: 'wav',
  video: 'mp4',
};

export const UNSUPPORTED_NAMES: Readonly<Record<UploadKind, string>> = {
  image: 'photo.bmp',
  sound: 'voice.flac',
  video: 'movie.avi',
};

const SECTIONS: Readonly<Record<UploadKind, LibrarySection>> = {
  image: 'images',
  sound: 'sounds',
  video: 'videos',
};

export interface UploadForm {
  readonly rights: AssetRights;
  readonly tags?: string;
  readonly collection?: string;
  readonly newCollection?: string;
}

export interface AssetSummary {
  readonly id: number;
  readonly name: string;
  readonly rights: AssetRights;
  readonly origin: string;
  readonly collectionId: number | null;
  readonly tags: readonly string[];
  readonly updatedAt: string;
  readonly size: number;
}

export function uploadDialog(ui: Ui): UploadDialog {
  return new UploadDialog(ui.main.library.page);
}

export async function openUploadDialog(ui: Ui, kind: UploadKind): Promise<UploadDialog> {
  await showLibrarySection(ui, SECTIONS[kind]);
  await ui.main.library.section(kind).upload.click();
  const dialog = uploadDialog(ui);
  await expect(dialog.root).toBeVisible();
  return dialog;
}

export async function pickIntoDialog(
  ui: Ui,
  picker: PickerStub,
  kind: UploadKind,
  paths: readonly string[],
): Promise<void> {
  const dialog = uploadDialog(ui);
  await queuePick(picker, kind, paths);
  await dialog.pick.click();
}

export async function closeUploadDialog(ui: Ui): Promise<void> {
  const dialog = uploadDialog(ui);
  await dialog.cancel.click();
  await expect(dialog.root).toBeHidden();
}

export async function fillUploadForm(dialog: UploadDialog, form: UploadForm): Promise<void> {
  await dialog.rights.selectOption(form.rights);
  if (form.tags !== undefined) {
    await dialog.tags.fill(form.tags);
  }
  if (form.collection !== undefined) {
    await dialog.collection.selectOption({ label: form.collection });
  }
  if (form.newCollection !== undefined) {
    await dialog.newCollection.fill(form.newCollection);
  }
}

export async function stageCheapAsset(
  sandbox: Sandbox,
  kind: UploadKind,
  name: string,
): Promise<string> {
  if (kind === 'sound') {
    return stageSound(sandbox, name);
  }
  return kind === 'video' ? stageVideo(sandbox, name) : stageImage(sandbox, name);
}

export async function stageRealAsset(
  sandbox: Sandbox,
  kind: UploadKind,
  name: string,
): Promise<string> {
  const path = sandbox.file(name);
  if (kind === 'sound') {
    await writeSampleSound(path, 1);
    return path;
  }
  if (kind === 'video') {
    await writeSampleVideo(path, 1);
    return path;
  }
  return stageImage(sandbox, name);
}

export async function stageCorruptAsset(sandbox: Sandbox, name: string): Promise<string> {
  return stageFile(sandbox, name, 'this is not real media content, only a valid extension');
}

export async function stageEmptyAsset(sandbox: Sandbox, name: string): Promise<string> {
  return stageFile(sandbox, name, Buffer.alloc(0));
}

export async function stageSizedAsset(
  sandbox: Sandbox,
  kind: UploadKind,
  name: string,
  bytes: number,
): Promise<string> {
  if (kind === 'sound') {
    return stageSizedSound(sandbox, name, bytes);
  }
  return kind === 'video'
    ? stageSizedVideo(sandbox, name, bytes)
    : stageSizedImage(sandbox, name, bytes);
}

export function assetRows(db: LibraryDb, kind: UploadKind): AssetSummary[] {
  if (kind === 'sound') {
    return db.sounds();
  }
  return kind === 'video' ? db.videos() : db.images();
}

export function assetNames(db: LibraryDb, kind: UploadKind): string[] {
  return assetRows(db, kind).map((row) => row.name);
}

export function sectionOf(kind: UploadKind): LibrarySection {
  return SECTIONS[kind];
}

export const PROMPT_BYTES_LIMIT = 256 * 1024;

export interface PromptForm {
  readonly name?: string;
  readonly kind?: PromptKind;
  readonly text?: string;
  readonly rights?: AssetRights;
  readonly tags?: string;
  readonly collection?: number;
}

export interface PromptSnapshot {
  readonly counts: KindCounts;
  readonly prompts: readonly PromptRow[];
  readonly storedFiles: number;
}

export function authoring(ui: Ui): PromptAuthoringPage {
  return new PromptAuthoringPage(ui.main.library.page);
}

export async function openWriteDialog(ui: Ui): Promise<PromptAuthoringPage> {
  const page = authoring(ui);
  await page.write.click();
  await expect(page.dialog.panel).toBeVisible();
  await expect(page.dialog.name).toBeVisible();
  return page;
}

export async function openImportDialog(
  ui: Ui,
  picker: PickerStub,
  paths: readonly string[],
): Promise<PromptAuthoringPage> {
  const page = authoring(ui);
  await queuePick(picker, 'prompt', paths);
  await page.upload.click();
  await expect(page.dialog.panel).toBeVisible();
  await page.dialog.pick.click();
  await expect(page.dialog.queueRows).toHaveCount(paths.length);
  return page;
}

export async function fillPromptForm(page: PromptAuthoringPage, form: PromptForm): Promise<void> {
  const dialog = page.dialog;
  if (form.name !== undefined) {
    await dialog.name.fill(form.name);
  }
  if (form.kind !== undefined) {
    await dialog.kind.selectOption(form.kind);
  }
  if (form.text !== undefined) {
    await dialog.text.fill(form.text);
  }
  if (form.collection !== undefined) {
    await dialog.collection.selectOption(String(form.collection));
  }
  if (form.tags !== undefined) {
    await dialog.tags.fill(form.tags);
  }
  if (form.rights !== undefined) {
    await dialog.rights.selectOption(form.rights);
  }
}

export async function snapshotPrompts(folder: string): Promise<PromptSnapshot> {
  const state = await readLibrary(folder, (db) => ({ counts: db.counts(), prompts: db.prompts() }));
  return { ...state, storedFiles: await storedCount(folder, 'prompt') };
}

export async function readPrompt(
  folder: string,
  name: string,
): Promise<{ row: PromptRow; text: string }> {
  const row = await readLibrary(folder, (db) => db.prompt(name));
  return { row, text: await storedText(folder, row.id) };
}

export type SortKey = 'new' | 'name' | 'size';

export async function expectNames(
  list: LibrarySectionList,
  names: readonly string[],
): Promise<void> {
  await expect(list.cardNames).toHaveText([...names]);
}

export async function searchFor(list: LibrarySectionList, keyword: string): Promise<void> {
  await list.search.fill(keyword);
}

export async function sortBy(list: LibrarySectionList, key: SortKey): Promise<void> {
  await list.sort.selectOption(key);
}

export async function toggleFilterTag(ui: Ui, tag: string): Promise<void> {
  await ui.main.library.explorer.filterTag(tag).click();
}

export async function chooseFilterCollection(ui: Ui, id: number): Promise<void> {
  await ui.main.library.explorer.filterCollection.selectOption(String(id));
}

export async function expectTagPressed(ui: Ui, tags: readonly string[]): Promise<void> {
  for (const tag of tags) {
    await expect(ui.main.library.explorer.filterTag(tag)).toHaveAttribute('aria-pressed', 'true');
  }
}

export const RIGHTS_LICENSED = 'Licensed for use';
export const RIGHTS_FREE = 'Royalty-free (CC0, public domain)';
export const RIGHTS_OWN = 'I created or own it';
export const ORIGIN_APP = 'Created in app';
export const PLAY_LABEL = 'Play';
export const PAUSE_LABEL = 'Pause';
export const PROMPT_COPIED_TOAST = 'Prompt copied.';

export interface AudioState {
  readonly paused: boolean;
  readonly currentTime: number;
}

export function previewPages(ui: Ui): PreviewPages {
  return new PreviewPages(ui.main.library.page);
}

export async function openPreview(ui: Ui, kind: LibraryKind, name: string): Promise<void> {
  const library = ui.main.library;
  const target =
    kind === 'image'
      ? library.images.card(name)
      : kind === 'sound'
        ? library.sounds.card(name)
        : kind === 'video'
          ? library.videos.card(name)
          : library.prompts.card(name);
  await target.dblclick();
}

export async function closePreview(ui: Ui): Promise<void> {
  await ui.main.library.page.keyboard.press('Escape');
}

export async function sampleSoundBytes(
  sandbox: Sandbox,
  name: string,
  seconds: number,
): Promise<Buffer> {
  const path = sandbox.file(name);
  await writeSampleSound(path, seconds);
  return readFile(path);
}

export async function sampleVideoBytes(
  sandbox: Sandbox,
  name: string,
  seconds: number,
): Promise<Buffer> {
  const path = sandbox.file(name);
  await writeSampleVideo(path, seconds);
  return readFile(path);
}

function recordPlayedAudio(): void {
  const proto = HTMLMediaElement.prototype;
  const original = proto.play;
  proto.play = function (this: HTMLMediaElement): Promise<void> {
    (window as unknown as { __playedAudio: HTMLMediaElement }).__playedAudio = this;
    return original.call(this);
  };
}

function readPlayedAudio(): AudioState | null {
  const audio = (window as unknown as { __playedAudio?: HTMLMediaElement }).__playedAudio;
  return audio ? { paused: audio.paused, currentTime: audio.currentTime } : null;
}

export async function watchAudio(page: Page): Promise<void> {
  await page.evaluate(recordPlayedAudio);
}

export async function audioState(page: Page): Promise<AudioState | null> {
  return page.evaluate(readPlayedAudio);
}

export async function expectAudio(page: Page, paused: boolean): Promise<void> {
  await expect.poll(async () => (await audioState(page))?.paused).toBe(paused);
}

function readVideoState(): AudioState | null {
  const video = document.querySelector<HTMLVideoElement>(
    '[data-testid="library-video-preview-player"]',
  );
  return video ? { paused: video.paused, currentTime: video.currentTime } : null;
}

export async function videoState(page: Page): Promise<AudioState | null> {
  return page.evaluate(readVideoState);
}

async function readClipboardText(): Promise<string> {
  return navigator.clipboard.readText();
}

export async function clipboardText(page: Page): Promise<string> {
  return page.evaluate(readClipboardText);
}

export function normalizeLines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export function variableText(name: string): string {
  return name;
}

export function squash(text: string): string {
  return text.replace(/\s+/g, '');
}

export function withoutBraces(text: string): string {
  return text.replace(/[{}]/g, '');
}

export function infoPanel(ui: Ui, kind: InfoKind): LibraryInfoPanel {
  return new LibraryInfoPanel(ui.main.library.page, kind);
}

export async function selectAsset(ui: Ui, kind: InfoKind, name: string): Promise<LibraryInfoPanel> {
  await ui.main.library.section(kind).card(name).click();
  const panel = infoPanel(ui, kind);
  await expect(panel.root).toBeVisible();
  await expect(panel.name).toHaveValue(name);
  return panel;
}

type PerKind = Readonly<Record<LibraryKind, readonly string[]>>;

export interface DeletionTarget {
  readonly kind: LibraryKind;
  readonly name: string;
  readonly keep: string;
}

export interface LibrarySnapshot {
  readonly counts: KindCounts;
  readonly names: PerKind;
  readonly originals: PerKind;
  readonly derived: PerKind;
}

export const DELETION_TARGETS: readonly DeletionTarget[] = [
  { kind: 'image', name: 'harbor-dawn.png', keep: 'harbor-dusk.png' },
  { kind: 'sound', name: 'tide-loop.wav', keep: 'gull-calls.wav' },
  { kind: 'video', name: 'pier-walk.mp4', keep: 'lighthouse-spin.mp4' },
  { kind: 'prompt', name: 'Fog opening', keep: 'Storm opening' },
];

export const DELETION_SEED: LibrarySeed = {
  collections: [{ name: 'Harbor' }],
  images: [
    { name: 'harbor-dawn.png', collection: 'Harbor', tags: ['sea'] },
    { name: 'harbor-dusk.png', collection: 'Harbor' },
  ],
  sounds: [{ name: 'tide-loop.wav', tags: ['sea'] }, { name: 'gull-calls.wav' }],
  videos: [
    { name: 'pier-walk.mp4', poster: true },
    { name: 'lighthouse-spin.mp4', poster: true },
  ],
  prompts: [
    { name: 'Fog opening', text: 'Open on fog over the harbor.' },
    { name: 'Storm opening', text: 'Open on a storm at sea.' },
  ],
};

export const UNDONE_WARNING = 'This cannot be undone.';

export function deletedToast(target: DeletionTarget): string {
  if (target.kind === 'prompt') {
    return 'Prompt deleted.';
  }
  if (target.kind === 'video') {
    return `Deleted ${target.name}.`;
  }
  return `Deleted “${target.name}”.`;
}

export async function snapshotLibrary(folder: string): Promise<LibrarySnapshot> {
  const database = await readLibrary(folder, (db) => ({
    counts: db.counts(),
    names: {
      image: db.images().map((row) => row.name),
      sound: db.sounds().map((row) => row.name),
      video: db.videos().map((row) => row.name),
      prompt: db.prompts().map((row) => row.name),
    },
  }));
  const originals: Record<string, readonly string[]> = {};
  const derived: Record<string, readonly string[]> = {};
  for (const kind of LIBRARY_KINDS) {
    const files = await storedFiles(folder, kind);
    originals[kind] = files.originals;
    derived[kind] = files.derived;
  }
  return { ...database, originals: originals as PerKind, derived: derived as PerKind };
}

export async function openDeletionDialog(ui: Ui, kind: LibraryKind, name: string): Promise<void> {
  const library = ui.main.library;
  await library.explorer.row(kind).click();
  await expect(library.section(kind).root).toBeVisible();
  const card = library.section(kind).card(name);
  const classes = (await card.getAttribute('class')) ?? '';
  if (!classes.split(/\s+/).includes('is-selected')) {
    await card.click();
  }
  await new LibraryDeletionPage(library.page).deleteButton(kind).click();
  await expect(ui.main.confirm.panel).toBeVisible();
}

export async function expectDeletionDialog(ui: Ui, name: string): Promise<void> {
  await expect(ui.main.confirm.names).toHaveCount(1);
  await expect(ui.main.confirm.names).toHaveText(name);
  await expect(ui.main.confirm.warning).toContainText(UNDONE_WARNING);
}

export async function cancelDeletionDialog(ui: Ui): Promise<void> {
  await ui.main.confirm.cancel.click();
  await expect(ui.main.confirm.panel).toBeHidden();
}

export async function confirmDeletionDialog(ui: Ui): Promise<void> {
  await ui.main.confirm.accept.click();
  await expect(ui.main.confirm.panel).toBeHidden();
}

export interface OpenedCollections extends OpenedLibrary {
  readonly view: CollectionsPage;
}

interface ForcedValue {
  readonly value: string;
  readonly events: readonly string[];
}

function assignValue(element: HTMLInputElement | HTMLTextAreaElement, forced: ForcedValue): void {
  element.value = forced.value;
  for (const type of forced.events) {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  }
}

export async function openCollectionsView(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  seed: LibrarySeed,
): Promise<OpenedCollections> {
  const opened = await openLibraryView(ui, picker, sandbox, seed, 'collections');
  return { ...opened, view: new CollectionsPage(ui.main.library.page) };
}

export async function collectionsInDb(folder: string): Promise<CollectionRow[]> {
  return readLibrary(folder, (db) => db.collections());
}

export async function collectionNamesInDb(folder: string): Promise<string[]> {
  return (await collectionsInDb(folder)).map((row) => row.name);
}

export async function showCollections(ui: Ui): Promise<void> {
  await showLibrarySection(ui, 'collections');
}

export async function openCreateDialog(ui: Ui, view: CollectionsPage): Promise<void> {
  await ui.main.library.taxonomy.create.click();
  await expect(view.dialog.panel).toBeVisible();
}

export async function submitCollection(
  view: CollectionsPage,
  name: string,
  description: string,
): Promise<void> {
  await view.dialog.name.fill(name);
  await view.dialog.description.fill(description);
  await view.dialog.submit.click();
}

export async function forceValue(
  field: Locator,
  value: string,
  events: readonly string[],
): Promise<void> {
  await field.evaluate(assignValue, { value, events });
}

export async function selectCollectionRow(view: CollectionsPage, name: string): Promise<void> {
  await view.row(name).click();
  await expect(view.panel.root).toBeVisible();
  await expect(view.panel.name).toHaveValue(name);
}

export async function commitField(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Tab');
}

export async function expectRowCounts(
  view: CollectionsPage,
  name: string,
  counts: Readonly<Record<LibraryKind, number>>,
): Promise<void> {
  await expect(view.countsOf(view.row(name))).toHaveText(
    LIBRARY_KINDS.map((kind) => String(counts[kind])),
  );
}

export async function deleteSelectedCollection(ui: Ui, view: CollectionsPage): Promise<void> {
  await view.panel.remove.click();
  await expect(ui.main.confirm.panel).toBeVisible();
  await ui.main.confirm.accept.click();
  await expect(ui.main.confirm.panel).toBeHidden();
}

export interface OpenedTags extends OpenedLibrary {
  readonly tags: LibraryTagsPage;
}

export const TAG_SEED: LibrarySeed = {
  images: [
    { name: 'img-a.png', tags: ['forest', 'city'] },
    { name: 'img-b.png', tags: ['forest', 'ocean'] },
    { name: 'img-c.png', tags: ['city', 'forest-night'] },
  ],
  sounds: [{ name: 'snd-a.wav', tags: ['forest', 'city', 'ocean'] }],
  videos: [
    { name: 'vid-a.mp4', tags: ['forest', 'city'] },
    { name: 'vid-b.mp4', tags: ['forest-night'] },
  ],
  prompts: [
    { name: 'pr-a', tags: ['forest', 'ocean'] },
    { name: 'pr-b', tags: ['zen'] },
  ],
};

export async function openTags(ui: Ui, picker: PickerStub, sandbox: Sandbox): Promise<OpenedTags> {
  const opened = await openLibraryView(ui, picker, sandbox, TAG_SEED, 'collections');
  return { ...opened, tags: new LibraryTagsPage(ui.main.library.page) };
}

export async function selectTag(ui: Ui, tags: LibraryTagsPage, tag: string): Promise<void> {
  await showLibrarySection(ui, 'collections');
  await tags.row(tag).click();
  await expect(tags.panel.name).toHaveValue(tag);
}

export async function renameTagTo(tags: LibraryTagsPage, name: string): Promise<void> {
  await tags.panel.name.fill(name);
  await tags.panel.name.press('Enter');
}

export type LibraryKind = 'image' | 'sound' | 'video' | 'prompt';
export type AssetRights = 'own' | 'licensed' | 'free' | 'other';
export type PromptKind = 'image' | 'video' | 'voice' | 'general';
export type LibrarySection = 'images' | 'sounds' | 'videos' | 'prompts' | 'collections';

export const LIBRARY_KINDS: readonly LibraryKind[] = ['image', 'sound', 'video', 'prompt'];

export const KIND_DIRS: Readonly<Record<LibraryKind, string>> = {
  image: 'images',
  sound: 'sounds',
  video: 'videos',
  prompt: 'prompts',
};

export const KIND_TABLES: Readonly<Record<LibraryKind, string>> = {
  image: 'ws_library_images',
  sound: 'ws_library_sounds',
  video: 'ws_library_videos',
  prompt: 'ws_library_prompts',
};

export const KIND_TAG_TYPES: Readonly<Record<LibraryKind, string>> = {
  image: 'library_image',
  sound: 'library_sound',
  video: 'library_video',
  prompt: 'library_prompt',
};

export const PICK_COMMANDS: Readonly<Record<LibraryKind, string>> = {
  image: 'library_image_pick',
  sound: 'library_sound_pick',
  video: 'library_video_pick',
  prompt: 'library_prompt_pick',
};

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;
export const SOUND_EXTENSIONS = ['mp3', 'wav', 'aac'] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv'] as const;
export const PROMPT_EXTENSIONS = ['txt', 'md'] as const;

export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const SOUND_MAX_BYTES = 200 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const PROMPT_MAX_BYTES = 256 * 1024;
export const PROMPT_NAME_MAX = 120;
export const COLLECTION_NAME_MAX = 80;
export const COLLECTION_DESCRIPTION_MAX = 500;
export const MAX_TAGS = 12;
export const MAX_TAG_CHARS = 24;
export const IMAGE_MAX_PIXELS = 100_000_000;
export const PEAK_RATE = 12;

export function normalizeTag(raw: string): string {
  const lowered = raw.toLowerCase().replace(/[,#]/g, ' ');
  return lowered
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .join('-')
    .slice(0, MAX_TAG_CHARS);
}

export const MAX_BYTES: Readonly<Record<UploadKind, number>> = {
  image: IMAGE_MAX_BYTES,
  sound: SOUND_MAX_BYTES,
  video: VIDEO_MAX_BYTES,
};

const run = promisify(execFile);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_LOSSLESS_1X1 = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const WEBP_HEADER_OFFSET = 21;
const SPARSE_THRESHOLD = 64 * 1024 * 1024;
const MP3_FRAME_BYTES = 417;
const MP3_FRAME_SAMPLES = 1152;
const MP3_SAMPLE_RATE = 44100;
const AAC_FRAME_SAMPLES = 1024;
const AAC_SAMPLE_RATE = 44100;
const AAC_FRAME = [0xff, 0xf1, 0x50, 0x40, 0x01, 0x7f, 0xfc, 0x00, 0x00, 0x00, 0x07];

export interface PngSpec {
  readonly width?: number;
  readonly height?: number;
  readonly rgb?: readonly [number, number, number];
}

export interface GraySpec {
  readonly width?: number;
  readonly height?: number;
  readonly gray?: number;
}

export interface WavSpec {
  readonly durationMs?: number;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly amplitude?: number;
  readonly hz?: number;
}

export interface DurationSpec {
  readonly durationMs?: number;
  readonly channels?: number;
}

export type VideoFormatName = 'mp4' | 'mov' | 'webm' | 'mkv';

export interface VideoSpec {
  readonly format?: VideoFormatName;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly fps?: number;
}

export type SizedImageExt = 'png' | 'jpg' | 'gif' | 'webp';

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(data, crc32(name)), 0);
  return Buffer.concat([head, name, data, tail]);
}

function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return chunk('IHDR', header);
}

export function pngBytes(spec: PngSpec = {}): Buffer {
  const width = spec.width ?? 1;
  const height = spec.height ?? 1;
  const [red, green, blue] = spec.rgb ?? [70, 120, 200];
  const row = Buffer.alloc(1 + width * 3);
  for (let column = 0; column < width; column += 1) {
    row[1 + column * 3] = red;
    row[2 + column * 3] = green;
    row[3 + column * 3] = blue;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    PNG_SIGNATURE,
    pngHeader(width, height),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function pngHeaderOnlyBytes(width: number, height: number): Buffer {
  return Buffer.concat([PNG_SIGNATURE, pngHeader(width, height), chunk('IEND', Buffer.alloc(0))]);
}

class BitWriter {
  private readonly bytes: number[] = [];
  private bits = 0;
  private count = 0;

  write(value: number, length: number): void {
    for (let shift = length - 1; shift >= 0; shift -= 1) {
      this.bits = (this.bits << 1) | ((value >> shift) & 1);
      this.count += 1;
      if (this.count === 8) {
        this.flushByte();
      }
    }
  }

  finish(): Buffer {
    while (this.count !== 0) {
      this.write(1, 1);
    }
    return Buffer.from(this.bytes);
  }

  private flushByte(): void {
    this.bytes.push(this.bits);
    if (this.bits === 0xff) {
      this.bytes.push(0);
    }
    this.bits = 0;
    this.count = 0;
  }
}

const JPEG_DC_CODES: readonly (readonly [number, number])[] = [
  [0b00, 2],
  [0b010, 3],
  [0b011, 3],
  [0b100, 3],
  [0b101, 3],
  [0b110, 3],
  [0b1110, 4],
  [0b11110, 5],
];
const JPEG_DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const JPEG_DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const JPEG_AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
const JPEG_AC_HEAD = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a,
];
const JPEG_AC_RANGES: readonly (readonly [number, number])[] = [
  [0x34, 0x3a],
  [0x43, 0x4a],
  [0x53, 0x5a],
  [0x63, 0x6a],
  [0x73, 0x7a],
  [0x83, 0x8a],
  [0x92, 0x9a],
  [0xa2, 0xaa],
  [0xb2, 0xba],
  [0xc2, 0xca],
  [0xd2, 0xda],
  [0xe1, 0xea],
  [0xf1, 0xfa],
];

function jpegAcValues(): number[] {
  const values = [...JPEG_AC_HEAD];
  for (const [from, to] of JPEG_AC_RANGES) {
    for (let value = from; value <= to; value += 1) {
      values.push(value);
    }
  }
  return values;
}

const JPEG_AC_VALUES = jpegAcValues();

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

function jpegTable(
  kind: number,
  bits: readonly number[],
  values: Buffer | readonly number[],
): Buffer {
  return jpegSegment(0xc4, Buffer.concat([Buffer.from([kind, ...bits]), Buffer.from(values)]));
}

function jpegScan(blocks: number, diff: number): Buffer {
  const writer = new BitWriter();
  const magnitude = Math.abs(diff);
  const category = magnitude === 0 ? 0 : Math.floor(Math.log2(magnitude)) + 1;
  const [code, length] = JPEG_DC_CODES[category] ?? [0b00, 2];
  for (let block = 0; block < blocks; block += 1) {
    if (block === 0) {
      writer.write(code, length);
      writer.write(diff < 0 ? (diff - 1) & ((1 << category) - 1) : diff, category);
    } else {
      writer.write(0b00, 2);
    }
    writer.write(0b1010, 4);
  }
  return writer.finish();
}

export function jpegBytes(spec: GraySpec = {}): Buffer {
  const width = spec.width ?? 1;
  const height = spec.height ?? 1;
  const gray = Math.min(255, Math.max(1, spec.gray ?? 128));
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  const frame = Buffer.alloc(9);
  frame[0] = 8;
  frame.writeUInt16BE(height, 1);
  frame.writeUInt16BE(width, 3);
  frame[5] = 1;
  frame[6] = 1;
  frame[7] = 0x11;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 8)])),
    jpegSegment(0xc0, frame),
    jpegTable(0x00, JPEG_DC_BITS, JPEG_DC_VALUES),
    jpegTable(0x10, JPEG_AC_BITS, JPEG_AC_VALUES),
    jpegSegment(0xda, Buffer.from([1, 1, 0x00, 0, 63, 0])),
    jpegScan(blocks, gray - 128),
    Buffer.from([0xff, 0xd9]),
  ]);
}

class LzwWriter {
  private readonly bytes: number[] = [];
  private bits = 0;
  private count = 0;

  write(code: number, size: number): void {
    this.bits |= code << this.count;
    this.count += size;
    while (this.count >= 8) {
      this.bytes.push(this.bits & 0xff);
      this.bits >>= 8;
      this.count -= 8;
    }
  }

  finish(): Buffer {
    if (this.count > 0) {
      this.bytes.push(this.bits & 0xff);
    }
    return Buffer.from(this.bytes);
  }
}

function lzwGif(pixels: Uint8Array, minCodeSize: number): Buffer {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const writer = new LzwWriter();
  let size = minCodeSize + 1;
  let next = end + 1;
  let table = new Map<number, number>();
  writer.write(clear, size);
  let current = pixels[0] ?? 0;
  for (let index = 1; index < pixels.length; index += 1) {
    const value = pixels[index] ?? 0;
    const key = (current << 8) | value;
    const found = table.get(key);
    if (found !== undefined) {
      current = found;
      continue;
    }
    writer.write(current, size);
    if (next === 4096) {
      writer.write(clear, size);
      next = end + 1;
      size = minCodeSize + 1;
      table = new Map();
    } else {
      if (next >= 1 << size) {
        size += 1;
      }
      table.set(key, next);
      next += 1;
    }
    current = value;
  }
  writer.write(current, size);
  writer.write(end, size);
  return writer.finish();
}

function gifBlocks(data: Buffer): Buffer {
  const parts: Buffer[] = [];
  for (let offset = 0; offset < data.length; offset += 255) {
    const part = data.subarray(offset, offset + 255);
    parts.push(Buffer.from([part.length]), part);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

export function gifBytes(spec: PngSpec = {}): Buffer {
  const width = spec.width ?? 1;
  const height = spec.height ?? 1;
  const [red, green, blue] = spec.rgb ?? [70, 120, 200];
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  screen[4] = 0x80;
  const descriptor = Buffer.alloc(10);
  descriptor[0] = 0x2c;
  descriptor.writeUInt16LE(width, 5);
  descriptor.writeUInt16LE(height, 7);
  return Buffer.concat([
    Buffer.from('GIF89a', 'ascii'),
    screen,
    Buffer.from([red, green, blue, 255, 255, 255]),
    descriptor,
    Buffer.from([2]),
    gifBlocks(lzwGif(new Uint8Array(width * height), 2)),
    Buffer.from([0x3b]),
  ]);
}

export function webpBytes(
  spec: { readonly width?: number; readonly height?: number } = {},
): Buffer {
  const bytes = Buffer.from(WEBP_LOSSLESS_1X1);
  const width = spec.width ?? 1;
  const height = spec.height ?? 1;
  bytes.writeUInt32LE(((width - 1) | ((height - 1) << 14) | (1 << 28)) >>> 0, WEBP_HEADER_OFFSET);
  return bytes;
}

export function imageBytes(ext: string, spec: PngSpec = {}): Buffer {
  const kind = ext.toLowerCase();
  if (kind === 'jpg' || kind === 'jpeg') {
    return jpegBytes(spec);
  }
  if (kind === 'gif') {
    return gifBytes(spec);
  }
  if (kind === 'webp') {
    return webpBytes(spec);
  }
  return pngBytes(spec);
}

function padPng(bytes: Buffer, total: number): Buffer {
  const end = bytes.length - 12;
  return Buffer.concat([
    bytes.subarray(0, end),
    chunk('dsPd', Buffer.alloc(total - bytes.length - 12)),
    bytes.subarray(end),
  ]);
}

function padJpeg(bytes: Buffer, total: number): Buffer {
  const parts: Buffer[] = [bytes.subarray(0, 2)];
  let remaining = total - bytes.length;
  while (remaining > 0) {
    let size = Math.min(remaining, 65537);
    if (remaining - size > 0 && remaining - size < 4) {
      size -= 4;
    }
    parts.push(jpegSegment(0xfe, Buffer.alloc(size - 4)));
    remaining -= size;
  }
  parts.push(bytes.subarray(2));
  return Buffer.concat(parts);
}

function gifCommentBlocks(room: number): Buffer[] {
  const blocks: Buffer[] = [];
  let remaining = room;
  while (remaining > 0) {
    let take = Math.min(remaining, 256);
    if (remaining - take === 1) {
      take -= 1;
    }
    blocks.push(Buffer.concat([Buffer.from([take - 1]), Buffer.alloc(take - 1)]));
    remaining -= take;
  }
  return blocks;
}

function padGif(bytes: Buffer, total: number): Buffer {
  const end = bytes.length - 1;
  const comment = Buffer.concat([
    Buffer.from([0x21, 0xfe]),
    ...gifCommentBlocks(total - bytes.length - 3),
    Buffer.from([0]),
  ]);
  return Buffer.concat([bytes.subarray(0, end), comment, bytes.subarray(end)]);
}

function padWebp(bytes: Buffer, total: number): Buffer {
  const space = total - bytes.length - 8;
  const size = space % 2 === 0 ? space : space - 1;
  const head = Buffer.alloc(8);
  head.write('JUNK', 0, 'ascii');
  head.writeUInt32LE(size, 4);
  const padded = Buffer.concat([bytes, head, Buffer.alloc(space)]);
  padded.writeUInt32LE(padded.length - 8, 4);
  return padded;
}

export function imageOfSize(ext: SizedImageExt, total: number, spec: PngSpec = {}): Buffer {
  const base = imageBytes(ext, spec);
  if (total < base.length + 16) {
    throw new Error(`an ${ext} image needs at least ${base.length + 16} bytes`);
  }
  if (ext === 'jpg') {
    return padJpeg(base, total);
  }
  if (ext === 'gif') {
    return padGif(base, total);
  }
  return ext === 'webp' ? padWebp(base, total) : padPng(base, total);
}

export function wavBytes(spec: WavSpec = {}): Buffer {
  const sampleRate = spec.sampleRate ?? 8000;
  const channels = spec.channels ?? 1;
  const frames = Math.round(((spec.durationMs ?? 1000) * sampleRate) / 1000);
  const amplitude = Math.round((spec.amplitude ?? 0.5) * 32767);
  const hz = spec.hz ?? 440;
  const data = Buffer.alloc(frames * channels * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * hz * frame) / sampleRate) * amplitude);
    for (let channel = 0; channel < channels; channel += 1) {
      data.writeInt16LE(sample, (frame * channels + channel) * 2);
    }
  }
  return Buffer.concat([wavHeader(sampleRate, channels, data.length), data]);
}

function wavHeader(sampleRate: number, channels: number, dataLength: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataLength, 40);
  return header;
}

export function mp3Bytes(spec: DurationSpec = {}): Buffer {
  const frames = Math.max(
    1,
    Math.ceil(((spec.durationMs ?? 1000) * MP3_SAMPLE_RATE) / 1000 / MP3_FRAME_SAMPLES),
  );
  const frame = Buffer.alloc(MP3_FRAME_BYTES);
  frame.set([0xff, 0xfb, 0x90, (spec.channels ?? 2) === 1 ? 0xc0 : 0x00]);
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

export function aacBytes(spec: DurationSpec = {}): Buffer {
  const frames = Math.max(
    1,
    Math.ceil(((spec.durationMs ?? 1000) * AAC_SAMPLE_RATE) / 1000 / AAC_FRAME_SAMPLES),
  );
  return Buffer.concat(Array.from({ length: frames }, () => Buffer.from(AAC_FRAME)));
}

export function soundBytes(ext: string, spec: WavSpec = {}): Buffer {
  const kind = ext.toLowerCase();
  if (kind === 'mp3') {
    return mp3Bytes(spec);
  }
  return kind === 'aac' ? aacBytes(spec) : wavBytes(spec);
}

function isoBox(kind: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length + 8, 0);
  head.write(kind, 4, 'ascii');
  return Buffer.concat([head, payload]);
}

function isoHeaders(spec: Required<Omit<VideoSpec, 'format'>>): Buffer {
  const mvhd = Buffer.alloc(20);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(spec.durationMs, 16);
  const tkhd = Buffer.alloc(84);
  tkhd.writeInt32BE(0x00010000, 40);
  tkhd.writeInt32BE(0x00010000, 56);
  tkhd.writeUInt32BE(spec.width * 65536, 76);
  tkhd.writeUInt32BE(spec.height * 65536, 80);
  const hdlr = Buffer.alloc(12);
  hdlr.write('vide', 8, 'ascii');
  const mdhd = Buffer.alloc(20);
  mdhd.writeUInt32BE(1000, 12);
  mdhd.writeUInt32BE(spec.durationMs, 16);
  const stts = Buffer.alloc(16);
  stts.writeUInt32BE(1, 4);
  stts.writeUInt32BE(Math.max(1, Math.round((spec.fps * spec.durationMs) / 1000)), 8);
  stts.writeUInt32BE(1, 12);
  const minf = isoBox('minf', isoBox('stbl', isoBox('stts', stts)));
  const mdia = isoBox('mdia', Buffer.concat([isoBox('hdlr', hdlr), isoBox('mdhd', mdhd), minf]));
  const track = isoBox('trak', Buffer.concat([isoBox('tkhd', tkhd), mdia]));
  const ftyp = isoBox('ftyp', Buffer.from('isom', 'ascii'));
  return Buffer.concat([ftyp, isoBox('moov', Buffer.concat([isoBox('mvhd', mvhd), track]))]);
}

function ebml(id: readonly number[], payload: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(0x10000000 + payload.length, 0);
  return Buffer.concat([Buffer.from(id), size, payload]);
}

function ebmlUint(id: readonly number[], value: number): Buffer {
  const payload = Buffer.alloc(4);
  payload.writeUInt32BE(value, 0);
  return ebml(id, payload);
}

function ebmlHeaders(spec: Required<Omit<VideoSpec, 'format'>>, cluster: boolean): Buffer {
  const duration = Buffer.alloc(8);
  duration.writeDoubleBE(spec.durationMs, 0);
  const info = Buffer.concat([
    ebmlUint([0x2a, 0xd7, 0xb1], 1_000_000),
    ebml([0x44, 0x89], duration),
  ]);
  const video = Buffer.concat([ebmlUint([0xb0], spec.width), ebmlUint([0xba], spec.height)]);
  const track = Buffer.concat([
    ebmlUint([0x83], 1),
    ebml([0xe0], video),
    ebmlUint([0x23, 0xe3, 0x83], Math.round(1_000_000_000 / spec.fps)),
  ]);
  const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], track));
  const open = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const tail = cluster
    ? Buffer.concat([Buffer.from([0x1f, 0x43, 0xb6, 0x75]), open])
    : Buffer.alloc(0);
  const segment = Buffer.concat([ebml([0x15, 0x49, 0xa9, 0x66], info), tracks, tail]);
  const size = cluster ? open : Buffer.from([0x10, 0, 0, 0]);
  if (!cluster) {
    size.writeUInt32BE(0x10000000 + segment.length, 0);
  }
  return Buffer.concat([
    ebml([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(0)),
    Buffer.from([0x18, 0x53, 0x80, 0x67]),
    size,
    segment,
  ]);
}

function videoSpec(spec: VideoSpec): Required<Omit<VideoSpec, 'format'>> {
  return {
    width: spec.width ?? 1280,
    height: spec.height ?? 720,
    durationMs: spec.durationMs ?? 2000,
    fps: spec.fps ?? 30,
  };
}

export function videoBytes(spec: VideoSpec = {}): Buffer {
  const full = videoSpec(spec);
  const format = spec.format ?? 'mp4';
  return format === 'webm' || format === 'mkv' ? ebmlHeaders(full, false) : isoHeaders(full);
}

export function videoHeadForSize(spec: VideoSpec, total: number): Buffer {
  const full = videoSpec(spec);
  const format = spec.format ?? 'mp4';
  if (format === 'webm' || format === 'mkv') {
    return ebmlHeaders(full, true);
  }
  const headers = isoHeaders(full);
  const mdat = Buffer.alloc(8);
  mdat.writeUInt32BE(total - headers.length, 0);
  mdat.write('mdat', 4, 'ascii');
  return Buffer.concat([headers, mdat]);
}

export function wavHeadForSize(total: number, spec: WavSpec = {}): Buffer {
  return wavHeader(spec.sampleRate ?? 8000, spec.channels ?? 1, total - 44);
}

async function markSparse(path: string): Promise<void> {
  try {
    await run('fsutil', ['sparse', 'setflag', path]);
  } catch {
    return;
  }
}

export async function writeSizedFile(
  path: string,
  total: number,
  head: Buffer = Buffer.alloc(0),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, head);
  if (total > SPARSE_THRESHOLD) {
    await markSparse(path);
  }
  const handle = await open(path, 'r+');
  try {
    await handle.truncate(total);
  } finally {
    await handle.close();
  }
}

export function mediaExtension(name: string): string {
  return extname(name).replace(/^\./, '').toLowerCase();
}

function ffmpegExecutable(): string {
  const beside = join(dirname(appExecutable()), 'ffmpeg.exe');
  const bundled = join(repoRoot, 'desktop', 'binaries', 'ffmpeg-x86_64-pc-windows-msvc.exe');
  return [beside, bundled].find((candidate) => existsSync(candidate)) ?? beside;
}

async function ffmpeg(args: readonly string[]): Promise<void> {
  await run(ffmpegExecutable(), ['-v', 'error', '-y', ...args], { windowsHide: true });
}

export async function writeSampleVideo(path: string, seconds = 1, size = '320x180'): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const codec =
    mediaExtension(path) === 'webm'
      ? ['-c:v', 'libvpx']
      : ['-c:v', 'libopenh264', '-pix_fmt', 'yuv420p'];
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=${size}:rate=10:duration=${seconds}`,
    ...codec,
    path,
  ]);
}

export async function writeSampleSound(path: string, seconds = 1): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const extension = mediaExtension(path);
  const codec =
    extension === 'aac'
      ? ['-c:a', 'aac', '-f', 'adts']
      : extension === 'mp3'
        ? ['-c:a', 'libmp3lame']
        : [];
  await ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, ...codec, path]);
}

const VIDEO_FORMATS: readonly string[] = ['mp4', 'mov', 'webm', 'mkv'];

function videoFormatOf(name: string): VideoFormatName {
  const extension = mediaExtension(name);
  return VIDEO_FORMATS.includes(extension) ? (extension as VideoFormatName) : 'mp4';
}

function sizedImageExt(name: string): SizedImageExt {
  const extension = mediaExtension(name);
  return extension === 'jpeg' ? 'jpg' : (extension as SizedImageExt);
}

export async function stageFile(
  sandbox: Sandbox,
  name: string,
  data: Buffer | string,
): Promise<string> {
  const path = sandbox.file(name);
  await writeBytes(path, Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'));
  return path;
}

export async function stageImage(
  sandbox: Sandbox,
  name: string,
  spec: PngSpec = {},
): Promise<string> {
  return stageFile(sandbox, name, imageBytes(mediaExtension(name), spec));
}

export async function stageSound(
  sandbox: Sandbox,
  name: string,
  spec: WavSpec = {},
): Promise<string> {
  return stageFile(sandbox, name, soundBytes(mediaExtension(name), spec));
}

export async function stageVideo(
  sandbox: Sandbox,
  name: string,
  spec: Omit<VideoSpec, 'format'> = {},
): Promise<string> {
  return stageFile(sandbox, name, videoBytes({ ...spec, format: videoFormatOf(name) }));
}

export async function stagePrompt(sandbox: Sandbox, name: string, text: string): Promise<string> {
  return stageFile(sandbox, name, text);
}

export async function stageSizedFile(
  sandbox: Sandbox,
  name: string,
  bytes: number,
): Promise<string> {
  const path = sandbox.file(name);
  await writeSizedFile(path, bytes);
  return path;
}

export async function stageSizedImage(
  sandbox: Sandbox,
  name: string,
  bytes: number,
  spec: PngSpec = {},
): Promise<string> {
  return stageFile(sandbox, name, imageOfSize(sizedImageExt(name), bytes, spec));
}

export async function stageSizedSound(
  sandbox: Sandbox,
  name: string,
  bytes: number,
  spec: WavSpec = {},
): Promise<string> {
  const path = sandbox.file(name);
  await writeSizedFile(path, bytes, wavHeadForSize(bytes, spec));
  return path;
}

export async function stageSizedVideo(
  sandbox: Sandbox,
  name: string,
  bytes: number,
  spec: Omit<VideoSpec, 'format'> = {},
): Promise<string> {
  const path = sandbox.file(name);
  await writeSizedFile(
    path,
    bytes,
    videoHeadForSize({ ...spec, format: videoFormatOf(name) }, bytes),
  );
  return path;
}

const BASE_TIME = Date.UTC(2026, 0, 1);
const OVERVIEW_SIZE = 32;

export interface SeedAssetBase {
  readonly name: string;
  readonly rights?: AssetRights;
  readonly origin?: string;
  readonly collection?: string;
  readonly tags?: readonly string[];
  readonly createdAt?: string;
}

export interface SeedImage extends SeedAssetBase {
  readonly ext?: string;
  readonly width?: number;
  readonly height?: number;
  readonly bytes?: Buffer;
  readonly size?: number;
}

export interface SeedSound extends SeedAssetBase {
  readonly ext?: string;
  readonly durationMs?: number;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly bytes?: Buffer;
  readonly size?: number;
  readonly peakLevel?: number;
}

export interface SeedVideo extends SeedAssetBase {
  readonly ext?: string;
  readonly durationMs?: number;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number | null;
  readonly bytes?: Buffer;
  readonly size?: number;
  readonly poster?: boolean;
}

export interface SeedPrompt extends SeedAssetBase {
  readonly kind?: PromptKind;
  readonly text?: string;
}

export interface SeedCollection {
  readonly name: string;
  readonly description?: string;
}

export interface LibrarySeed {
  readonly collections?: readonly SeedCollection[];
  readonly images?: readonly SeedImage[];
  readonly sounds?: readonly SeedSound[];
  readonly videos?: readonly SeedVideo[];
  readonly prompts?: readonly SeedPrompt[];
}

export interface SeededLibrary {
  readonly collections: Readonly<Record<string, number>>;
  readonly images: Readonly<Record<string, number>>;
  readonly sounds: Readonly<Record<string, number>>;
  readonly videos: Readonly<Record<string, number>>;
  readonly prompts: Readonly<Record<string, number>>;
}

interface PendingFile {
  readonly path: string;
  readonly data: Buffer | string;
}

class Seeder {
  readonly collections: Record<string, number> = {};
  readonly images: Record<string, number> = {};
  readonly sounds: Record<string, number> = {};
  readonly videos: Record<string, number> = {};
  readonly prompts: Record<string, number> = {};
  readonly files: PendingFile[] = [];
  private clock = 0;

  constructor(
    private readonly database: DatabaseSync,
    private readonly folder: string,
  ) {}

  stamp(explicit: string | undefined): string {
    this.clock += 1;
    return explicit ?? new Date(BASE_TIME + this.clock * 1000).toISOString();
  }

  collectionId(name: string | undefined): number | null {
    if (name === undefined) {
      return null;
    }
    const id = this.collections[name];
    if (id === undefined) {
      throw new Error(`seed references an unknown collection ${name}`);
    }
    return id;
  }

  addCollection(collection: SeedCollection): void {
    const now = this.stamp(undefined);
    const result = this.database
      .prepare(
        'INSERT INTO ws_library_collections (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)',
      )
      .run(collection.name, collection.description ?? '', now, now);
    this.collections[collection.name] = Number(result.lastInsertRowid);
  }

  addTags(kind: LibraryKind, id: number, tags: readonly string[] | undefined): void {
    const insert = this.database.prepare(
      'INSERT OR IGNORE INTO ws_tags (id, tag, type) VALUES (?, ?, ?)',
    );
    for (const raw of tags ?? []) {
      const tag = normalizeTag(raw);
      if (tag.length > 0) {
        insert.run(String(id), tag, KIND_TAG_TYPES[kind]);
      }
    }
  }

  place(kind: LibraryKind, id: number, ext: string, data: Buffer | string): void {
    this.files.push({ path: join(this.folder, 'library', KIND_DIRS[kind], `${id}.${ext}`), data });
  }

  addImage(image: SeedImage): void {
    const ext = normalizeImageExt(image.ext ?? mediaExtension(image.name));
    const width = image.width ?? 64;
    const height = image.height ?? 48;
    const bytes = image.bytes ?? imageFixture(ext, width, height);
    const now = this.stamp(image.createdAt);
    const result = this.database
      .prepare(
        'INSERT INTO ws_library_images (name, ext, size, width, height, rights, origin, collection_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        image.name,
        ext,
        image.size ?? bytes.length,
        width,
        height,
        image.rights ?? 'own',
        image.origin ?? 'upload',
        this.collectionId(image.collection),
        now,
        now,
      );
    const id = Number(result.lastInsertRowid);
    this.images[image.name] = id;
    this.addTags('image', id, image.tags);
    this.place('image', id, ext, bytes);
  }

  addSound(sound: SeedSound): void {
    const ext = (sound.ext ?? mediaExtension(sound.name)).toLowerCase();
    const durationMs = sound.durationMs ?? 1000;
    const sampleRate = sound.sampleRate ?? (ext === 'wav' ? 8000 : 44100);
    const channels = sound.channels ?? (ext === 'mp3' ? 2 : 1);
    const bytes = sound.bytes ?? soundBytes(ext, { durationMs, sampleRate, channels });
    const level = Math.round((sound.peakLevel ?? (ext === 'wav' ? 0.5 : 0)) * 255);
    const peaks = Buffer.alloc(Math.max(1, Math.ceil((durationMs * PEAK_RATE) / 1000)), level);
    const now = this.stamp(sound.createdAt);
    const result = this.database
      .prepare(
        'INSERT INTO ws_library_sounds (name, ext, size, duration_ms, sample_rate, channels, peaks, overview, rights, origin, collection_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        sound.name,
        ext,
        sound.size ?? bytes.length,
        durationMs,
        sampleRate,
        channels,
        peaks,
        Buffer.alloc(OVERVIEW_SIZE, level),
        sound.rights ?? 'own',
        sound.origin ?? 'upload',
        this.collectionId(sound.collection),
        now,
        now,
      );
    const id = Number(result.lastInsertRowid);
    this.sounds[sound.name] = id;
    this.addTags('sound', id, sound.tags);
    this.place('sound', id, ext, bytes);
  }

  addVideo(video: SeedVideo): void {
    const ext = (video.ext ?? mediaExtension(video.name)).toLowerCase();
    const width = video.width ?? 1280;
    const height = video.height ?? 720;
    const durationMs = video.durationMs ?? 2000;
    const fps = video.fps === undefined ? 30 : video.fps;
    const bytes =
      video.bytes ??
      videoBytes({ format: videoFormat(ext), width, height, durationMs, fps: fps ?? 30 });
    const now = this.stamp(video.createdAt);
    const result = this.database
      .prepare(
        'INSERT INTO ws_library_videos (name, ext, size, duration_ms, width, height, fps, rights, origin, collection_id, has_poster, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        video.name,
        ext,
        video.size ?? bytes.length,
        durationMs,
        width,
        height,
        fps,
        video.rights ?? 'own',
        video.origin ?? 'upload',
        this.collectionId(video.collection),
        video.poster ? 1 : 0,
        now,
        now,
      );
    const id = Number(result.lastInsertRowid);
    this.videos[video.name] = id;
    this.addTags('video', id, video.tags);
    this.place('video', id, ext, bytes);
    if (video.poster) {
      this.files.push({
        path: join(this.folder, 'library', KIND_DIRS.video, 'posters', `${id}.jpg`),
        data: jpegBytes({ width: 48, height: 27, gray: 90 }),
      });
    }
  }

  addPrompt(prompt: SeedPrompt): void {
    const text = prompt.text ?? `Prompt text for ${prompt.name}`;
    const now = this.stamp(prompt.createdAt);
    const result = this.database
      .prepare(
        'INSERT INTO ws_library_prompts (name, kind, size, rights, origin, collection_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        prompt.name,
        prompt.kind ?? 'general',
        Buffer.byteLength(text),
        prompt.rights ?? 'own',
        prompt.origin ?? 'app',
        this.collectionId(prompt.collection),
        now,
        now,
      );
    const id = Number(result.lastInsertRowid);
    this.prompts[prompt.name] = id;
    this.addTags('prompt', id, prompt.tags);
    this.place('prompt', id, 'txt', text);
  }

  result(): SeededLibrary {
    return {
      collections: this.collections,
      images: this.images,
      sounds: this.sounds,
      videos: this.videos,
      prompts: this.prompts,
    };
  }
}

function normalizeImageExt(ext: string): string {
  const lowered = ext.toLowerCase();
  return lowered === 'jpeg' ? 'jpg' : lowered;
}

function videoFormat(ext: string): VideoFormatName {
  return VIDEO_FORMATS.includes(ext) ? (ext as VideoFormatName) : 'mp4';
}

function imageFixture(ext: string, width: number, height: number): Buffer {
  return imageBytes(ext, { width: Math.min(width, 64), height: Math.min(height, 48) });
}

function openDatabase(folder: string): DatabaseSync {
  return new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
}

function insertSeed(seeder: Seeder, seed: LibrarySeed): void {
  for (const collection of seed.collections ?? []) {
    seeder.addCollection(collection);
  }
  for (const image of seed.images ?? []) {
    seeder.addImage(image);
  }
  for (const sound of seed.sounds ?? []) {
    seeder.addSound(sound);
  }
  for (const video of seed.videos ?? []) {
    seeder.addVideo(video);
  }
  for (const prompt of seed.prompts ?? []) {
    seeder.addPrompt(prompt);
  }
}

async function writePending(files: readonly PendingFile[]): Promise<void> {
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.data);
  }
}

export async function seedLibrary(folder: string, seed: LibrarySeed): Promise<SeededLibrary> {
  const database = openDatabase(folder);
  const seeder = new Seeder(database, folder);
  try {
    database.exec('BEGIN');
    insertSeed(seeder, seed);
    database.exec('COMMIT');
  } finally {
    database.close();
  }
  await writePending(seeder.files);
  return seeder.result();
}

export async function seedLibraryWorkspace(
  folder: string,
  seed: LibrarySeed,
  options: SeedOptions = {},
): Promise<SeededLibrary> {
  await seedWorkspace(folder, options);
  return seedLibrary(folder, seed);
}

type Row = Record<string, unknown>;

export type KindCounts = Readonly<Record<LibraryKind, number>>;

interface AssetRow {
  readonly id: number;
  readonly name: string;
  readonly rights: AssetRights;
  readonly origin: string;
  readonly collectionId: number | null;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ImageRow extends AssetRow {
  readonly ext: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
}

export interface SoundRow extends AssetRow {
  readonly ext: string;
  readonly size: number;
  readonly durationMs: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly peaksLength: number;
}

export interface VideoRow extends AssetRow {
  readonly ext: string;
  readonly size: number;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number | null;
  readonly hasPoster: boolean;
}

export interface PromptRow extends AssetRow {
  readonly kind: PromptKind;
  readonly size: number;
}

export interface CollectionRow {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly counts: KindCounts;
}

export interface TagRow {
  readonly tag: string;
  readonly counts: KindCounts;
  readonly total: number;
}

export interface StoredFiles {
  readonly originals: readonly string[];
  readonly derived: readonly string[];
  readonly temporary: readonly string[];
}

function emptyCounts(): Record<LibraryKind, number> {
  return { image: 0, sound: 0, video: 0, prompt: 0 };
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export class LibraryDb {
  private constructor(private readonly database: DatabaseSync) {}

  static open(folder: string): LibraryDb {
    return new LibraryDb(
      new DatabaseSync(join(folder, WORKSPACE_DB_FILE), { readOnly: true, timeout: 5000 }),
    );
  }

  images(): ImageRow[] {
    const rows = this.database
      .prepare(
        'SELECT id, name, ext, size, width, height, rights, origin, collection_id, created_at, updated_at FROM ws_library_images ORDER BY id',
      )
      .all();
    return rows.map((row) => ({
      ...this.asset('image', row),
      ext: String(row['ext']),
      size: Number(row['size']),
      width: Number(row['width']),
      height: Number(row['height']),
    }));
  }

  sounds(): SoundRow[] {
    const sql =
      'SELECT id, name, ext, size, duration_ms, sample_rate, channels, length(peaks) AS peaks_length, rights, origin, collection_id, created_at, updated_at FROM ws_library_sounds ORDER BY id';
    return this.database
      .prepare(sql)
      .all()
      .map((row) => ({
        ...this.asset('sound', row),
        ext: String(row['ext']),
        size: Number(row['size']),
        durationMs: Number(row['duration_ms']),
        sampleRate: Number(row['sample_rate']),
        channels: Number(row['channels']),
        peaksLength: Number(row['peaks_length']),
      }));
  }

  videos(): VideoRow[] {
    const sql =
      'SELECT id, name, ext, size, duration_ms, width, height, fps, rights, origin, collection_id, has_poster, created_at, updated_at FROM ws_library_videos ORDER BY id';
    return this.database
      .prepare(sql)
      .all()
      .map((row) => ({
        ...this.asset('video', row),
        ext: String(row['ext']),
        size: Number(row['size']),
        durationMs: Number(row['duration_ms']),
        width: Number(row['width']),
        height: Number(row['height']),
        fps: nullableNumber(row['fps']),
        hasPoster: Number(row['has_poster']) !== 0,
      }));
  }

  prompts(): PromptRow[] {
    const sql =
      'SELECT id, name, kind, size, rights, origin, collection_id, created_at, updated_at FROM ws_library_prompts ORDER BY id';
    return this.database
      .prepare(sql)
      .all()
      .map((row) => ({
        ...this.asset('prompt', row),
        kind: String(row['kind']) as PromptKind,
        size: Number(row['size']),
      }));
  }

  collections(): CollectionRow[] {
    const rows = this.database
      .prepare(
        'SELECT id, name, description, created_at, updated_at FROM ws_library_collections ORDER BY id',
      )
      .all();
    return rows.map((row) => ({
      id: Number(row['id']),
      name: String(row['name']),
      description: String(row['description']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
      counts: this.collectionCounts(Number(row['id'])),
    }));
  }

  tags(): TagRow[] {
    const rows = this.database
      .prepare(
        "SELECT tag, type, COUNT(*) AS total FROM ws_tags WHERE type LIKE 'library\\_%' ESCAPE '\\' GROUP BY tag, type ORDER BY tag COLLATE NOCASE",
      )
      .all();
    const byTag = new Map<string, Record<LibraryKind, number>>();
    for (const row of rows) {
      const kind = LIBRARY_KINDS.find(
        (candidate) => KIND_TAG_TYPES[candidate] === String(row['type']),
      );
      if (kind !== undefined) {
        const counts = byTag.get(String(row['tag'])) ?? emptyCounts();
        counts[kind] = Number(row['total']);
        byTag.set(String(row['tag']), counts);
      }
    }
    return [...byTag.entries()].map(([tag, counts]) => ({
      tag,
      counts,
      total: LIBRARY_KINDS.reduce((sum, kind) => sum + counts[kind], 0),
    }));
  }

  tagsOf(kind: LibraryKind, id: number): string[] {
    const rows = this.database
      .prepare('SELECT tag FROM ws_tags WHERE type = ? AND id = ? ORDER BY tag')
      .all(KIND_TAG_TYPES[kind], String(id));
    return rows.map((row) => String(row['tag']));
  }

  tagCount(tag: string): number {
    const row = this.database
      .prepare(
        "SELECT COUNT(*) AS total FROM ws_tags WHERE tag = ? AND type LIKE 'library\\_%' ESCAPE '\\'",
      )
      .get(tag);
    return Number(row?.['total'] ?? 0);
  }

  counts(): KindCounts {
    const counts = emptyCounts();
    for (const kind of LIBRARY_KINDS) {
      const row = this.database.prepare(`SELECT COUNT(*) AS total FROM ${KIND_TABLES[kind]}`).get();
      counts[kind] = Number(row?.['total'] ?? 0);
    }
    return counts;
  }

  unfiled(): KindCounts {
    const counts = emptyCounts();
    for (const kind of LIBRARY_KINDS) {
      const row = this.database
        .prepare(`SELECT COUNT(*) AS total FROM ${KIND_TABLES[kind]} WHERE collection_id IS NULL`)
        .get();
      counts[kind] = Number(row?.['total'] ?? 0);
    }
    return counts;
  }

  collectionCounts(id: number): KindCounts {
    const counts = emptyCounts();
    for (const kind of LIBRARY_KINDS) {
      const row = this.database
        .prepare(`SELECT COUNT(*) AS total FROM ${KIND_TABLES[kind]} WHERE collection_id = ?`)
        .get(id);
      counts[kind] = Number(row?.['total'] ?? 0);
    }
    return counts;
  }

  orphanTagCount(): number {
    const sql = LIBRARY_KINDS.map(
      (kind) =>
        `SELECT COUNT(*) AS total FROM ws_tags WHERE type = '${KIND_TAG_TYPES[kind]}' AND CAST(id AS INTEGER) NOT IN (SELECT id FROM ${KIND_TABLES[kind]})`,
    ).join(' UNION ALL ');
    return this.database
      .prepare(sql)
      .all()
      .reduce((sum, row) => sum + Number(row['total']), 0);
  }

  image(name: string): ImageRow {
    return this.find(this.images(), name, 'image');
  }

  sound(name: string): SoundRow {
    return this.find(this.sounds(), name, 'sound');
  }

  video(name: string): VideoRow {
    return this.find(this.videos(), name, 'video');
  }

  prompt(name: string): PromptRow {
    return this.find(this.prompts(), name, 'prompt');
  }

  collection(name: string): CollectionRow {
    const found = this.collections().find((row) => row.name === name);
    if (found === undefined) {
      throw new Error(`no collection named ${name}`);
    }
    return found;
  }

  close(): void {
    this.database.close();
  }

  private find<T extends { readonly name: string }>(
    rows: readonly T[],
    name: string,
    kind: LibraryKind,
  ): T {
    const found = rows.find((row) => row.name === name);
    if (found === undefined) {
      throw new Error(`no ${kind} named ${name}`);
    }
    return found;
  }

  private asset(kind: LibraryKind, row: Row): AssetRow {
    const id = Number(row['id']);
    return {
      id,
      name: String(row['name']),
      rights: String(row['rights']) as AssetRights,
      origin: String(row['origin']),
      collectionId: nullableNumber(row['collection_id']),
      tags: this.tagsOf(kind, id),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    };
  }
}

export async function readLibrary<T>(folder: string, read: (db: LibraryDb) => T): Promise<T> {
  const db = LibraryDb.open(folder);
  try {
    return read(db);
  } finally {
    db.close();
  }
}

export function readImageRow(
  folder: string,
  id: number | undefined,
): Promise<ImageRow | undefined> {
  return readLibrary(folder, (db) => db.images().find((row) => row.id === id));
}

export function readPromptRow(
  folder: string,
  id: number | undefined,
): Promise<PromptRow | undefined> {
  return readLibrary(folder, (db) => db.prompts().find((row) => row.id === id));
}

export function readImageTags(folder: string, id: number): Promise<string[]> {
  return readLibrary(folder, (db) => db.tagsOf('image', id));
}

export function libraryDir(folder: string, kind: LibraryKind): string {
  return join(folder, 'library', KIND_DIRS[kind]);
}

export function storedPath(folder: string, kind: LibraryKind, id: number, ext: string): string {
  return join(libraryDir(folder, kind), `${id}.${ext}`);
}

export function derivedDir(folder: string, kind: LibraryKind): string {
  return join(libraryDir(folder, kind), kind === 'video' ? 'posters' : 'thumbs');
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function storedFiles(folder: string, kind: LibraryKind): Promise<StoredFiles> {
  const own = await listFiles(libraryDir(folder, kind));
  const derived =
    kind === 'image' || kind === 'video' ? await listFiles(derivedDir(folder, kind)) : [];
  return {
    originals: own.filter((name) => !name.startsWith('.')),
    derived: derived.filter((name) => !name.startsWith('.')),
    temporary: [...own, ...derived].filter((name) => name.startsWith('.')),
  };
}

export async function storedCount(folder: string, kind: LibraryKind): Promise<number> {
  return (await storedFiles(folder, kind)).originals.length;
}

export async function storedOriginal(
  folder: string,
  kind: LibraryKind,
  id: number,
  ext: string,
): Promise<Buffer> {
  return readFile(storedPath(folder, kind, id, ext));
}

export async function storedSize(
  folder: string,
  kind: LibraryKind,
  id: number,
  ext: string,
): Promise<number> {
  return (await stat(storedPath(folder, kind, id, ext))).size;
}

export async function storedText(folder: string, id: number): Promise<string> {
  return readFile(storedPath(folder, 'prompt', id, 'txt'), 'utf8');
}

const UPLOAD_NOUN_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: 'images',
  sound: 'sounds',
  video: 'videos',
  prompt: 'prompts',
};

export const UPLOAD_SUCCESS = 'images to the library.';
export const UPLOAD_PARTIAL = 'Uploaded 2/4 images; 2 files failed.';
export const UPLOAD_SUCCESS_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: UPLOAD_SUCCESS,
  sound: 'sounds to the library.',
  video: 'videos to the library.',
  prompt: 'prompts to the library.',
};
export const UPLOAD_PARTIAL_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: UPLOAD_PARTIAL,
  sound: 'Uploaded 2/4 sounds; 2 files failed.',
  video: 'Uploaded 2/4 videos; 2 files failed.',
  prompt: 'Uploaded 2/4 prompts; 2 files failed.',
};
export const UPLOAD_TITLE_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: 'Upload images',
  sound: 'Upload sounds',
  video: 'Upload videos',
  prompt: 'Upload prompts',
};
export const UPLOAD_CLOSE_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: 'Close upload images dialog',
  sound: 'Close upload sounds dialog',
  video: 'Close upload videos dialog',
  prompt: 'Close upload prompts dialog',
};

export function uploadSubmitLabel(kind: LibraryKind, count: number): string {
  return `Upload ${count} ${UPLOAD_NOUN_BY_KIND[kind]}`;
}

export const DROPZONE_LABEL_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: 'Image file selection area',
  sound: 'Sound file selection area',
  video: 'Video file selection area',
  prompt: 'Prompt file selection area',
};
export const DROP_TITLE_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: 'Drag and drop images here',
  sound: 'Drag and drop sounds here',
  video: 'Drag and drop videos here',
  prompt: 'Drag and drop prompt files here',
};
export const UPLOAD_SKIPPED = 'files already in the list.';

export const CHECK_EMPTY = 'File is empty.';
export const CHECK_UNSUPPORTED = 'is not a supported image format.';
export const CHECK_TOO_LARGE = 'Larger than the 25 MB image limit.';
export const CHECK_NOT_FOUND = 'File not found.';
export const CHECK_DUPLICATE =
  'An image with the same name already exists; its name will be changed automatically.';
export const CHECK_UNSUPPORTED_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: CHECK_UNSUPPORTED,
  sound: 'is not a supported sound format.',
  video: 'is not a supported video format.',
  prompt: 'is not a supported prompt format (TXT or MD only).',
};
export const CHECK_TOO_LARGE_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: CHECK_TOO_LARGE,
  sound: 'Larger than the 200 MB sound limit.',
  video: 'Larger than the 2 GB video limit.',
  prompt: 'Larger than the 256 KB prompt limit.',
};
export const CHECK_DUPLICATE_BY_KIND: Readonly<Record<LibraryKind, string>> = {
  image: CHECK_DUPLICATE,
  sound: 'A sound with the same name already exists; its name will be changed automatically.',
  video: 'A video with the same name already exists; its name will be changed automatically.',
  prompt: 'A prompt with the same name already exists; its name will be changed automatically.',
};
export const CHECK_UNREADABLE = 'Content cannot be read';

export const BADGE_VALID = 'VALID';
export const BADGE_RENAME = 'RENAME';
export const BADGE_INVALID = 'INVALID';
export const BADGE_DONE = 'DONE';
export const BADGE_ERROR = 'ERROR';

export const IMAGE_UPDATED = 'Image updated.';
export const IMAGE_RENAMED = 'Image renamed to';
export const IMAGE_DELETED_ONE = 'Deleted “';
export const IMAGE_DELETED_MANY = 'images.';
export const IMAGE_TAG_EXISTS = 'already exists.';
export const IMAGE_TAG_LIMIT = 'At most 12 tags per image.';

export const SOUND_UPDATED = 'Sound updated.';
export const SOUND_RENAMED = 'Renamed to';
export const SOUND_DELETED_ONE = 'Deleted “';
export const SOUND_DELETED_MANY = 'sounds.';
export const SOUND_TAG_EXISTS = 'is already added.';
export const SOUND_TAG_LIMIT = 'A sound can have up to 12 tags.';
export const SOUND_PLAY_FAILED = 'Could not play this sound.';

export const VIDEO_UPDATED = 'Video updated.';
export const VIDEO_RENAMED = 'Renamed to';
export const VIDEO_DELETED_ONE = 'Deleted';
export const VIDEO_DELETED_MANY = 'videos.';
export const VIDEO_TAG_EXISTS = 'is already added.';
export const VIDEO_TAG_LIMIT = 'A video can have up to 12 tags.';
export const VIDEO_UNSUPPORTED_PREVIEW = 'This video cannot be played in this app.';

export const PROMPT_SAVED = 'Saved prompt';
export const PROMPT_COPIED = 'Prompt copied.';
export const PROMPT_COPY_FAILED = 'Could not copy prompt.';
export const PROMPT_EMPTY_TEXT = 'Prompt content cannot be empty.';
export const PROMPT_DELETED_ONE = 'Prompt deleted.';
export const PROMPT_DELETED_MANY = 'prompts.';
export const PROMPT_NAME_REQUIRED = 'Enter a prompt name.';
export const PROMPT_TEXT_REQUIRED = 'Enter prompt content.';

export const COLLECTION_NAME_REQUIRED = 'Enter a collection name.';
export const COLLECTION_EXISTS = 'A collection with this name already exists.';
export const COLLECTION_INVALID = 'Enter a valid collection name and description.';
export const ORIGIN_LABEL = 'Source';
export const ORIGIN_UPLOAD = 'Uploaded from device';
export const COLLECTION_DELETE_WARNING = 'will remain in the library';
export const COLLECTION_EMPTY_WARNING = 'This collection is empty.';
export const TAG_NAME_EXISTS = 'That tag already exists.';
export const TAG_NAME_INVALID = 'Enter a valid tag name.';
export const TAG_MERGE_WARNING = 'The original tag will disappear.';
export const TAG_DELETE_WARNING = 'The resources themselves will remain.';

export const IMAGE_UNSUPPORTED = 'The image format is not supported.';
export const IMAGE_TOO_LARGE_ERROR = 'The image is larger than the 25 MB limit.';
export const IMAGE_UNREADABLE = 'The image could not be read.';
export const SOUND_UNSUPPORTED = 'This sound format is not supported.';
export const SOUND_TOO_LARGE_ERROR = 'Sound exceeds the 200 MB limit.';
export const SOUND_UNREADABLE = 'This sound could not be read.';
export const VIDEO_UNSUPPORTED = 'This video format is not supported.';
export const VIDEO_TOO_LARGE_ERROR = 'Video exceeds the 2 GB limit.';
export const VIDEO_UNREADABLE = 'This video could not be read.';
export const PROMPT_UNSUPPORTED = 'Only TXT and MD files are supported.';
export const PROMPT_TOO_LARGE_ERROR = 'Prompt exceeds the 256 KB limit.';
export const PROMPT_UNREADABLE = 'Prompt content could not be read.';
export const PROMPT_NAME_INVALID = 'Prompt name is invalid.';
export const PROMPT_NAME_TOO_LONG = 'Prompt name must be at most 120 characters.';
export const PROMPT_TEXT_TOO_LARGE = 'Prompt content must be at most 256 KB.';
export const GENERIC_ERROR = 'The operation could not be completed.';
export const FILE_IO_ERROR = 'The image file could not be read or written.';
