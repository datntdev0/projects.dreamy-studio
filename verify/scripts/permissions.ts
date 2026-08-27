import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const EVERYONE = "*S-1-1-0";
const DENY_WRITE = `${EVERYONE}:(WD,AD)`;
const DENY_READ = `${EVERYONE}:(RD)`;

export async function denyWrite(folder: string): Promise<void> {
  await run("icacls", [folder, "/deny", DENY_WRITE]);
}

export async function denyRead(folder: string): Promise<void> {
  await run("icacls", [folder, "/deny", DENY_READ]);
}

export async function allowWrite(folder: string): Promise<void> {
  await run("icacls", [folder, "/remove:d", EVERYONE]);
}
