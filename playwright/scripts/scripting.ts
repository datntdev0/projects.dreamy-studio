import { expect, type Locator, type Page } from '@playwright/test';

import type { ModuleId } from '../pages/project.ts';
import type { ScriptBlock, ScriptingPage } from '../pages/scripting.ts';
import type { AppSession } from './app.ts';
import type { Ui } from './fixtures.ts';
import { openFromSplash } from './flows.ts';
import { waitForFrames } from './frames.ts';
// prettier-ignore
import { CLEAN_ANALYSES, entityId, type SeedAnalysis, type SeedEntity, seedKnowledgeWorkspace, VI_ANALYSES, VI_PARAGRAPHS } from './knowledge.ts';
import type { PickerStub } from './picker.ts';
import { type SeedProject, seedProjects } from './project.ts';
import type { Sandbox } from './sandbox.ts';
import { IpcSpy } from './settings.ts';
import { SAMPLE_TITLE, sampleChapters } from './translation.ts';
import type { SeedChapter } from './workspaces.ts';

export const SCRIPTING_WORKSPACE_NAME = 'scripting';

export const AUDIO_PROJECT = 'Azure Audio';
export const VIET_PROJECT = 'Azure Viet';
export const LOOSE_PROJECT = 'Loose Audio';
export const BLANK_PROJECT = 'Blank Draft';
export const SINGLE_PROJECT = 'Azure Single';
export const WHOLE_PROJECT = 'Azure Whole';

export const PROJECT_IDS: Readonly<Record<string, number>> = {
  [AUDIO_PROJECT]: 1,
  [VIET_PROJECT]: 2,
  [LOOSE_PROJECT]: 3,
  [BLANK_PROJECT]: 4,
  [SINGLE_PROJECT]: 5,
  [WHOLE_PROJECT]: 6,
};

export const HERO = 'Lin Feng';
export const MASTER = 'Master Chen';
export const HEALER = 'Su Yan';
export const NESTED = 'Chen';
export const VI_HERO = 'Lâm Phong';
export const NARRATOR_ID = 'narr';

export const MODULE_LABELS = [
  'Scripting',
  'Character',
  'World',
  'Storyboard',
  'Audiobook',
  'Canvas',
  'Video editor',
];
export const UNSUPPORTED_MODULES: readonly ModuleId[] = [
  'character',
  'world',
  'storyboard',
  'canvas',
  'video',
];

export const COMING_SOON = 'Coming soon';

export const TYPE_HEADING = 'Title';
export const TYPE_NARRATION = 'Narration';
export const TYPE_DIALOGUE = 'Dialogue';
export const TYPE_PAUSE = 'Pauses';
export const TYPE_NOTE = 'Note';
export const BLOCK_TYPES = [TYPE_HEADING, TYPE_NARRATION, TYPE_DIALOGUE, TYPE_PAUSE, TYPE_NOTE];

export const PRESET_BADGE = 'AUDIOBOOK';
export const PRESET_AUDIOBOOK = 'Audiobook narration';
export const PRESET_FILM = 'Film script';
export const PICK_TITLE = 'Which kind of product are you writing a script for?';
export const UNNAMED = 'Unnamed';
export const NO_SCRIPT = 'has no script yet';
export const SCRATCH_ONLY = 'Start writing from scratch.';
export const NOT_DRAFTED = 'Not drafted';
export const BLANK_PAGE = 'Blank page. Choose a block type in the bar above to begin.';
export const DEFAULT_CREATED = 'Created the default script from the source paragraphs.';
export const RESET_INTRO =
  'The default turns each source paragraph into exactly one narration block, keeping the text of the current source paragraph unchanged.';
export const RESET_WARNING =
  'Every edit in this scope will be lost. Audio already generated for blocks whose text is unchanged is kept.';
export const RESET_ALL = 'Every chapter that has a source';
export const MANAGE_CAST = 'Manage characters…';
export const NARRATOR = 'Narrator';
export const CAST_DUPLICATE = 'A character with this name already exists.';
export const CAST_HINT_KB = 'Characters come from the novel’s Knowledgebase, edit them there.';
export const DELETE_KB = 'Characters from the Knowledgebase';
export const DELETE_NARRATOR = 'Cannot delete';
export const DELETE_USED = 'In use';
export const DELETE_FREE = 'Delete';

export const RAIL_MIN = 180;
export const RAIL_MAX = 420;

const SAVE_COMMANDS: readonly string[] = [
  'scripting_save',
  'scripting_unit_save',
  'scripting_cast_save',
];

const NESTED_ENTITY: SeedEntity = { type: 'character', name: NESTED };

export const STORY = sampleChapters(3);

