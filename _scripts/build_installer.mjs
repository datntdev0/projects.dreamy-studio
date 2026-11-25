import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT, fail, requireStaged, runShell, targetDirectory } from "./common.mjs";

const BUNDLES = ["nsis", "msi"];
const OUTPUT = join(ROOT, "_output", "installer");

function collect(bundleDir) {
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });

  const moved = [];
  for (const bundle of BUNDLES) {
    const directory = join(bundleDir, bundle);
    if (!existsSync(directory)) throw new Error(`${bundle} bundle was not produced: ${directory}`);
    for (const name of readdirSync(directory)) {
      renameSync(join(directory, name), join(OUTPUT, name));
      moved.push(name);
    }
  }
  return moved;
}

try {
  const bundleDir = join(targetDirectory(), "release", "bundle");
  rmSync(bundleDir, { recursive: true, force: true });

  requireStaged();
  runShell(
    `pnpm exec tauri build --bundles ${BUNDLES.join(",")} --config desktop/tauri.installer.conf.json`,
  );

  for (const name of collect(bundleDir)) console.log(`installer: ${join(OUTPUT, name)}`);
} catch (error) {
  fail(error);
}
