import type { Page } from "@playwright/test";

interface TauriInternals {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  transformCallback(callback: (message: unknown) => void): number;
}

interface IpcCall {
  readonly command: string;
  readonly args: Record<string, unknown>;
  readonly channelKey: string | null;
}

interface IpcReply {
  readonly ok: boolean;
  readonly value: unknown;
}

async function run(call: IpcCall): Promise<IpcReply> {
  const internals = (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
  const args = { ...call.args };
  if (call.channelKey !== null) {
    args[call.channelKey] = `__CHANNEL__:${internals.transformCallback(() => undefined)}`;
  }
  try {
    return { ok: true, value: await internals.invoke(call.command, args) };
  } catch (error) {
    return { ok: false, value: error };
  }
}

export async function invoke<T>(page: Page, command: string, args: Record<string, unknown> = {}, channelKey: string | null = null): Promise<T> {
  const call: IpcCall = { command, args, channelKey };
  const reply = await page.evaluate(run, call);
  if (!reply.ok) {
    throw new Error(`${command} failed: ${JSON.stringify(reply.value)}`);
  }
  return reply.value as T;
}

export async function enterWorkspace(page: Page, path: string): Promise<void> {
  await invoke(page, "workspace_load", { path }, "channel");
  await invoke(page, "workspace_enter");
}
