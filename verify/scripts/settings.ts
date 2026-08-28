import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import type { GeneralTab, LlmTab, SettingsSectionId } from "../pages/settings.ts";
import type { AppSession } from "./app.ts";
import type { Ui } from "./fixtures.ts";
import { openFromSplash } from "./flows.ts";
import type { PickerStub } from "./picker.ts";
import { currentBehavior, installProvider, providerDir, providerExecutable, setBehavior, settingsFile, test as providerTest, type ProviderId } from "./provider.ts";
import type { Sandbox } from "./sandbox.ts";

export { expect } from "./provider.ts";

const CLI_COMMANDS = ["claude", "codex", "agy"];
const EXECUTABLE_SUFFIXES = [".cmd", ".exe", ".bat", ".com", ""];
const SETTINGS_WORKSPACE = "settings";

function hasCli(folder: string): boolean {
  return CLI_COMMANDS.some((command) => EXECUTABLE_SUFFIXES.some((suffix) => existsSync(join(folder, `${command}${suffix}`))));
}

export function isolatedPath(path: string): string {
  return path
    .split(delimiter)
    .filter((folder) => folder !== "" && !hasCli(folder))
    .join(delimiter);
}

export const test = providerTest.extend({
  sandbox: async ({ sandbox }, use) => {
    const original = process.env["PATH"];
    process.env["PATH"] = isolatedPath(original ?? "");
    await use(sandbox);
    if (original === undefined) {
      delete process.env["PATH"];
    } else {
      process.env["PATH"] = original;
    }
  },
});

export const NAV_LABELS = ["General", "LLM providers", "Python backend", "Local TTS models", "Speech providers"];
export const SECTION_PENDING = /sẽ được bổ sung trong phiên bản sau|added in a later version/i;
export const OPEN_FAILED = /không mở được thư mục|could not open the folder/i;
export const TITLE_EN = "Settings";
export const TITLE_VI = "Cài đặt";
export const SWITCH_THEME_EN = "Switch theme";

export const BADGE_READY = /^(sẵn sàng|ready)$/i;
export const BADGE_NOT_INSTALLED = /^(chưa cài|not installed)$/i;
export const BADGE_NOT_SIGNED_IN = /^(chưa đăng nhập|not signed in)$/i;
export const BADGE_NOT_CHECKED = /^(chưa kiểm tra|not checked)$/i;
export const BADGE_ERROR = /^(lỗi|error)$/i;
export const BADGE_CHECKING = /^(đang kiểm tra|checking)$/i;
export const BADGE_FOUND = /^(đã tìm thấy|found)$/i;
export const BADGE_NOT_FOUND = /^(không tìm thấy|not found)$/i;
export const BADGE_SIGNED_IN = /^(đã đăng nhập|signed in)$/i;
export const BADGE_WAITING = /^(đang chờ|waiting)$/i;
export const BADGE_SOON = /^(sắp ra mắt|coming soon)$/i;

export const MSG_CHECKING = /đang chạy lệnh|running the command/i;
export const MSG_OK = /(kiểm tra thành công|check succeeded) · (\d+) ms · \d{1,2}:\d{2}/i;
export const MSG_FAILED = /kiểm tra thất bại|the check failed/i;
export const MSG_UNCHECKED = /chưa kiểm tra\. bấm kiểm tra|not checked yet\. click check/i;
export const MSG_NOT_INSTALLED = /chưa cài trên máy này|not installed on this machine/i;
export const MSG_NEED_SIGNIN = /hãy đăng nhập vào profile của app|sign in to the app's profile/i;
export const MSG_WAITING = /đang chờ bạn đăng nhập|waiting for you to finish signing in/i;

export const INSTALL_GUIDE = /cài cli rồi bấm quét lại|install the cli then click rescan/i;
export const INSTALL_NOT_IN_PATH = /không có trong path|is not in path/i;
export const SIGNIN_LOCKED = /hãy cài cli trước|install the cli first/i;
export const SIGNIN_GUIDE = /bấm đăng nhập để mở terminal chạy|click sign in to open a terminal running/i;
export const SIGNIN_APP_PROFILE = /profile của app chưa đăng nhập|the app's profile is not signed in/i;
export const CLOUD_INTRO = /api key sẽ được hỗ trợ ở phiên bản sau|api key will be supported in a later version/i;

export const FEATURE_NAMES = [/^(dịch thuật|translation)$/i, /^(tri thức|knowledge base)$/i, /^(trợ lý|assistant)$/i];
export const FEATURE_HINTS = [/dịch chương truyện sang ngôn ngữ đích|translate novel chapters into the target language/i, /phân tích truyện để xây dựng cơ sở tri thức|analyze a novel to build its knowledge base/i, /trợ lý hỗ trợ ngay trong ứng dụng|the assistant built into the app/i];
export const FEATURE_UNSET = /chưa chọn|not selected/i;
export const FEATURE_NO_CLI = /chưa có cli nào hỗ trợ chức năng này|no installed cli supports this feature/i;
export const CLAUDE_MODELS = ["opus", "sonnet", "haiku"];

