import { join } from "node:path";
import { ROOT, buildPython, run } from "./common.mjs";

const ESLINT = join(ROOT, "node_modules", "eslint", "bin", "eslint.js");
const args = process.argv.slice(2);
const targets = new Set(args.filter((arg) => ["--angular", "--backend", "--desktop"].includes(arg)));
if (args.some((arg) => !["--fix", "--angular", "--backend", "--desktop"].includes(arg))) {
  console.error("Usage: node _scripts/lint.mjs [--fix] [--angular] [--backend] [--desktop]");
  process.exitCode = 1;
} else {
  const fix = args.includes("--fix");
  const allTargets = targets.size === 0;
  const python = buildPython();

  let failed = false;
  function lint(label, command, commandArgs, options = {}) {
    console.log(`${fix ? "fixing" : "linting"} ${label}`);
    try {
      run(command, commandArgs, options);
      console.log(`${label} passed`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      failed = true;
    }
  }

  if (allTargets || targets.has("--backend")) {
    lint("Python", python, ["-m", "ruff", "check", "backend", ...(fix ? ["--fix"] : [])]);
  }
  if (allTargets || targets.has("--desktop")) {
    lint("Rust", "cargo", [
      "clippy",
      "--manifest-path",
      "desktop/Cargo.toml",
      ...(fix ? ["--fix", "--allow-dirty", "--allow-staged"] : []),
      "--",
      "-D",
      "warnings",
    ]);
  }
  if (allTargets || targets.has("--angular")) {
    const paths = allTargets ? ["angular", "playwright"] : ["angular"];
    lint(allTargets ? "Angular and Playwright" : "Angular", process.execPath, [ESLINT, ...paths, ...(fix ? ["--fix"] : [])]);
  }

  if (failed) {
    process.exitCode = 1;
  }
}