export const CHAPTERS: readonly SeedChapter[] = [
  ...STORY,
  { title: 'The Silence', paragraphs: [] },
];

export const VI_TITLE = 'Ngày đến';
export const VI_SECOND_TITLE = '[VI] The Trial';

const PROJECTS: readonly SeedProject[] = [
  { name: AUDIO_PROJECT, novel: SAMPLE_TITLE, range: [1, 4] },
  { name: VIET_PROJECT, novel: SAMPLE_TITLE, range: [1, 2], translation: 'VI' },
  { name: LOOSE_PROJECT },
  { name: BLANK_PROJECT, template: 'blank' },
  { name: SINGLE_PROJECT, novel: SAMPLE_TITLE, range: [3, 4] },
  { name: WHOLE_PROJECT, novel: SAMPLE_TITLE },
];

export interface ModuleStateRecord {
  readonly id: string;
  readonly state: string;
  readonly done: number;
  readonly total: number;
  readonly note?: string;
}

interface TauriWindow {
  __TAURI_INTERNALS__: { invoke(command: string, args: Record<string, unknown>): Promise<unknown> };
}

function withNestedName(analysis: SeedAnalysis): SeedAnalysis {
  if (analysis.chapter !== 1) {
    return analysis;
  }
  return { ...analysis, entities: [...(analysis.entities ?? []), NESTED_ENTITY] };
}

export function paragraphsOf(chapter: number): readonly string[] {
  return CHAPTERS[chapter - 1]?.paragraphs ?? [];
}

export function castId(name: string): string {
  return entityId('character', name);
}

export async function seedScripting(folder: string): Promise<void> {
  await seedKnowledgeWorkspace(folder, {
    novels: [{ title: SAMPLE_TITLE, lang: 'ZH', chapters: CHAPTERS }],
    translations: [
      {
        novel: SAMPLE_TITLE,
        target: 'VI',
        chapters: [{ chapter: 1, title: VI_TITLE, paragraphs: VI_PARAGRAPHS }, { chapter: 2 }],
      },
    ],
    knowledge: [
      { novel: SAMPLE_TITLE, analyses: [...CLEAN_ANALYSES.map(withNestedName), ...VI_ANALYSES] },
    ],
  });
  await seedProjects(folder, PROJECTS);
}

export async function showProjectExplorer(ui: Ui): Promise<void> {
  const project = ui.main.project;
  if (!(await project.explorer.catalog.isVisible())) {
    await project.rail.click();
  }
  await expect(project.explorer.catalog).toBeVisible();
}

export async function expandProject(ui: Ui, name: string): Promise<void> {
  const explorer = ui.main.project.explorer;
  await expect(explorer.project(name)).toBeVisible();
  if ((await explorer.modules(name).count()) === 0) {
    await explorer.expand(name).click();
  }
  await expect(explorer.modules(name)).toHaveCount(MODULE_LABELS.length);
}

export async function openScriptingWorkspace(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  seed?: (folder: string) => Promise<void>,
): Promise<string> {
  const folder = sandbox.workspace(SCRIPTING_WORKSPACE_NAME);
  await seedScripting(folder);
  await seed?.(folder);
  await openFromSplash(ui, picker, folder);
  await showProjectExplorer(ui);
  return folder;
}

