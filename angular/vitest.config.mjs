import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: { reportsDirectory: '../_output/coverage/angular' },
  },
});
