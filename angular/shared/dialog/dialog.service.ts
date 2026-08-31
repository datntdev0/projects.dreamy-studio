import { Injectable, signal } from '@angular/core';

import { DialogOptions, DialogRequest } from './dialog.models';

type Resolver = (value: boolean) => void;

function messageOf(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return typeof cause === 'string' ? cause : '';
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private nextId = 1;
  private resolver: Resolver | null = null;

  readonly current = signal<DialogRequest | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly acknowledged = signal(false);

  ask(options: DialogOptions): Promise<boolean> {
    this.settle(false);
    this.busy.set(false);
    this.error.set(null);
    this.acknowledged.set(false);
    this.current.set({ id: this.nextId++, options });
    return new Promise<boolean>(this.keep.bind(this));
  }

  acknowledge(value: boolean): void {
    this.acknowledged.set(value);
  }

  async accept(): Promise<void> {
    const request = this.current();
    if (request === null || this.busy()) {
      return;
    }
    if (request.options.acknowledge && !this.acknowledged()) {
      return;
    }
    if (request.options.onConfirm) {
      this.busy.set(true);
      this.error.set(null);
      try {
        await request.options.onConfirm();
      } catch (cause) {
        this.finishFailed(request, cause);
        return;
      }
      this.busy.set(false);
    }
    if (this.current() === request) {
      this.settle(true);
    }
  }

  cancel(): void {
    if (this.busy()) {
      return;
    }
    this.settle(false);
  }

  private keep(resolve: Resolver): void {
    this.resolver = resolve;
  }

  private finishFailed(request: DialogRequest, cause: unknown): void {
    this.busy.set(false);
    if (this.current() === request) {
      this.error.set(messageOf(cause));
    }
  }

  private settle(value: boolean): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.current.set(null);
    if (resolve) {
      resolve(value);
    }
  }
}
