import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { launchApp } from "../app/launch.ts";
import { fixtureRoot, fixtureWorkspace, seedRoot, WORKSPACE_NAME } from "../paths.ts";
import { loadPrototype } from "./prototype.ts";
import { seedLibrary } from "./seed.ts";
import { pinMetadata } from "./metadata.ts";

export function fixtureExists(): boolean {
  return existsSync(join(fixtureWorkspace, "workspace.dreamydb"));
}

export async function buildFixture(): Promise<void> {
  const data = await loadPrototype();
  const workspace = join(seedRoot, "workspaces", WORKSPACE_NAME);
  await rm(seedRoot, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  const app = await launchApp({ dataDir: join(seedRoot, "data"), webviewDir: join(seedRoot, "webview") });
  let seeded;
  try {
    seeded = await seedLibrary(app.page, workspace, data, join(seedRoot, "media"));
  } finally {
    await app.stop();
  }
  pinMetadata(workspace, data, seeded);
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
  await cp(workspace, fixtureWorkspace, { recursive: true });
  await rm(seedRoot, { recursive: true, force: true });
}
