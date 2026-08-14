import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { freePort } from "../app/launch.ts";
import { seedAppRoot } from "../fixture/build.ts";
import { appExecutable, protoRoot, repoRoot } from "../paths.ts";

const RESET_FLAG = "--reset";

function seeded(): boolean {
  return existsSync(join(protoRoot, "data", "application.dreamydb"));
}

function pnpm(args: string[]): number {
  return spawnSync("pnpm", args, { cwd: repoRoot, stdio: "inherit", shell: true }).status ?? 1;
}

async function prepare(reset: boolean): Promise<void> {
  if (reset) {
    await rm(protoRoot, { recursive: true, force: true });
  }
  if (seeded()) {
    return;
  }
  if (!existsSync(appExecutable()) && pnpm(["run", "build", "--debug", "--no-bundle"]) !== 0) {
    throw new Error("cannot build the app used to seed the prototype data");
  }
  console.log(`Seeding the prototype data into ${protoRoot}`);
  await seedAppRoot(protoRoot);
}

async function devConfig(port: number): Promise<string> {
  const path = join(protoRoot, "tauri.proto.json");
  const build = {
    devUrl: `http://localhost:${port}`,
    beforeDevCommand: `pnpm --filter dreamy-studio-angular run serve --port ${port}`,
  };
  await writeFile(path, JSON.stringify({ build }, null, 2));
  return path;
}

await prepare(process.argv.includes(RESET_FLAG));
const dataDir = join(protoRoot, "data");
const port = await freePort();
const config = await devConfig(port);
console.log(`Starting the app with --data-dir ${dataDir} (dev server on port ${port})`);
const child = spawn("pnpm", ["exec", "tauri", "dev", "--config", `"${config}"`, "--", "--", "--data-dir", `"${dataDir}"`], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: join(protoRoot, "webview") },
});
child.on("exit", (code) => process.exit(code ?? 0));
