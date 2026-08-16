import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP, ROOT, TRIPLE, appVersion, compress, fail, run, runShell, targetDirectory } from "./common.mjs";

const FOLDER = "DreamyStudio";
const OUTPUT = process.argv[2] ?? join(ROOT, "_output", "portable");
const PORTABLE_NOTE = "Dreamy Studio keeps its settings, logs and data in the data folder next to this file.\n";

function assemble() {
  const parts = {
    executable: join(targetDirectory(), "release", "dreamy-studio.exe"),
    ffmpeg: join(DESKTOP, "binaries", `ffmpeg-${TRIPLE}.exe`),
    python: join(DESKTOP, "resources", "python"),
    backend: join(DESKTOP, "resources", "backend"),
  };
  for (const [name, path] of Object.entries(parts)) {
    if (!existsSync(path)) throw new Error(`${name} was not found: ${path}`);
  }

  const stage = join(OUTPUT, FOLDER);
  const archive = join(OUTPUT, `DreamyStudio-${appVersion()}-win-x64-portable.zip`);
  rmSync(stage, { recursive: true, force: true });
  rmSync(archive, { force: true });
  mkdirSync(stage, { recursive: true });

  copyFileSync(parts.executable, join(stage, "DreamyStudio.exe"));
  copyFileSync(parts.ffmpeg, join(stage, "ffmpeg.exe"));
  cpSync(parts.python, join(stage, "python"), { recursive: true });
  cpSync(parts.backend, join(stage, "backend"), { recursive: true });
  writeFileSync(join(stage, "portable.txt"), PORTABLE_NOTE);

  compress(archive, OUTPUT, FOLDER);
  console.log(`portable folder: ${stage}`);
  console.log(`portable archive: ${archive}`);
}

try {
  run("node", [join(ROOT, "_scripts", "build_prepare.mjs")]);
  runShell("pnpm exec tauri build --no-bundle");
  assemble();
} catch (error) {
  fail(error);
}
