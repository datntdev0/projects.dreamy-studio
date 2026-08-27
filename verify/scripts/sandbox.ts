import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REMOVE_ATTEMPTS = 5;
const REMOVE_DELAY_MS = 300;

export interface Sandbox {
  readonly root: string;
  readonly dataDir: string;
  readonly webviewDir: string;
  readonly workspacesDir: string;
  readonly filesDir: string;
  workspace(name: string): string;
  file(name: string): string;
  dispose(): Promise<void>;
}

function pause(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function removeTree(root: string): Promise<void> {
  for (let attempt = 1; attempt <= REMOVE_ATTEMPTS; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch {
      await pause(REMOVE_DELAY_MS);
    }
  }
}

export async function createSandbox(): Promise<Sandbox> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dreamy-verify-")));
  const workspacesDir = join(root, "workspaces");
  const filesDir = join(root, "files");
  await mkdir(workspacesDir, { recursive: true });
  await mkdir(filesDir, { recursive: true });
  return {
    root,
    dataDir: join(root, "data"),
    webviewDir: join(root, "webview"),
    workspacesDir,
    filesDir,
    workspace: (name) => join(workspacesDir, name),
    file: (name) => join(filesDir, name),
    dispose: () => removeTree(root),
  };
}
