import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT, fail, runShell } from "./common.mjs";
import { renderHtml } from "./coverage.mjs";

const ANGULAR = join(ROOT, "angular");
const OUTPUT = join(ROOT, "_output", "coverage", "angular");

try {
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });
  runShell("pnpm --filter dreamy-studio-angular run test:coverage");
  rmSync(join(OUTPUT, "lcov-report"), { recursive: true, force: true });
  renderHtml(join(OUTPUT, "lcov.info"), ANGULAR, join(OUTPUT, "html"));
  console.log(`Angular coverage report: ${join(OUTPUT, "html", "index.html")}`);
} catch (error) {
  fail(error);
}
