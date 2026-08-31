import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, fail, run } from "./common.mjs";

const PRETTIER = join(ROOT, "node_modules", "prettier", "bin", "prettier.cjs");
const args = process.argv.slice(2);
const targets = new Set(args.filter((arg) => ["--angular", "--backend", "--desktop"].includes(arg)));
if (args.some((arg) => !["--fix", "--angular", "--backend", "--desktop"].includes(arg))) {
  console.error("Usage: node _scripts/format.mjs [--fix] [--angular] [--backend] [--desktop]");
  process.exitCode = 1;
} else {
  const fix = args.includes("--fix");
  const check = !fix;
  const allTargets = targets.size === 0;
  const checkArg = check ? ["--check"] : [];
  const venvPython = join(
    "backend",
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
  const python = process.env.PYTHON ?? (existsSync(venvPython) ? venvPython : "python");

  try {
    if (allTargets || targets.has("--backend")) {
      console.log(`${check ? "checking" : "formatting"} Python`);
      run(python, ["-m", "ruff", "format", "backend", ...checkArg]);
    }

    if (allTargets || targets.has("--desktop")) {
      console.log(`${check ? "checking" : "formatting"} Rust`);
      run("cargo", ["fmt", "--manifest-path", "desktop/Cargo.toml", ...checkArg]);
    }

    if (allTargets || targets.has("--angular")) {
      const paths = allTargets ? ["angular", "playwright"] : ["angular"];
      console.log(`${check ? "checking" : "formatting"} ${allTargets ? "Angular and Playwright" : "Angular"}`);
      run(process.execPath, [PRETTIER, check ? "--check" : "--write", ...paths]);
    }
  } catch (error) {
    fail(error);
  }
}
