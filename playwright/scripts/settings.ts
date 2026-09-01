import { existsSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

import type { GeneralTab, LlmTab, SettingsSectionId } from '../pages/settings.ts';
import type { AppSession } from './app.ts';
import type { Ui } from './fixtures.ts';
import { openFromSplash } from './flows.ts';
import type { PickerStub } from './picker.ts';
// prettier-ignore
import { currentBehavior, installProvider, providerDir, providerExecutable, type ProviderId,setBehavior, settingsFile, test as providerTest } from './provider.ts';
import type { Sandbox } from './sandbox.ts';

export { expect } from './provider.ts';

const CLI_COMMANDS = ['claude', 'codex', 'agy'];
const EXECUTABLE_SUFFIXES = ['.cmd', '.exe', '.bat', '.com', ''];
const SETTINGS_WORKSPACE = 'settings';

function hasCli(folder: string): boolean {
  return CLI_COMMANDS.some((command) =>
    EXECUTABLE_SUFFIXES.some((suffix) => existsSync(join(folder, `${command}${suffix}`))),
  );
}

export function isolatedPath(path: string): string {
  return path
    .split(delimiter)
    .filter((folder) => folder !== '' && !hasCli(folder))
    .join(delimiter);
}

export const test = providerTest.extend({
  sandbox: async ({ sandbox }, use) => {
    const original = process.env['PATH'];
    process.env['PATH'] = isolatedPath(original ?? '');
    await use(sandbox);
    if (original === undefined) {
      delete process.env['PATH'];
    } else {
      process.env['PATH'] = original;
    }
  },
});

export const NAV_LABELS = [
  'General',
  'LLM providers',
  'Python backend',
  'Local TTS models',
  'Speech providers',
];
export const SECTION_PENDING =
  'There is nothing to configure here yet. It will be added in a later version.';
export const OPEN_FAILED = 'Could not open the folder.';
export const TITLE_EN = 'Settings';
export const TITLE_VI = 'Cài đặt';
export const SWITCH_THEME_EN = 'Switch theme';

export const BADGE_READY = 'Ready';
export const BADGE_NOT_INSTALLED = 'Not installed';
export const BADGE_NOT_SIGNED_IN = 'Not signed in';
export const BADGE_NOT_CHECKED = 'Not checked';
export const BADGE_ERROR = 'Error';
export const BADGE_CHECKING = 'Checking';
export const BADGE_FOUND = 'Found';
export const BADGE_NOT_FOUND = 'Not found';
export const BADGE_SIGNED_IN = 'Signed in';
export const BADGE_WAITING = 'Waiting';
export const BADGE_SOON = 'Coming soon';

export const MSG_CHECKING = 'Running the command…';
export const MSG_OK = 'Check succeeded';
export const MSG_FAILED = 'The check failed.';
export const MSG_UNCHECKED = 'Not checked yet. Click Check to try running the command.';
export const MSG_NOT_INSTALLED = 'Not installed on this machine.';
export const MSG_NEED_SIGNIN = "Sign in to the app's profile before using this CLI.";
export const MSG_WAITING = 'Waiting for you to finish signing in on the terminal…';

export const INSTALL_GUIDE =
  'Install the CLI then click Rescan, or enter the executable path by hand.';
export const INSTALL_NOT_IN_PATH = 'is not in PATH';
export const SIGNIN_LOCKED = 'Install the CLI first.';
export const SIGNIN_GUIDE = 'Click Sign in to open a terminal running';
export const SIGNIN_APP_PROFILE = "The app's profile is not signed in.";
export const CLOUD_INTRO = 'Calling an LLM with an API key will be supported in a later version.';

export const FEATURE_NAMES = ['Translation', 'Knowledge base', 'Assistant'];
export const FEATURE_HINTS = [
  'Translate novel chapters into the target language.',
  'Analyze a novel to build its knowledge base: characters, places and relations.',
  'The assistant built into the app.',
];
export const FEATURE_UNSET = 'Not selected';
export const FEATURE_NO_CLI = 'No installed CLI supports this feature yet.';

export function checkDurationMs(statusText: string): number {
  return Number(/ · (\d+) ms · /.exec(statusText)?.[1]);
}
export const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku'];

export interface SettingsJson {
  general?: {
    language?: string;
    theme?: string;
    pipelines?: { maxPipelines?: number; maxTasks?: number };
  };
  llm?: {
    providers?: Record<string, { path?: string }>;
    features?: Record<
      string,
      { provider?: string; model?: string; effort?: string; args?: string }
    >;
  };
}

export async function readSettingsJson(sandbox: Sandbox): Promise<SettingsJson> {
  try {
    return JSON.parse(await readFile(settingsFile(sandbox), 'utf8')) as SettingsJson;
  } catch {
    return {};
  }
}

export async function patchGeneral(
  sandbox: Sandbox,
  patch: Record<string, unknown>,
): Promise<void> {
  const settings = (await readSettingsJson(sandbox)) as Record<string, unknown>;
  const general = (settings['general'] ?? {}) as Record<string, unknown>;
  settings['general'] = { ...general, ...patch };
  await writeFile(settingsFile(sandbox), JSON.stringify(settings, null, 2));
}

export async function removeCliPath(sandbox: Sandbox, id: ProviderId): Promise<void> {
  const settings = await readSettingsJson(sandbox);
  const providers = { ...(settings.llm?.providers ?? {}) };
  delete providers[id];
  await writeFile(
    settingsFile(sandbox),
    JSON.stringify({ ...settings, llm: { ...settings.llm, providers } }, null, 2),
  );
}

export async function installCli(sandbox: Sandbox, id: ProviderId): Promise<void> {
  await installProvider(sandbox, { id, features: [] });
}

export async function copyCliStub(sandbox: Sandbox, name: string): Promise<string> {
  const target = join(sandbox.filesDir, `${name}.cmd`);
  await copyFile(providerExecutable(sandbox), target);
  return target;
}

export interface ProbeBehavior {
  readonly probe?: 'ok' | 'signed-out' | 'broken';
  readonly probeDelayMs?: number;
}

export async function setProbe(sandbox: Sandbox, patch: ProbeBehavior): Promise<void> {
  await setBehavior(sandbox, { ...(await currentBehavior(sandbox)), ...patch });
}

export interface AuthEntry {
  readonly action: 'login' | 'logout';
  readonly profile: string;
  readonly at: string;
}

export async function authLog(sandbox: Sandbox): Promise<AuthEntry[]> {
  try {
    const text = await readFile(join(providerDir(sandbox), 'auth.jsonl'), 'utf8');
    return text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as AuthEntry);
  } catch {
    return [];
  }
}

