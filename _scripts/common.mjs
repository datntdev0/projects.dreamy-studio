import { spawnSync } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DESKTOP = join(ROOT, "desktop");
export const TRIPLE = "x86_64-pc-windows-msvc";

const BSDTAR = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const DOWNLOAD_ATTEMPTS = 3;

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

export function extract(archive, destination, patterns = []) {
  const filters = patterns.flatMap((pattern) => ["--include", pattern]);
  run(BSDTAR, ["-xf", archive, "-C", destination, ...filters]);
}

export function compress(archive, directory, name) {
  run(BSDTAR, ["-a", "-c", "-f", archive, "-C", directory, name]);
}

export async function download(url, file, headers = {}) {
  let failure;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers, redirect: "follow" });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
      return;
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

export function fail(error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
