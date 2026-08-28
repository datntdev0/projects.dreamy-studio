import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "./fixtures.ts";
import type { Sandbox } from "./sandbox.ts";

const here = dirname(fileURLToPath(import.meta.url));
const STUB_SCRIPT = join(here, "provider-stub.mjs");
const SETTINGS_FILE = "settings.json";
const POLL_MS = 100;

export type ProviderId = "claude" | "codex";
export type ProviderFeature = "translation" | "knowledge" | "assistant";
export type ProviderPurpose = "translation" | "candidates" | "facts" | "unknown";

export type ProviderMode =
  | "ok"
  | "slow"
  | "hang"
  | "fail-exit"
  | "invalid-json"
  | "no-json"
  | "empty"
  | "raw"
  | "wrong-count"
  | "bad-evidence"
  | "bad-entity"
  | "no-link";

export interface ProviderAction {
  readonly mode: ProviderMode;
  readonly delayMs?: number;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly text?: string;
}

export type ProviderStep = ProviderMode | ProviderAction | null;

export interface ProviderEntity {
  readonly type: string;
  readonly name: string;
  readonly titles?: readonly string[];
  readonly aliases?: readonly string[];
}

export interface ProviderLink {
  readonly persona: string;
  readonly character: string;
}

export interface ProviderFact {
  readonly pred: string;
  readonly subject: string;
  readonly object?: string;
  readonly quote?: string;
}

export interface ProviderAnalysis {
  readonly entities?: readonly ProviderEntity[];
  readonly links?: readonly ProviderLink[];
  readonly facts?: readonly ProviderFact[];
}

export interface ProviderBehavior {
  readonly mode?: ProviderMode;
  readonly delayMs?: number;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly text?: string;
  readonly modes?: Partial<Readonly<Record<ProviderPurpose, ProviderStep>>>;
  readonly chapters?: Readonly<Record<string, ProviderStep>>;
  readonly sequence?: readonly ProviderStep[];
  readonly probe?: "ok" | "signed-out" | "broken";
  readonly translation?: { readonly tag?: boolean; readonly dictionary?: boolean };
  readonly analysis?: ProviderAnalysis;
}

export interface FeatureOptions {
  readonly model?: string;
  readonly effort?: "low" | "medium" | "high";
  readonly args?: string;
}

export interface ProviderOptions {
  readonly id?: ProviderId;
  readonly behavior?: ProviderBehavior;
  readonly features?: readonly ProviderFeature[];
  readonly featureOptions?: Partial<Readonly<Record<ProviderFeature, FeatureOptions>>>;
  readonly maxPipelines?: number;
  readonly maxTasks?: number;
  readonly bottomOpen?: boolean;
}

export interface ProviderInstall {
  readonly id: ProviderId;
  readonly stateDir: string;
  readonly executable: string;
}

export interface ProviderCall {
  readonly index: number;
  readonly kind: "run" | "probe";
  readonly at: string;
  readonly args: readonly string[];
  readonly prompt: string;
  readonly purpose: ProviderPurpose;
  readonly session: string | null;
  readonly resume: boolean;
  readonly chapters: readonly string[];
  readonly mode: string;
  readonly finished: boolean;
  readonly exitCode: number | null;
  readonly aborted: boolean;
}

interface RawEntry {
  readonly event: "start" | "end";
  readonly kind?: "run" | "probe";
  readonly probe?: string;
  readonly index?: number;
  readonly at?: string;
  readonly args?: readonly string[];
  readonly prompt?: string;
  readonly purpose?: ProviderPurpose;
  readonly session?: string | null;
  readonly resume?: boolean;
  readonly chapters?: readonly string[];
  readonly mode?: string;
  readonly exitCode?: number;
  readonly aborted?: boolean;
}

const DEFAULT_FEATURES: readonly ProviderFeature[] = ["translation", "knowledge"];

export function providerDir(sandbox: Sandbox): string {
  return join(sandbox.root, "provider");
}

