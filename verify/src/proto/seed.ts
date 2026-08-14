import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { seedAppRoot } from "../fixture/build.ts";
import { protoRoot, repoRoot } from "../paths.ts";

function buildApp(): void {
  const result = spawnSync("pnpm", ["run", "build", "--debug", "--no-bundle"], { cwd: repoRoot, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error("cannot build the app used to seed the prototype data");
  }
}

// `tauri dev` overwrites the debug executable with one that has no embedded frontend, so always rebuild before seeding.
if (process.env["DREAMY_EXE"] === undefined) {
  buildApp();
}
await rm(protoRoot, { recursive: true, force: true });
console.log(`Seeding the prototype data into ${protoRoot}`);
await seedAppRoot(protoRoot);
console.log("Done. Run `pnpm start:proto` to open it.");
