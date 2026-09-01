import type { Page } from '@playwright/test';

import { launchApp, type RunningApp } from './launch.ts';
import { installPicker } from './picker.ts';
import type { Sandbox } from './sandbox.ts';

export class AppSession {
  private running: RunningApp | null = null;

  constructor(private readonly sandbox: Sandbox) {}

  get page(): Page {
    if (this.running === null) {
      throw new Error('the app is not running');
    }
    return this.running.page;
  }

  get isRunning(): boolean {
    return this.running !== null;
  }

  async start(): Promise<void> {
    if (this.running !== null) {
      return;
    }
    const running = await launchApp({
      dataDir: this.sandbox.dataDir,
      webviewDir: this.sandbox.webviewDir,
    });
    this.running = running;
    await installPicker(running.page);
  }

  async stop(): Promise<void> {
    const running = this.running;
    this.running = null;
    await running?.stop();
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}

export async function startApp(sandbox: Sandbox): Promise<AppSession> {
  const session = new AppSession(sandbox);
  await session.start();
  return session;
}
