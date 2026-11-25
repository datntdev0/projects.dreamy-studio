import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DESKTOP = join(ROOT, "desktop");
export const BUILD_DIR = join(ROOT, "_output", "desktop", "build");

const BSDTAR = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");

export function run(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: ROOT, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} exited with code ${result.status}`);
}

export function runShell(command) {
  const result = spawnSync(command, { cwd: ROOT, stdio: "inherit", shell: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`"${command}" exited with code ${result.status}`);
}

export function targetDirectory() {
  const result = spawnSync("cargo", ["metadata", "--no-deps", "--format-version", "1"], {
    cwd: DESKTOP,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`cargo metadata failed: ${result.stderr}`);
  return JSON.parse(result.stdout).target_directory;
}

export function appVersion() {
  return JSON.parse(readFileSync(join(DESKTOP, "tauri.conf.json"), "utf8")).version;
}

export function compress(archive, directory, name) {
  run(BSDTAR, ["-a", "-c", "-f", archive, "-C", directory, name]);
}

export const STAGED_PARTS = ["backend", "vcruntime"];

export function requireStaged() {
  for (const part of STAGED_PARTS) {
    const path = join(BUILD_DIR, part);
    if (!existsSync(path)) throw new Error(`${path} is missing; run "pnpm build:prepare" first`);
  }
}

export function buildPython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const windows = process.platform === "win32";
  const venv = join(ROOT, "backend", ".venv", windows ? "Scripts" : "bin", windows ? "python.exe" : "python");
  return existsSync(venv) ? venv : "python";
}

export function fail(error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