export async function openModule(ui: Ui, name: string, moduleId: ModuleId): Promise<void> {
  await showProjectExplorer(ui);
  await expandProject(ui, name);
  await ui.main.project.explorer.module(name, moduleId).click();
  await expect(ui.main.project.moduleTab(PROJECT_IDS[name] ?? 0, moduleId)).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

export async function openScripting(ui: Ui, name: string): Promise<void> {
  await openModule(ui, name, 'scripting');
  await expect(ui.main.scripting.back).toHaveText(name);
}

export async function openAudiobook(ui: Ui, name: string): Promise<void> {
  await openModule(ui, name, 'audiobook');
  await expect(ui.main.audiobook.back).toHaveText(name);
}

export async function openScriptingOf(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  name: string = AUDIO_PROJECT,
): Promise<string> {
  const folder = await openScriptingWorkspace(ui, picker, sandbox);
  await openScripting(ui, name);
  return folder;
}

export async function reopenScripting(
  ui: Ui,
  app: AppSession,
  picker: PickerStub,
  folder: string,
  name: string = AUDIO_PROJECT,
): Promise<ScriptingPage> {
  await app.restart();
  await expect(ui.splash.root).toBeVisible();
  await openFromSplash(ui, picker, folder);
  await openScripting(ui, name);
  return ui.main.scripting;
}

export async function trackSaves(
  app: AppSession,
  commands: readonly string[] = SAVE_COMMANDS,
): Promise<IpcSpy> {
  const spy = new IpcSpy(() => app.page);
  await spy.install();
  for (const command of commands) {
    await spy.mode(command, 'pass');
  }
  return spy;
}

async function pendingSaves(spy: IpcSpy, commands: readonly string[]): Promise<number> {
  let pending = 0;
  for (const command of commands) {
    pending += (await spy.calls(command)).length - (await spy.done(command));
  }
  return pending;
}

export async function waitForSaves(
  page: Page,
  spy: IpcSpy,
  commands: readonly string[] = SAVE_COMMANDS,
): Promise<void> {
  await waitForFrames(page);
  await expect.poll(() => pendingSaves(spy, commands)).toBe(0);
}

function invokeModules(projectId: number): Promise<unknown> {
  return (window as unknown as TauriWindow).__TAURI_INTERNALS__.invoke('project_modules', {
    projectId,
  });
}

export async function moduleState(
  page: Page,
  projectId: number,
  moduleId: ModuleId,
): Promise<ModuleStateRecord | undefined> {
  const rows = (await page.evaluate(invokeModules, projectId)) as ModuleStateRecord[] | null;
  return (rows ?? []).find((row) => row.id === moduleId);
}

export async function generateDefault(ui: Ui, chapter: number): Promise<void> {
  const scripting = ui.main.scripting;
  await scripting.unit(chapter).click();
  await scripting.generate.click();
  await expect(scripting.blocks).toHaveCount(paragraphsOf(chapter).length);
}

export async function startWriting(ui: Ui, chapter: number): Promise<void> {
  const scripting = ui.main.scripting;
  await scripting.unit(chapter).click();
  await scripting.start.click();
  await expect(scripting.blocks).toHaveCount(1);
}

export async function chooseMenu(ui: Ui, label: string): Promise<void> {
  await ui.main.scripting.menuItem(label).click();
  await expect(ui.main.scripting.menu).toBeHidden();
}

export async function changeType(ui: Ui, block: ScriptBlock, label: string): Promise<void> {
  await block.type.click();
  await chooseMenu(ui, label);
  await expect(block.type).toHaveText(label);
}

export async function addBlock(ui: Ui, label: string): Promise<void> {
  await ui.main.scripting.addButton.click();
  await chooseMenu(ui, label);
}

export async function assignSpeaker(ui: Ui, block: ScriptBlock, name: string): Promise<void> {
  await block.who.click();
  await chooseMenu(ui, name);
  await expect(block.who).toHaveText(name);
}

export async function showCast(ui: Ui): Promise<void> {
  const scripting = ui.main.scripting;
  if (!(await scripting.cast.root.isVisible()) && (await scripting.inspectorTab.isVisible())) {
    await scripting.inspectorTab.click();
  }
  await expect(scripting.cast.root).toBeVisible();
}

interface InputLookup {
  readonly name: string;
  readonly prefix: string;
}

function idOfInput(list: Element, lookup: InputLookup): string {
  const inputs = list.querySelectorAll('input');
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (input?.value === lookup.name) {
      return (input.getAttribute('data-testid') ?? '').replace(lookup.prefix, '');
    }
  }
  return '';
}

export function idByInputValue(list: Locator, name: string, prefix: string): Promise<string> {
  return list.evaluate(idOfInput, { name, prefix });
}

export function castIdOf(ui: Ui, name: string): Promise<string> {
  return idByInputValue(ui.main.scripting.cast.list, name, 'sc-cast-name-');
}

export function dotClasses(ui: Ui): Promise<string[]> {
  return ui.main.scripting.cast.list.locator('.sc-dot').evaluateAll(readClasses);
}

function readClasses(elements: Element[]): string[] {
  const classes: string[] = [];
  for (const element of elements) {
    classes.push(element.className);
  }
  return classes;
}

function widthOf(element: Element): number {
  return Math.round(element.getBoundingClientRect().width);
}

export function railWidth(rail: Locator): Promise<number> {
  return rail.evaluate(widthOf);
}

export async function dragBy(page: Page, handle: Locator, dx: number): Promise<void> {
  const box = await handle.boundingBox();
  if (box === null) {
    throw new Error('the resize handle is not visible');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

function wordsIn(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function wordCount(texts: readonly string[]): number {
  let words = 0;
  for (const text of texts) {
    words += wordsIn(text);
  }
  return words;
}

export function durationText(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export function railMeta(texts: readonly string[]): string {
  return `${texts.length} blocks · ${wordCount(texts)} words`;
}

export function textContent(locator: Locator): Promise<string> {
  return locator.evaluate(contentOf);
}

function contentOf(element: Element): string {
  return element.textContent ?? '';
}
