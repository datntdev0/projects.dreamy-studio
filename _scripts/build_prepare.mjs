import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BUILD_DIR, DESKTOP, ROOT, buildPython, fail, run } from "./common.mjs";

const VC_RUNTIME_DIR = join(BUILD_DIR, "vcruntime");
const BACKEND_DIR = join(BUILD_DIR, "backend");
const BACKEND_SOURCE = join(ROOT, "backend");
const SETUP_MANIFEST = join(DESKTOP, "setup.manifest.json");
const PLATFORM = "win_amd64";

function runtimePythonVersion() {
  const manifest = JSON.parse(readFileSync(SETUP_MANIFEST, "utf8"));
  const python = manifest.items.find((item) => item.id === "python");
  if (!python) throw new Error(`python is missing from ${SETUP_MANIFEST}`);
  return python.version.split(".").slice(0, 2).join(".");
}

const VC_RUNTIME_DLLS = [
  "concrt140.dll", "msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll", "msvcp140_atomic_wait.dll",
  "msvcp140_codecvt_ids.dll", "vcomp140.dll", "vcruntime140.dll", "vcruntime140_1.dll",
];

function versionKey(name) {
  return name.split(".").map((part) => part.padStart(8, "0")).join(".");
}

function visualStudioRedistDirs() {
  if (process.env.VC_REDIST_DIR) return [process.env.VC_REDIST_DIR];
  const found = [];
  for (const programs of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
    const vs = programs && join(programs, "Microsoft Visual Studio");
    if (!vs || !existsSync(vs)) continue;
    for (const year of readdirSync(vs)) {
      for (const edition of readdirSync(join(vs, year))) {
        const msvc = join(vs, year, edition, "VC", "Redist", "MSVC");
        if (!existsSync(msvc)) continue;
        for (const version of readdirSync(msvc).filter((name) => /^\d+\.\d+\.\d+$/.test(name))) {
          found.push({ key: versionKey(version), dir: join(msvc, version, "x64") });
        }
      }
    }
  }
  return found.sort((a, b) => b.key.localeCompare(a.key)).map((entry) => entry.dir);
}

function findVcRuntimeDll(name) {
  for (const dir of visualStudioRedistDirs()) {
    if (!existsSync(dir)) continue;
    for (const pack of readdirSync(dir).filter((entry) => /^Microsoft\.VC\d+\.(CRT|OpenMP)$/.test(entry))) {
      const candidate = join(dir, pack, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  const system = join(process.env.SystemRoot ?? "C:\\Windows", "System32", name);
  return existsSync(system) ? system : null;
}

function setupVcRuntime() {
  mkdirSync(VC_RUNTIME_DIR, { recursive: true });
  for (const name of VC_RUNTIME_DLLS) {
    const source = findVcRuntimeDll(name);
    if (!source) {
      throw new Error(`Visual C++ runtime ${name} was not found; install Visual Studio or set VC_REDIST_DIR`);
    }
    copyFileSync(source, join(VC_RUNTIME_DIR, name));
    console.log(`visual c++ runtime: ${source}`);
  }
}

function cleanBackendSource() {
  rmSync(join(BACKEND_SOURCE, "build"), { recursive: true, force: true });
  for (const name of readdirSync(BACKEND_SOURCE).filter((entry) => entry.endsWith(".egg-info"))) {
    rmSync(join(BACKEND_SOURCE, name), { recursive: true, force: true });
  }
}

function buildBackendWheel(python, work) {
  const wheels = join(work, "wheels");
  try {
    run(python, ["-m", "pip", "wheel", "--disable-pip-version-check", "--no-deps", "--wheel-dir", wheels, BACKEND_SOURCE]);
  } finally {
    cleanBackendSource();
  }
  const wheel = readdirSync(wheels).find((name) => name.endsWith(".whl"));
  if (!wheel) throw new Error(`no backend wheel was built in ${wheels}`);
  return join(wheels, wheel);
}

function setupBackend(work) {
  const python = buildPython();
  const version = runtimePythonVersion();
  const wheel = buildBackendWheel(python, work);
  run(python, [
    "-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir",
    "--target", BACKEND_DIR,
    "--python-version", version, "--implementation", "cp", "--platform", PLATFORM, "--only-binary=:all:",
    wheel,
  ]);
  rmSync(join(BACKEND_DIR, "bin"), { recursive: true, force: true });
  console.log(`backend staged for cpython ${version}: ${BACKEND_DIR}`);
}

rmSync(BUILD_DIR, { recursive: true, force: true });
mkdirSync(BUILD_DIR, { recursive: true });
const work = mkdtempSync(join(ROOT, "_output", "work-"));
try {
  setupVcRuntime();
  setupBackend(work);
} catch (error) {
  fail(error);
} finally {
  rmSync(work, { recursive: true, force: true });
}
