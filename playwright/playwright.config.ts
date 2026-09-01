import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

import { outputRoot } from './scripts/paths.ts';

export default defineConfig({
  outputDir: join(outputRoot, 'results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: join(outputRoot, 'report'), open: 'never' }]],
  projects: [{ name: 'desktop', testDir: 'desktop' }],
});