export async function finishLogin(sandbox: Sandbox): Promise<void> {
  await writeFile(join(providerDir(sandbox), 'login.release'), '');
}

export type IpcMode = 'ok' | 'fail' | 'hold' | 'pass';

interface IpcState {
  modes: Record<string, IpcMode>;
  calls: Record<string, unknown[]>;
  held: Record<string, Array<() => void>>;
}

interface IpcWindow {
  __dreamyIpc?: IpcState;
}

function wrapIpc(): void {
  const scope = window as unknown as IpcWindow;
  if (scope.__dreamyIpc) {
    return;
  }
  const state: IpcState = { modes: {}, calls: {}, held: {} };
  scope.__dreamyIpc = state;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const target = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.href,
    );
    const command = target.pathname.replace(/^\//, '');
    const mode = state.modes[command];
    if (target.hostname !== 'ipc.localhost' || mode === undefined) {
      return original(input, init);
    }
    state.calls[command] = [
      ...(state.calls[command] ?? []),
      typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    ];
    if (mode === 'pass') {
      return original(input, init);
    }
    if (mode === 'hold') {
      return new Promise((resolve) => {
        state.held[command] = [
          ...(state.held[command] ?? []),
          () => resolve(original(input, init)),
        ];
      });
    }
    const body = mode === 'ok' ? 'null' : JSON.stringify('the stub refused the command');
    const headers = {
      'Content-Type': 'application/json',
      'Tauri-Response': mode === 'ok' ? 'ok' : 'error',
    };
    return Promise.resolve(new Response(body, { headers }));
  };
}