export function providerExecutable(sandbox: Sandbox, id: ProviderId = "claude"): string {
  return join(providerDir(sandbox), `${id}.cmd`);
}

export function settingsFile(sandbox: Sandbox): string {
  return join(sandbox.dataDir, SETTINGS_FILE);
}

function wrapper(stateDir: string): string {
  return `@echo off\r\n"${process.execPath}" "${STUB_SCRIPT}" "${stateDir}" %*\r\nexit /b %ERRORLEVEL%\r\n`;
}

async function readSettings(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function section(settings: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = settings[key];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function writeProviderSettings(sandbox: Sandbox, options: ProviderOptions = {}): Promise<void> {
  const id = options.id ?? "claude";
  const path = settingsFile(sandbox);
  const settings = await readSettings(path);
  const llm = section(settings, "llm");
  const providers = { ...section(llm, "providers"), [id]: { path: providerExecutable(sandbox, id) } };
  const features: Record<string, unknown> = { ...section(llm, "features") };
  for (const feature of options.features ?? DEFAULT_FEATURES) {
    features[feature] = { provider: id, ...(options.featureOptions?.[feature] ?? {}) };
  }
  settings["llm"] = { ...llm, providers, features };
  if (options.maxPipelines !== undefined || options.maxTasks !== undefined) {
    const general = section(settings, "general");
    const pipelines = { ...section(general, "pipelines") };
    if (options.maxPipelines !== undefined) {
      pipelines["maxPipelines"] = options.maxPipelines;
    }
    if (options.maxTasks !== undefined) {
      pipelines["maxTasks"] = options.maxTasks;
    }
    settings["general"] = { ...general, pipelines };
  }
  if (options.bottomOpen !== undefined) {
    settings["layout"] = { ...section(settings, "layout"), bottomOpen: options.bottomOpen };
  }
  await mkdir(sandbox.dataDir, { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2));
}

export async function clearProviderSelection(sandbox: Sandbox, features: readonly ProviderFeature[] = DEFAULT_FEATURES): Promise<void> {
  const path = settingsFile(sandbox);
  const settings = await readSettings(path);
  const llm = section(settings, "llm");
  const kept: Record<string, unknown> = { ...section(llm, "features") };
  for (const feature of features) {
    delete kept[feature];
  }
  settings["llm"] = { ...llm, features: kept };
  await writeFile(path, JSON.stringify(settings, null, 2));
}

export async function installProvider(sandbox: Sandbox, options: ProviderOptions = {}): Promise<ProviderInstall> {
  const id = options.id ?? "claude";
  const stateDir = providerDir(sandbox);
  const executable = providerExecutable(sandbox, id);
  await mkdir(stateDir, { recursive: true });
  await writeFile(executable, wrapper(stateDir));
  await setBehavior(sandbox, options.behavior ?? {});
  await writeProviderSettings(sandbox, options);
  return { id, stateDir, executable };
}

export async function setBehavior(sandbox: Sandbox, behavior: ProviderBehavior): Promise<void> {
  await mkdir(providerDir(sandbox), { recursive: true });
  await writeFile(join(providerDir(sandbox), "behavior.json"), JSON.stringify(behavior, null, 2));
}

export async function currentBehavior(sandbox: Sandbox): Promise<ProviderBehavior> {
  try {
    return JSON.parse(await readFile(join(providerDir(sandbox), "behavior.json"), "utf8")) as ProviderBehavior;
  } catch {
    return {};
  }
}

export async function patchBehavior(sandbox: Sandbox, patch: ProviderBehavior): Promise<void> {
  await setBehavior(sandbox, { ...(await currentBehavior(sandbox)), ...patch });
}

export async function resetProviderCalls(sandbox: Sandbox): Promise<void> {
  const dir = providerDir(sandbox);
  await rm(join(dir, "calls.jsonl"), { force: true });
  await rm(join(dir, "runs.count"), { force: true });
  await rm(join(dir, "sessions"), { recursive: true, force: true });
}

function parseEntries(text: string): RawEntry[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RawEntry);
}

function toCall(entry: RawEntry, ends: Map<number, RawEntry>, position: number): ProviderCall {
  const end = entry.index === undefined ? undefined : ends.get(entry.index);
  return {
    index: entry.index ?? -1 - position,
    kind: entry.kind ?? "run",
    at: entry.at ?? "",
    args: entry.args ?? [],
    prompt: entry.prompt ?? "",
    purpose: entry.purpose ?? "unknown",
    session: entry.session ?? null,
    resume: entry.resume ?? false,
    chapters: entry.chapters ?? [],
    mode: entry.mode ?? "ok",
    finished: end !== undefined,
    exitCode: end?.exitCode ?? null,
    aborted: end?.aborted ?? false,
  };
}

export async function providerCalls(sandbox: Sandbox): Promise<ProviderCall[]> {
  let text = "";
  try {
    text = await readFile(join(providerDir(sandbox), "calls.jsonl"), "utf8");
  } catch {
    return [];
  }
  const entries = parseEntries(text);
  const ends = new Map<number, RawEntry>();
  for (const entry of entries) {
    if (entry.event === "end" && entry.index !== undefined) {
      ends.set(entry.index, entry);
    }
  }
  return entries.filter((entry) => entry.event === "start").map((entry, position) => toCall(entry, ends, position));
}

export async function runCalls(sandbox: Sandbox, purpose?: ProviderPurpose): Promise<ProviderCall[]> {
  const calls = await providerCalls(sandbox);
  return calls.filter((call) => call.kind === "run" && (purpose === undefined || call.purpose === purpose));
}

export async function waitForRunCalls(sandbox: Sandbox, count: number, purpose?: ProviderPurpose, timeoutMs = 30_000): Promise<ProviderCall[]> {
  const deadline = Date.now() + timeoutMs;
  let calls = await runCalls(sandbox, purpose);
  while (calls.length < count && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, POLL_MS));
    calls = await runCalls(sandbox, purpose);
  }
  if (calls.length < count) {
    throw new Error(`expected ${count} provider calls, saw ${calls.length}`);
  }
  return calls;
}

