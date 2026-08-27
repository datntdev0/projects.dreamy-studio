import type { Page } from "@playwright/test";

export type PickerAnswer = string | string[] | null;

interface PickerState {
  queues: Record<string, PickerAnswer[]>;
  calls: Record<string, number>;
  args: Record<string, unknown>;
}

interface PickerWindow {
  __dreamyPicks?: PickerState;
}

function wrapFetch(): void {
  const scope = window as unknown as PickerWindow;
  if (scope.__dreamyPicks) {
    return;
  }
  const state: PickerState = { queues: {}, calls: {}, args: {} };
  scope.__dreamyPicks = state;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const command = target.pathname.replace(/^\//, "");
    const isPicker = command === "folder_pick" || command.endsWith("_pick");
    if (target.hostname !== "ipc.localhost" || !isPicker) {
      return original(input, init);
    }
    state.calls[command] = (state.calls[command] ?? 0) + 1;
    state.args[command] = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const queue = state.queues[command] ?? [];
    if (queue.length === 0) {
      const message = JSON.stringify(`unexpected native picker call: ${command}`);
      return Promise.resolve(new Response(message, { headers: { "Content-Type": "application/json" } }));
    }
    const headers = { "Content-Type": "application/json", "Tauri-Response": "ok" };
    return Promise.resolve(new Response(JSON.stringify(queue.shift()), { headers }));
  };
}

function pushAnswer(request: { command: string; answer: PickerAnswer }): void {
  const state = (window as unknown as PickerWindow).__dreamyPicks;
  if (!state) {
    throw new Error("the picker stub is not installed");
  }
  const queue = state.queues[request.command] ?? [];
  queue.push(request.answer);
  state.queues[request.command] = queue;
}

function readCalls(command: string): number {
  return (window as unknown as PickerWindow).__dreamyPicks?.calls[command] ?? 0;
}

function readArgs(command: string): unknown {
  return (window as unknown as PickerWindow).__dreamyPicks?.args[command] ?? null;
}

export async function installPicker(page: Page): Promise<void> {
  await page.evaluate(wrapFetch);
}

export class PickerStub {
  constructor(private readonly pageOf: () => Page) {}

  async queue(command: string, answer: PickerAnswer): Promise<void> {
    await this.pageOf().evaluate(pushAnswer, { command, answer });
  }

  calls(command: string): Promise<number> {
    return this.pageOf().evaluate(readCalls, command);
  }

  lastArgs(command: string): Promise<unknown> {
    return this.pageOf().evaluate(readArgs, command);
  }
}