function setIpcMode(request: { command: string; mode: IpcMode }): void {
  const state = (window as unknown as IpcWindow).__dreamyIpc;
  if (!state) {
    throw new Error('the ipc spy is not installed');
  }
  state.modes[request.command] = request.mode;
}

function readIpcCalls(command: string): unknown[] {
  return (window as unknown as IpcWindow).__dreamyIpc?.calls[command] ?? [];
}

function releaseIpc(command: string): void {
  const state = (window as unknown as IpcWindow).__dreamyIpc;
  const waiting = state?.held[command] ?? [];
  if (state) {
    state.held[command] = [];
  }
  for (const resume of waiting) {
    resume();
  }
}

export class IpcSpy {
  constructor(private readonly pageOf: () => Page) {}

  async install(): Promise<void> {
    await this.pageOf().evaluate(wrapIpc);
  }

  async mode(command: string, mode: IpcMode): Promise<void> {
    await this.pageOf().evaluate(setIpcMode, { command, mode });
  }

  calls(command: string): Promise<unknown[]> {
    return this.pageOf().evaluate(readIpcCalls, command);
  }

  async release(command: string): Promise<void> {
    await this.pageOf().evaluate(releaseIpc, command);
  }
}

export async function openSettings(ui: Ui, section: SettingsSectionId = 'general'): Promise<void> {
  const settings = ui.main.settings;
  await settings.rail.click();
  await expect(settings.dialog.panel).toBeVisible();
  await settings.dialog.nav(section).click();
  await expect(settings.dialog.pane(section)).toBeVisible();
}

export async function closeSettings(ui: Ui): Promise<void> {
  const dialog = ui.main.settings.dialog;
  await dialog.close.click();
  await expect(dialog.panel).toBeHidden();
}

export async function openGeneralTab(ui: Ui, tab: GeneralTab): Promise<void> {
  await openSettings(ui, 'general');
  await ui.main.settings.general.tab(tab).click();
  await expect(ui.main.settings.general.tab(tab)).toHaveAttribute('aria-selected', 'true');
}

export async function openLlmTab(ui: Ui, tab: LlmTab): Promise<void> {
  await openSettings(ui, 'llm');
  await selectLlmTab(ui, tab);
}

export async function selectLlmTab(ui: Ui, tab: LlmTab): Promise<void> {
  await ui.main.settings.llm.tab(tab).click();
  await expect(ui.main.settings.llm.tab(tab)).toHaveAttribute('aria-selected', 'true');
}

export async function setSlider(slider: Locator, value: number): Promise<void> {
  await slider.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

export async function openWorkspace(ui: Ui, picker: PickerStub, sandbox: Sandbox): Promise<string> {
  const folder = sandbox.workspace(SETTINGS_WORKSPACE);
  await openFromSplash(ui, picker, folder);
  return folder;
}

export async function relaunch(
  ui: Ui,
  app: AppSession,
  picker: PickerStub,
  folder: string,
  beforeStart?: () => Promise<void>,
): Promise<void> {
  await app.stop();
  await beforeStart?.();
  await app.start();
  await expect(ui.splash.root).toBeVisible();
  await openFromSplash(ui, picker, folder);
}

export async function useCliPath(
  ui: Ui,
  id: 'claude' | 'codex' | 'antigravity',
  path: string,
): Promise<void> {
  const card = ui.main.settings.llm.cli(id);
  await card.manual.fill(path);
  await card.usePath.click();
}

interface TauriWindow {
  __TAURI_INTERNALS__: { invoke(command: string, args: Record<string, unknown>): Promise<unknown> };
}

function invokeGeneralSave(general: Record<string, unknown>): Promise<unknown> {
  return (window as unknown as TauriWindow).__TAURI_INTERNALS__.invoke('settings_general_save', {
    general,
  });
}

export function saveGeneralRaw(page: Page, general: Record<string, unknown>): Promise<unknown> {
  return page.evaluate(invokeGeneralSave, general);
}
