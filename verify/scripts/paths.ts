import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const verifyRoot = resolve(here, "..");
export const repoRoot = resolve(verifyRoot, "..");
export const outputRoot = join(repoRoot, "_output", "verify");
export const defaultExecutable = join(repoRoot, "_output", "desktop", "target", "debug", "dreamy-studio.exe");

export function appExecutable(): string {
  return process.env["DREAMY_EXE"] ?? defaultExecutable;
}
