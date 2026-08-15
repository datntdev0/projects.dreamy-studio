import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { enterWorkspace } from "../app/ipc.ts";
import { launchApp } from "../app/launch.ts";
import { fixtureRoot, fixtureWorkspace, seedRoot, WORKSPACE_NAME } from "../paths.ts";
import { loadPrototype } from "./prototype.ts";
import { seedLibrary } from "./seed.ts";
import { pinMetadata, pinPosters } from "./metadata.ts";
import { writeCorpus } from "./corpus.ts";
import { loadNovels, pinNovels, seedNovels } from "./novels.ts";

export function fixtureExists(): boolean {
  return existsSync(join(fixtureWorkspace, "workspace.dreamydb"));
}

export function seededWorkspace(root: string): string {
  return join(root, "workspaces", WORKSPACE_NAME);
}

export async function seedAppRoot(root: string): Promise<void> {
  await writeCorpus();
  const data = await loadPrototype();
  const novels = await loadNovels();
  const workspace = seededWorkspace(root);
  await rm(root, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  const app = await launchApp({ dataDir: join(root, "data"), webviewDir: join(root, "webview") });
  let seeded;
  let seededNovels;
  try {
    await enterWorkspace(app.page, workspace);
    seeded = await seedLibrary(app.page, data, join(root, "media"));
    seededNovels = await seedNovels(app.page, novels, join(root, "media"));
  } finally {
    await app.stop();
  }
  pinMetadata(workspace, data, seeded);
  pinPosters(workspace, seeded);
  pinNovels(workspace, novels, seededNovels);
  await rm(join(root, "media"), { recursive: true, force: true });
}

export async function buildFixture(): Promise<void> {
  await seedAppRoot(seedRoot);
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
  await cp(seededWorkspace(seedRoot), fixtureWorkspace, { recursive: true });
  await rm(seedRoot, { recursive: true, force: true });
}
