import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const playwrightRoot = resolve(here, "..");
export const repoRoot = resolve(playwrightRoot, "..");
export const outputRoot = join(repoRoot, "_output", "playwright");
export const defaultExecutable = join(repoRoot, "_output", "desktop", "target", "debug", "dreamy-studio.exe");

export function appExecutable(): string {
  return process.env["DREAMY_EXE"] ?? defaultExecutable;
}

export const workspaceMigrationsDir = join(repoRoot, "desktop", "src", "infra", "storage", "migrations", "ws");
