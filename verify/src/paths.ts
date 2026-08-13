import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const WORKSPACE_NAME = "Library prototype";
export const verifyRoot = resolve(here, "..");
export const repoRoot = resolve(verifyRoot, "..");
export const outputRoot = join(repoRoot, "_output", "verify");
export const fixtureRoot = join(outputRoot, "fixture");
export const fixtureWorkspace = join(fixtureRoot, WORKSPACE_NAME);
export const seedRoot = join(outputRoot, "seed");
export const runRoot = join(outputRoot, "run");
export const prototypeRoot = join(repoRoot, "_proto");
export const prototypeData = join(prototypeRoot, "1.library", "js", "library-data.js");
export const prototypeMedia = join(prototypeRoot, "shared", "assets", "library");
export const defaultExecutable = join(repoRoot, "_output", "desktop", "target", "debug", "dreamy-studio.exe");

export function appExecutable(): string {
  return process.env["DREAMY_EXE"] ?? defaultExecutable;
}

export const prototypeLibraryPage = join(prototypeRoot, "1.library", "1.library.html");
export const baselineRoot = join(verifyRoot, "baseline");
