import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { BackendModelId, BackendTab } from '../pages/settings.ts';
import { type BackendRemote, MODEL_REPOS, startRemote } from './backend-remote.ts';
import type { Ui } from './fixtures.ts';
import type { Sandbox } from './sandbox.ts';
// prettier-ignore
import { expect, type IpcSpy, openSettings, readSettingsJson, test as settingsTest } from './settings.ts';

export { expect } from './settings.ts';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const HOOK_SOURCE = join(here, 'sitecustomize.py');
const GPU_FILE = 'gpu.csv';
const FAIL_FILE = 'start.fail';
const HOLD_FILE = 'start.hold';
const DEVICE_COMMAND = 'backend_device_set';
const TONE_ENGINE = 'engine_tone';

export interface GpuInfo {
  readonly name: string;
  readonly vramMb: number;
  readonly driver: string;
}

export interface BackendOptions {
  readonly gpu?: GpuInfo | null;
  readonly cuda?: boolean;
  readonly models?: readonly BackendModelId[];
}

export const STUB_GPU: GpuInfo = {
  name: 'NVIDIA GeForce RTX 4070',
  vramMb: 12282,
  driver: '560.94',
};
export const STUB_GPU_HINT = 'NVIDIA GeForce RTX 4070 · 12 GB VRAM · driver 560.94';
export const UPDATED_GPU: GpuInfo = {
  name: 'NVIDIA GeForce RTX 5090',
  vramMb: 32607,
  driver: '572.16',
};
export const UPDATED_GPU_HINT = 'NVIDIA GeForce RTX 5090 · 31.8 GB VRAM · driver 572.16';
export const CUDA_VERSION = '12.4';
export const CUDA_ESTIMATE_BYTES = 1_077_700_558;
export const CUDA_HINT = 'Lets models run on the GPU. Version 12.4, about 1.0 GB.';
export const CUDA_PACKAGES = [
  { name: 'nvidia-cuda-runtime-cu12', version: '12.4.127' },
  { name: 'nvidia-cublas-cu12', version: '12.4.5.8' },
  { name: 'nvidia-cudnn-cu12', version: '9.1.0.70' },
];

export const MODEL_SIZES: Readonly<Record<BackendModelId, number>> = {
  'vieneu-turbo': 2_248_495_734,
  'vieneu-nano': 419_935_807,
  omnivoice: 4_889_931_874,
};

export const STATUS_RUNNING = 'Running';
export const STATUS_STARTING = 'Starting';
export const STATUS_STOPPED = 'Stopped';
export const STATUS_ERROR = 'Error';
export const FACT_LABELS = ['Address', 'Version', 'Python', 'Uptime'];
export const MISSING = '—';
export const MSG_HEALTH_OK = /^Health check OK · \d+ ms · \S.*$/;
export const MSG_SERVER_STOPPED = 'The server is not running.';
export const MSG_SERVER_STARTING = 'Starting the server…';
export const MSG_SERVER_FAILED = 'The server stopped with an error.';
export const ERROR_UNRESPONSIVE = 'The local backend stopped responding';
export const ERROR_EXITED = 'backend exited early';
export const NOTE_RESTART = 'Restarting the server interrupts running speech tasks';
export const NOTE_CPU = 'Without CUDA, models run on the CPU';
export const GPU_NONE = 'No NVIDIA GPU was found on this machine.';
export const GPU_DETECTED = 'Detected';
export const GPU_NOT_FOUND = 'Not found';
export const CUDA_NEED_GPU = 'Requires an NVIDIA GPU.';
export const CUDA_INSTALLED = 'Installed';
export const DEVICE_CPU = 'CPU';
export const DEVICE_GPU = 'GPU (CUDA)';
export const DEVICE_READY = 'Where models run. The GPU needs the CUDA runtime.';
export const DEVICE_NEED_CUDA = 'Install the CUDA runtime to use the GPU.';
export const CPU_WARNING = 'This machine will run it on the CPU; expect slow generation.';
export const MODEL_NONE = 'Not installed';
export const MODEL_DOWNLOADING = 'Downloading';
export const MODEL_INSTALLED = 'Installed';
export const MODEL_ERROR = 'Error';
export const MODEL_MSG_NONE = 'Not downloaded yet.';
export const MODEL_MSG_READY = 'Ready to use.';
export const MODEL_MSG_FAILED = 'The download failed.';
export const MODELS_HINT = 'Downloaded models are stored on this machine only.';
export const PROGRESS_TEXT = /^\s*\d+(\.\d)? (KB|MB) \/ \d+(\.\d)? (KB|MB) · \d+%\s*$/;

