import { test as base } from "@playwright/test";
import { MainPage } from "../pages/main.ts";
import { SplashPage } from "../pages/splash.ts";
import { AppSession, startApp } from "./app.ts";
import { PickerStub } from "./picker.ts";
import { createSandbox, type Sandbox } from "./sandbox.ts";

export interface Ui {
  readonly splash: SplashPage;
  readonly main: MainPage;
}

interface Fixtures {
  sandbox: Sandbox;
  app: AppSession;
  picker: PickerStub;
  ui: Ui;
}

export const test = base.extend<Fixtures>({
  sandbox: async ({}, use) => {
    const sandbox = await createSandbox();
    await use(sandbox);
    await sandbox.dispose();
  },
  app: async ({ sandbox }, use, testInfo) => {
    const session = await startApp(sandbox);
    await use(session);
    if (testInfo.status !== testInfo.expectedStatus && session.isRunning) {
      const body = await session.page.screenshot().catch(() => null);
      if (body) {
        await testInfo.attach("failure", { body, contentType: "image/png" });
      }
    }
    await session.stop();
  },
  picker: async ({ app }, use) => {
    await use(new PickerStub(() => app.page));
  },
  ui: async ({ app }, use) => {
    await use({
      get splash() {
        return new SplashPage(app.page);
      },
      get main() {
        return new MainPage(app.page);
      },
    });
  },
});

export { expect } from "@playwright/test";
