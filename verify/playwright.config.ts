import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { baselineRoot, outputRoot } from "./src/paths.ts";
import type { Target } from "./src/screens.ts";

export default defineConfig<{ target: Target }>({
  testDir: "tests",
  outputDir: join(outputRoot, "results"),
  snapshotDir: baselineRoot,
  snapshotPathTemplate: "{snapshotDir}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      threshold: 0.1,
      maxDiffPixelRatio: 0.01,
    },
  },
  reporter: [["list"], ["html", { outputFolder: join(outputRoot, "report"), open: "never" }], ["./src/reporter.ts"]],
  projects: [
    { name: "prototype", use: { target: "prototype" } },
    { name: "app", use: { target: "app" } },
  ],
});
