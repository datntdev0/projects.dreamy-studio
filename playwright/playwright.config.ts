import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const outputRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '_output', 'playwright');

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
