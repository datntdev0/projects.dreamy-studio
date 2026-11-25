import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD_DIR, ROOT, STAGED_PARTS, appVersion, compress, fail, requireStaged, runShell, targetDirectory } from "./common.mjs";

const FOLDER = "DreamyStudio";
const OUTPUT = process.argv[2] ?? join(ROOT, "_output", "portable");
const CONFIG_FILE = "DreamyStudio.config";
const PORTABLE_LAYOUT = {
  AppDataDir: "./appdata",
  RuntimeDir: "./runtime",
  ToolboxDir: "./toolbox",
};

function assemble() {
  const executable = join(targetDirectory(), "release", "dreamy-studio.exe");
  if (!existsSync(executable)) throw new Error(`executable was not found: ${executable}`);

  const stage = join(OUTPUT, FOLDER);
  const archive = join(OUTPUT, `DreamyStudio-${appVersion()}-win-x64-portable.zip`);
  rmSync(stage, { recursive: true, force: true });
  rmSync(archive, { force: true });
  mkdirSync(stage, { recursive: true });

  copyFileSync(executable, join(stage, "DreamyStudio.exe"));
  for (const part of STAGED_PARTS) {
    cpSync(join(BUILD_DIR, part), join(stage, part), { recursive: true });
  }
  writeFileSync(join(stage, CONFIG_FILE), `${JSON.stringify(PORTABLE_LAYOUT, null, 2)}
`);

  compress(archive, OUTPUT, FOLDER);
  console.log(`portable folder: ${stage}`);
  console.log(`portable archive: ${archive}`);
}

try {
  requireStaged();
  runShell("pnpm exec tauri build --no-bundle");
  assemble();
} catch (error) {
  fail(error);
}