export class ProviderStub {
  constructor(private readonly sandbox: Sandbox) {}

  get dir(): string {
    return providerDir(this.sandbox);
  }

  get executable(): string {
    return providerExecutable(this.sandbox);
  }

  setBehavior(behavior: ProviderBehavior): Promise<void> {
    return setBehavior(this.sandbox, behavior);
  }

  patchBehavior(patch: ProviderBehavior): Promise<void> {
    return patchBehavior(this.sandbox, patch);
  }

  calls(): Promise<ProviderCall[]> {
    return providerCalls(this.sandbox);
  }

  runs(purpose?: ProviderPurpose): Promise<ProviderCall[]> {
    return runCalls(this.sandbox, purpose);
  }

  waitForRuns(count: number, purpose?: ProviderPurpose, timeoutMs?: number): Promise<ProviderCall[]> {
    return waitForRunCalls(this.sandbox, count, purpose, timeoutMs);
  }

  reset(): Promise<void> {
    return resetProviderCalls(this.sandbox);
  }

  clearSelection(features?: readonly ProviderFeature[]): Promise<void> {
    return clearProviderSelection(this.sandbox, features);
  }
}

interface ProviderFixtures {
  providerOptions: ProviderOptions;
  provider: ProviderStub;
}

export const test = base.extend<ProviderFixtures>({
  providerOptions: [{}, { option: true }],
  sandbox: async ({ sandbox, providerOptions }, use) => {
    await installProvider(sandbox, providerOptions);
    await use(sandbox);
  },
  provider: async ({ sandbox }: { sandbox: Sandbox }, use) => {
    await use(new ProviderStub(sandbox));
  },
});

export { expect } from "./fixtures.ts";
