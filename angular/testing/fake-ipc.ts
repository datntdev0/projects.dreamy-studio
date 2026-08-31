import { TestBed } from '@angular/core/testing';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { vi } from 'vitest';

export type IpcHandler = (args: Record<string, unknown> | undefined) => unknown;

export class FakeIpc {
  readonly handlers = new Map<string, IpcHandler>();
  readonly calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  readonly invoke = vi.fn(this.dispatch.bind(this));
  readonly channel = vi.fn(this.makeChannel.bind(this));
  readonly mediaUrl = vi.fn((scheme: string, path: string) => `${scheme}://${path}`);
  readonly onDragDrop = vi.fn(async () => () => undefined);
  fallback: IpcHandler = () => null;

  on(command: string, handler: IpcHandler): this;
  on(command: string, value: unknown): this;
  on(command: string, handler: unknown): this {
    this.handlers.set(
      command,
      typeof handler === 'function' ? (handler as IpcHandler) : () => handler,
    );
    return this;
  }

  fail(command: string, cause: unknown): this {
    this.handlers.set(command, () => {
      throw cause;
    });
    return this;
  }

  called(command: string): number {
    return this.calls.filter((call) => call.command === command).length;
  }

  lastArgs(command: string): Record<string, unknown> | undefined {
    const matches = this.calls.filter((call) => call.command === command);
    return matches[matches.length - 1]?.args;
  }

  private async dispatch(command: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    const handler = this.handlers.get(command) ?? this.fallback;
    return handler(args);
  }

  private makeChannel(onMessage: (message: unknown) => void): {
    onmessage: (message: unknown) => void;
  } {
    return { onmessage: onMessage };
  }
}

export function provideFakeIpc(ipc: FakeIpc): {
  provide: typeof DesktopIpcService;
  useValue: FakeIpc;
} {
  return { provide: DesktopIpcService, useValue: ipc };
}

export function setupIpc(): FakeIpc {
  const ipc = new FakeIpc();
  TestBed.configureTestingModule({ providers: [provideFakeIpc(ipc)] });
  return ipc;
}
