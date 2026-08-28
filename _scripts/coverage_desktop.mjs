import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP, ROOT, fail, run } from "./common.mjs";
import { renderHtml } from "./coverage.mjs";

const MANIFEST = join(DESKTOP, "Cargo.toml");
const OUTPUT = join(ROOT, "_output", "coverage", "desktop");
const LCOV = join(OUTPUT, "lcov.info");
const TARGET = join(ROOT, "_output", "desktop", "target-cov");
const IGNORE = String.raw`(\.test\.rs$|[\/]test[\/])`;
const env = { ...process.env, CARGO_TARGET_DIR: TARGET };

function cargo(args) {
  run("cargo", ["llvm-cov", ...args, "--manifest-path", MANIFEST], { env });
}

try {
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });
  cargo(["--no-report"]);
  cargo(["report", "--ignore-filename-regex", IGNORE, "--lcov", "--output-path", LCOV]);
  renderHtml(LCOV, DESKTOP, join(OUTPUT, "html"));
  console.log(`Desktop coverage report: ${join(OUTPUT, "html", "index.html")}`);
} catch (error) {
  fail(error);
}