function cmdScript(stateDir: string): string {
  const file = join(stateDir, GPU_FILE);
  return `@echo off\r\nif not exist "${file}" exit /b 9\r\ntype "${file}"\r\nexit /b 0\r\n`;
}

function gpuLine(gpu: GpuInfo): string {
  return `${gpu.name}, ${gpu.vramMb}, ${gpu.driver}\r\n`;
}

function restoreEnv(saved: ReadonlyMap<string, string | undefined>): void {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyEnv(values: Readonly<Record<string, string>>): Map<string, string | undefined> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key]);
    process.env[key] = value;
  }
  return saved;
}

function listeners(netstat: string, port: number): string[] {
  const pids = new Set<string>();
  for (const line of netstat.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields[1]?.endsWith(`:${port}`) && fields[3] === 'LISTENING' && fields[4]) {
      pids.add(fields[4]);
    }
  }
  return [...pids];
}

async function writeManifest(dir: string, manifest: Record<string, unknown>): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'manifest.json'),
    JSON.stringify({ ...manifest, completedAt: new Date().toISOString() }, null, 2),
  );
}

export class BackendStub {
  constructor(
    private readonly sandbox: Sandbox,
    readonly remote: BackendRemote,
  ) {}

  get stateDir(): string {
    return join(this.sandbox.root, 'backend-stub');
  }

  get hookDir(): string {
    return join(this.sandbox.root, 'backend-hook');
  }

  get smi(): string {
    return join(this.stateDir, 'nvidia-smi.cmd');
  }

  get modelsDir(): string {
    return join(this.sandbox.dataDir, 'models');
  }

  get cudaDir(): string {
    return join(this.sandbox.dataDir, 'runtime', 'cuda');
  }

  get logsDir(): string {
    return join(this.sandbox.dataDir, 'logs');
  }

  modelDir(id: BackendModelId): string {
    return join(this.modelsDir, id);
  }

  env(): Record<string, string> {
    return {
      HF_ENDPOINT: this.remote.baseUrl,
      HF_HOME: join(this.stateDir, 'hf-home'),
      HF_HUB_DISABLE_TELEMETRY: '1',
      DREAMY_PYPI_URL: this.remote.baseUrl,
      DREAMY_NVIDIA_SMI: this.smi,
      DREAMY_TTS_ENGINE: TONE_ENGINE,
      PYTHONPATH: this.hookDir,
    };
  }

