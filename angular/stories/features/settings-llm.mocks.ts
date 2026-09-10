import { Provider, signal, WritableSignal } from '@angular/core';
import { LlmService } from '@features/settings/llm.service';
// prettier-ignore
import { LlmCapability, LlmFeature, LlmFeatureSettings, LlmInstall, LlmProvider, LlmUsage, LlmUsageWindow } from '@features/settings/settings.models';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60 * 1000;
const INSTALL_TICK_MS = 250;
const INSTALL_STEPS = 24;
const USAGE_DELAY_MS = 700;
const CLAUDE_SIZE = 403083424;
const AGY_SIZE = 243373976;
const CODEX_SIZE = 218274372;
const PROFILE_ROOT = 'C:\\Users\\dreamy\\AppData\\Roaming\\dreamy-studio\\llm';

export type LlmInstallScenario = 'mixed' | 'missing' | 'downloading' | 'failed';

export type LlmUsageScenario = 'normal' | 'limited' | 'failed';

export interface LlmScenario {
  install?: LlmInstallScenario;
  usage?: LlmUsageScenario;
}

function ahead(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function installed(version: string, totalBytes: number): LlmInstall {
  return { state: 'installed', version, receivedBytes: totalBytes, totalBytes, error: '' };
}

function missing(version: string, totalBytes: number): LlmInstall {
  return { state: 'none', version, receivedBytes: 0, totalBytes, error: '' };
}

function downloading(version: string, totalBytes: number, ratio: number): LlmInstall {
  const receivedBytes = Math.round(totalBytes * ratio);
  return { state: 'downloading', version, receivedBytes, totalBytes, error: '' };
}

function failed(version: string, totalBytes: number): LlmInstall {
  return {
    state: 'error',
    version,
    receivedBytes: 0,
    totalBytes,
    error: 'cli_windows_x64.exe has Sha512 7b46…, expected 9c1d…',
  };
}

export function llmProvider(
  overrides: Partial<LlmProvider> & Pick<LlmProvider, 'id' | 'name' | 'command'>,
): LlmProvider {
  return {
    caps: ['translation', 'knowledge', 'assistant'],
    profileEnv: null,
    profileDir: null,
    loginCommand: `${overrides.command} login`,
    canLogout: true,
    canDetectLogin: true,
    install: installed('1.0.0', CODEX_SIZE),
    version: '1.0.0',
    signedIn: true,
    account: 'reader@example.com',
    signing: false,
    status: 'ok',
    error: '',
    latencyMs: 820,
    checkedAt: '09:30:00',
    usage: null,
    usageLoading: false,
    usageError: '',
    ...overrides,
  };
}

function claude(): LlmProvider {
  return llmProvider({
    id: 'claude',
    name: 'Claude Code CLI',
    command: 'claude',
    version: '2.1.332',
    install: installed('2.1.332', CLAUDE_SIZE),
    profileEnv: 'CLAUDE_CONFIG_DIR',
    profileDir: `${PROFILE_ROOT}\\claude`,
  });
}

function codex(): LlmProvider {
  return llmProvider({
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    version: '0.172.0',
    install: installed('0.172.0', CODEX_SIZE),
    caps: ['knowledge', 'assistant'],
    profileEnv: 'CODEX_HOME',
    profileDir: `${PROFILE_ROOT}\\codex`,
  });
}

function antigravity(install: LlmInstall): LlmProvider {
  return llmProvider({
    id: 'antigravity',
    name: 'Antigravity CLI',
    command: 'agy',
    version: '',
    install,
    loginCommand: 'agy',
    canLogout: false,
    canDetectLogin: false,
    signedIn: null,
    account: '',
    status: 'none',
  });
}

function withInstall(provider: LlmProvider, install: LlmInstall): LlmProvider {
  return { ...provider, install, status: 'none', signedIn: null, account: '', version: '' };
}

const AGY_VERSION = '1.5.17';

export function llmProviders(scenario: LlmInstallScenario = 'mixed'): LlmProvider[] {
  switch (scenario) {
    case 'missing':
      return [
        withInstall(claude(), missing('2.1.332', CLAUDE_SIZE)),
        withInstall(codex(), missing('0.172.0', CODEX_SIZE)),
        antigravity(missing(AGY_VERSION, AGY_SIZE)),
      ];
    case 'downloading':
      return [claude(), codex(), antigravity(downloading(AGY_VERSION, AGY_SIZE, 0.42))];
    case 'failed':
      return [claude(), codex(), antigravity(failed(AGY_VERSION, AGY_SIZE))];
    case 'mixed':
      return [claude(), codex(), antigravity(missing(AGY_VERSION, AGY_SIZE))];
  }
}

export const LLM_PROVIDERS: LlmProvider[] = llmProviders();

export const LLM_FEATURES: LlmFeature[] = [
  { id: 'translation', provider: 'claude', model: 'sonnet', effort: 'medium', args: '' },
  { id: 'knowledge', provider: 'claude', model: 'opus', effort: 'high', args: '--max-turns 5' },
  { id: 'assistant', provider: null, model: '', effort: null, args: '' },
];

function usageWindow(
  window: LlmUsageWindow['window'],
  usedPercent: number,
  reset: Partial<LlmUsageWindow> = {},
): LlmUsageWindow {
  return { window, group: null, usedPercent, resetsAt: null, resetsNote: null, ...reset };
}

function claudeUsage(session: number, weekly: number): LlmUsage {
  return {
    plan: null,
    checkedAtMs: Date.now(),
    windows: [
      usageWindow('session', session, { resetsNote: 'Nov 26, 2am (Asia/Ho_Chi_Minh)' }),
      usageWindow('weekly', weekly, {
        group: 'all models',
        resetsNote: 'Nov 28, 12pm (Asia/Ho_Chi_Minh)',
      }),
    ],
  };
}

function codexUsage(): LlmUsage {
  return {
    plan: 'Plus',
    checkedAtMs: Date.now(),
    windows: [
      usageWindow('session', 82, { resetsAt: ahead(3 * HOUR_MS + 5 * MINUTE_MS) }),
      usageWindow('weekly', 64, { resetsAt: ahead(3 * DAY_MS) }),
    ],
  };
}

function antigravityUsage(): LlmUsage {
  const gemini = 'Gemini Models';
  const partner = 'Claude and GPT models';
  return {
    plan: null,
    checkedAtMs: Date.now(),
    windows: [
      usageWindow('weekly', 4, { group: gemini, resetsAt: ahead(6 * DAY_MS + 21 * HOUR_MS) }),
      usageWindow('weekly', 0, { group: partner }),
      usageWindow('session', 0, { group: partner }),
    ],
  };
}

function usageOf(scenario: LlmScenario, id: string): LlmUsage {
  const limited = scenario.usage === 'limited';
  switch (id) {
    case 'claude':
      return limited ? claudeUsage(100, 93) : claudeUsage(27, 41);
    case 'codex':
      return codexUsage();
    default:
      return antigravityUsage();
  }
}

interface LlmMockState {
  scenario: LlmScenario;
  providers: WritableSignal<LlmProvider[]>;
  timers: Map<string, ReturnType<typeof setInterval>>;
}

function patch(state: LlmMockState, id: string, change: Partial<LlmProvider>): void {
  state.providers.update((list) =>
    list.map((item) => (item.id === id ? { ...item, ...change } : item)),
  );
}

function patchInstall(state: LlmMockState, id: string, change: Partial<LlmInstall>): void {
  state.providers.update((list) =>
    list.map((item) =>
      item.id === id ? { ...item, install: { ...item.install, ...change } } : item,
    ),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadUsage(state: LlmMockState, provider: LlmProvider): Promise<void> {
  patch(state, provider.id, { usageLoading: true, usageError: '' });
  await delay(USAGE_DELAY_MS);
  if (state.scenario.usage === 'failed' && provider.id === 'codex') {
    patch(state, provider.id, {
      usageLoading: false,
      usageError: 'codex exited with code 1: /status is not available in exec mode.',
    });
    return;
  }
  patch(state, provider.id, { usageLoading: false, usage: usageOf(state.scenario, provider.id) });
}

async function refreshUsage(state: LlmMockState): Promise<void> {
  const targets = state.providers().filter((item) => item.install.state === 'installed');
  await Promise.all(targets.map((item) => loadUsage(state, item)));
}

function stopInstall(state: LlmMockState, id: string): void {
  clearInterval(state.timers.get(id));
  state.timers.delete(id);
}

function finishInstall(state: LlmMockState, id: string): void {
  stopInstall(state, id);
  const provider = state.providers().find((item) => item.id === id);
  if (!provider) {
    return;
  }
  patch(state, id, {
    install: {
      ...provider.install,
      state: 'installed',
      receivedBytes: provider.install.totalBytes,
    },
    version: provider.install.version,
    status: 'ok',
    checkedAt: new Date().toLocaleTimeString(),
  });
  void loadUsage(state, provider);
}

function tickInstall(state: LlmMockState, id: string): void {
  const provider = state.providers().find((item) => item.id === id);
  if (!provider || provider.install.state !== 'downloading') {
    stopInstall(state, id);
    return;
  }
  const { receivedBytes, totalBytes } = provider.install;
  const next = Math.min(totalBytes, receivedBytes + Math.ceil(totalBytes / INSTALL_STEPS));
  if (next >= totalBytes) {
    finishInstall(state, id);
    return;
  }
  patchInstall(state, id, { receivedBytes: next });
}

function startTicking(state: LlmMockState, id: string): void {
  if (!state.timers.has(id)) {
    state.timers.set(id, setInterval(tickInstall.bind(null, state, id), INSTALL_TICK_MS));
  }
}

function install(state: LlmMockState, id: string): Promise<void> {
  patchInstall(state, id, { state: 'downloading', receivedBytes: 0, error: '' });
  startTicking(state, id);
  return Promise.resolve();
}

function cancelInstall(state: LlmMockState, id: string): Promise<void> {
  stopInstall(state, id);
  patchInstall(state, id, { state: 'none', receivedBytes: 0 });
  return Promise.resolve();
}

function updateFeature(
  list: WritableSignal<LlmFeature[]>,
  id: LlmCapability,
  change: Partial<LlmFeatureSettings>,
): Promise<void> {
  list.update((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  return Promise.resolve();
}

function resumeDownloads(state: LlmMockState): void {
  state
    .providers()
    .filter((item) => item.install.state === 'downloading')
    .forEach((item) => startTicking(state, item.id));
}

export function llmServiceProvider(
  providers: LlmProvider[],
  features: LlmFeature[] = LLM_FEATURES,
  scenario: LlmScenario = {},
): Provider {
  const list = signal(features);
  const state: LlmMockState = { scenario, providers: signal(providers), timers: new Map() };
  resumeDownloads(state);
  const mock: Partial<LlmService> = {
    providers: state.providers,
    features: list,
    setFeature: updateFeature.bind(null, list),
    load: () => Promise.resolve(),
    check: () => Promise.resolve(),
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    install: install.bind(null, state),
    cancelInstall: cancelInstall.bind(null, state),
    refreshUsage: refreshUsage.bind(null, state),
  };
  return { provide: LlmService, useValue: mock };
}
