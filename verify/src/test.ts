import { test as base, expect } from "@playwright/test";
import type { Target } from "./screens.ts";
import { startRuntime, type Runtime, type Studio } from "./studio.ts";

interface TestFixtures {
  studio: Studio;
}

interface WorkerFixtures {
  target: Target;
  runtime: Runtime;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  target: ["app", { option: true, scope: "worker" }],
  runtime: [
    async ({ target }, use) => {
      const runtime = await startRuntime(target);
      await use(runtime);
      await runtime.stop();
    },
    { scope: "worker", timeout: 240_000 },
  ],
  studio: async ({ runtime }, use) => {
    await runtime.studio.reset();
    await use(runtime.studio);
  },
});

export { expect };