export interface SettingsJson {
  general?: { language?: string; theme?: string; pipelines?: { maxPipelines?: number; maxTasks?: number } };
  llm?: {
    providers?: Record<string, { path?: string }>;
    features?: Record<string, { provider?: string; model?: string; effort?: string; args?: string }>;
  };
}

export async function readSettingsJson(sandbox: Sandbox): Promise<SettingsJson> {
  try {
    return JSON.parse(await readFile(settingsFile(sandbox), "utf8")) as SettingsJson;
  } catch {
    return {};
  }
}

export async function patchGeneral(sandbox: Sandbox, patch: Record<string, unknown>): Promise<void> {
  const settings = (await readSettingsJson(sandbox)) as Record<string, unknown>;
  const general = (settings["general"] ?? {}) as Record<string, unknown>;
  settings["general"] = { ...general, ...patch };
  await writeFile(settingsFile(sandbox), JSON.stringify(settings, null, 2));
}

export async function removeCliPath(sandbox: Sandbox, id: ProviderId): Promise<void> {
  const settings = await readSettingsJson(sandbox);
  const providers = { ...(settings.llm?.providers ?? {}) };
  delete providers[id];
  await writeFile(settingsFile(sandbox), JSON.stringify({ ...settings, llm: { ...settings.llm, providers } }, null, 2));
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
  readonly probe?: "ok" | "signed-out" | "broken";
  readonly probeDelayMs?: number;
}

export async function setProbe(sandbox: Sandbox, patch: ProbeBehavior): Promise<void> {
  await setBehavior(sandbox, { ...(await currentBehavior(sandbox)), ...patch });
}

export interface AuthEntry {
  readonly action: "login" | "logout";
  readonly profile: string;
  readonly at: string;
}

export async function authLog(sandbox: Sandbox): Promise<AuthEntry[]> {
  try {
    const text = await readFile(join(providerDir(sandbox), "auth.jsonl"), "utf8");
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as AuthEntry);
  } catch {
    return [];
  }
}

export async function finishLogin(sandbox: Sandbox): Promise<void> {
  await writeFile(join(providerDir(sandbox), "login.release"), "");
}

export type IpcMode = "ok" | "fail" | "hold" | "pass";

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
    const target = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const command = target.pathname.replace(/^\//, "");
    const mode = state.modes[command];
    if (target.hostname !== "ipc.localhost" || mode === undefined) {
      return original(input, init);
    }
    state.calls[command] = [...(state.calls[command] ?? []), typeof init?.body === "string" ? JSON.parse(init.body) : null];
    if (mode === "pass") {
      return original(input, init);
    }
    if (mode === "hold") {
      return new Promise((resolve) => {
        state.held[command] = [...(state.held[command] ?? []), () => resolve(original(input, init))];
      });
    }
    const body = mode === "ok" ? "null" : JSON.stringify("the stub refused the command");
    const headers = { "Content-Type": "application/json", "Tauri-Response": mode === "ok" ? "ok" : "error" };
    return Promise.resolve(new Response(body, { headers }));
  };
}

function setIpcMode(request: { command: string; mode: IpcMode }): void {
  const state = (window as unknown as IpcWindow).__dreamyIpc;
  if (!state) {
    throw new Error("the ipc spy is not installed");
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

export async function openSettings(ui: Ui, section: SettingsSectionId = "general"): Promise<void> {
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
  await openSettings(ui, "general");
  await ui.main.settings.general.tab(tab).click();
  await expect(ui.main.settings.general.tab(tab)).toHaveAttribute("aria-selected", "true");
}

export async function openLlmTab(ui: Ui, tab: LlmTab): Promise<void> {
  await openSettings(ui, "llm");
  await selectLlmTab(ui, tab);
}

export async function selectLlmTab(ui: Ui, tab: LlmTab): Promise<void> {
  await ui.main.settings.llm.tab(tab).click();
  await expect(ui.main.settings.llm.tab(tab)).toHaveAttribute("aria-selected", "true");
}

export async function setSlider(slider: Locator, value: number): Promise<void> {
  await slider.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

export async function openWorkspace(ui: Ui, picker: PickerStub, sandbox: Sandbox): Promise<string> {
  const folder = sandbox.workspace(SETTINGS_WORKSPACE);
  await openFromSplash(ui, picker, folder);
  return folder;
}

export async function relaunch(ui: Ui, app: AppSession, picker: PickerStub, folder: string, beforeStart?: () => Promise<void>): Promise<void> {
  await app.stop();
  await beforeStart?.();
  await app.start();
  await expect(ui.splash.root).toBeVisible();
  await openFromSplash(ui, picker, folder);
}

export async function useCliPath(ui: Ui, id: "claude" | "codex" | "antigravity", path: string): Promise<void> {
  const card = ui.main.settings.llm.cli(id);
  await card.manual.fill(path);
  await card.usePath.click();
}

interface TauriWindow {
  __TAURI_INTERNALS__: { invoke(command: string, args: Record<string, unknown>): Promise<unknown> };
}

function invokeGeneralSave(general: Record<string, unknown>): Promise<unknown> {
  return (window as unknown as TauriWindow).__TAURI_INTERNALS__.invoke("settings_general_save", { general });
}

export function saveGeneralRaw(page: Page, general: Record<string, unknown>): Promise<unknown> {
  return page.evaluate(invokeGeneralSave, general);
}
