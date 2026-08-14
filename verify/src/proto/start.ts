import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { freePort } from "../app/launch.ts";
import { protoRoot, repoRoot } from "../paths.ts";

if (!existsSync(join(protoRoot, "data", "application.dreamydb"))) {
  console.error(`No seeded prototype data in ${protoRoot}. Run \`pnpm seed:proto\` first.`);
  process.exit(1);
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