  async prepare(options: BackendOptions): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
    await mkdir(this.hookDir, { recursive: true });
    await copyFile(HOOK_SOURCE, join(this.hookDir, 'sitecustomize.py'));
    await writeFile(this.smi, cmdScript(this.stateDir));
    await this.setGpu(options.gpu === undefined ? null : options.gpu);
    if (options.cuda) {
      await this.seedCuda();
    }
    for (const id of options.models ?? []) {
      await this.seedModel(id);
    }
  }

  async setGpu(gpu: GpuInfo | null): Promise<void> {
    const file = join(this.stateDir, GPU_FILE);
    if (gpu === null) {
      await rm(file, { force: true });
    } else {
      await writeFile(file, gpuLine(gpu));
    }
  }

  async seedCuda(): Promise<void> {
    await writeManifest(this.cudaDir, {
      version: CUDA_VERSION,
      packages: CUDA_PACKAGES,
      totalBytes: CUDA_ESTIMATE_BYTES,
    });
  }

  async seedModel(id: BackendModelId): Promise<void> {
    await writeManifest(this.modelDir(id), {
      id,
      source: MODEL_REPOS[id],
      files: [],
      totalBytes: MODEL_SIZES[id],
    });
  }

  async holdStart(): Promise<void> {
    await writeFile(join(this.hookDir, HOLD_FILE), '');
  }

  async releaseStart(): Promise<void> {
    await rm(join(this.hookDir, HOLD_FILE), { force: true });
  }

  async failStart(): Promise<void> {
    await writeFile(join(this.hookDir, FAIL_FILE), '');
  }

  async recoverStart(): Promise<void> {
    await rm(join(this.hookDir, FAIL_FILE), { force: true });
  }

  async kill(port: number): Promise<void> {
    const { stdout } = await run('netstat', ['-ano', '-p', 'TCP']);
    const pids = listeners(stdout, port);
    expect(pids, `a backend process listens on port ${port}`).not.toEqual([]);
    for (const pid of pids) {
      await run('taskkill', ['/PID', pid, '/T', '/F']).catch(() => undefined);
    }
  }

  async savedDevice(): Promise<string | undefined> {
    const settings = (await readSettingsJson(this.sandbox)) as { backend?: { device?: string } };
    return settings.backend?.device;
  }

  hasModel(id: BackendModelId): boolean {
    return existsSync(this.modelDir(id));
  }

  hasCudaManifest(): boolean {
    return existsSync(join(this.cudaDir, 'manifest.json'));
  }
}

interface BackendFixtures {
  backendOptions: BackendOptions;
  backendRemote: BackendRemote;
  backend: BackendStub;
}

export const test = settingsTest.extend<BackendFixtures>({
  backendOptions: [{}, { option: true }],
  // eslint-disable-next-line no-empty-pattern
  backendRemote: async ({}, use) => {
    const remote = await startRemote();
    await use(remote);
    await remote.stop();
  },
  backend: async ({ sandbox, backendRemote }, use) => {
    await use(new BackendStub(sandbox, backendRemote));
  },
  sandbox: async ({ sandbox, backendRemote, backendOptions }, use) => {
    const stub = new BackendStub(sandbox, backendRemote);
    await stub.prepare(backendOptions);
    const saved = applyEnv(stub.env());
    await use(sandbox);
    restoreEnv(saved);
  },
});

export async function openBackendTab(ui: Ui, tab: BackendTab = 'general'): Promise<void> {
  await openSettings(ui, 'backend');
  await selectBackendTab(ui, tab);
}

export async function selectBackendTab(ui: Ui, tab: BackendTab): Promise<void> {
  const backend = ui.main.settings.backend;
  await backend.tab(tab).click();
  await expect(backend.tab(tab)).toHaveAttribute('aria-selected', 'true');
}

export async function serverPort(ui: Ui): Promise<number> {
  const address = ui.main.settings.backend.address;
  await expect(address).toHaveText(/^http:\/\/127\.0\.0\.1:\d+$/);
  return Number(/:(\d+)$/.exec((await address.textContent()) ?? '')?.[1]);
}

export async function waitForRunning(ui: Ui, timeout = 45_000): Promise<void> {
  await expect(ui.main.settings.backend.serverBadge).toHaveText(STATUS_RUNNING, { timeout });
}

export async function chooseDevice(ui: Ui, spy: IpcSpy, label: string): Promise<void> {
  await spy.install();
  await spy.mode(DEVICE_COMMAND, 'pass');
  const before = await spy.done(DEVICE_COMMAND);
  await ui.main.settings.backend.device(label).click();
  await expect.poll(() => spy.done(DEVICE_COMMAND), { timeout: 45_000 }).toBe(before + 1);
}
