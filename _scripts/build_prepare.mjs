import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { DESKTOP, ROOT, TRIPLE, download, extract, fail, run } from "./common.mjs";

const FFMPEG_URL =
  process.env.FFMPEG_URL ??
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip";
const PYTHON_RELEASES = "https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest";
const PYTHON_VERSION = process.env.PYTHON_VERSION ?? "3.12";

const FFMPEG_TARGET = join(DESKTOP, "binaries", `ffmpeg-${TRIPLE}.exe`);
const PYTHON_DIR = join(DESKTOP, "resources", "python");
const PYTHON_EXE = join(PYTHON_DIR, "python.exe");
const BACKEND_DIR = join(DESKTOP, "resources", "backend");
const BACKEND_SOURCE = join(ROOT, "backend");
const PYTHON_UNUSED = ["tcl", join("Lib", "test"), join("Lib", "idlelib"), join("Lib", "turtledemo")];

async function setupFfmpeg(work) {
  if (existsSync(FFMPEG_TARGET)) {
    console.log(`ffmpeg sidecar already present: ${FFMPEG_TARGET}`);
    return;
  }
  mkdirSync(dirname(FFMPEG_TARGET), { recursive: true });

  let archive = process.env.FFMPEG_ARCHIVE;
  if (!archive) {
    archive = join(work, "ffmpeg.zip");
    console.log("downloading ffmpeg");
    await download(FFMPEG_URL, archive);
  }

  const extracted = join(work, "ffmpeg");
  mkdirSync(extracted);
  extract(archive, extracted, ["*/bin/ffmpeg.exe"]);

  const found = readdirSync(extracted)
    .map((name) => join(extracted, name, "bin", "ffmpeg.exe"))
    .find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`bin/ffmpeg.exe was not found in ${archive}`);

  copyFileSync(found, FFMPEG_TARGET);
  console.log(`ffmpeg sidecar installed: ${FFMPEG_TARGET}`);
}

function patchOf(asset) {
  return Number(asset.name.slice("cpython-".length).split("+")[0].split(".")[2]);
}

async function findPythonAsset() {
  const headers = { "User-Agent": "dreamy-studio-build", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(PYTHON_RELEASES, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${PYTHON_RELEASES}`);
  const release = await response.json();

  const prefix = `cpython-${PYTHON_VERSION}.`;
  const suffix = `-${TRIPLE}-install_only_stripped.tar.gz`;
  const asset = release.assets
    .filter((candidate) => candidate.name.startsWith(prefix) && candidate.name.endsWith(suffix))
    .sort((a, b) => patchOf(a) - patchOf(b))
    .at(-1);
  if (!asset) throw new Error(`no python ${PYTHON_VERSION} asset for ${TRIPLE} in release ${release.tag_name}`);
  return asset;
}

async function fetchPythonArchive(work) {
  const asset = await findPythonAsset();
  const archive = join(work, asset.name);
  console.log(`downloading ${asset.name}`);
  await download(asset.browser_download_url, archive);

  const expected = (asset.digest ?? "").replace("sha256:", "");
  if (expected) {
    const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
    if (actual !== expected) throw new Error(`sha256 mismatch for ${asset.name}`);
  }
  return archive;
}

async function setupPython(work) {
  if (existsSync(PYTHON_EXE)) {
    console.log(`python runtime already present: ${PYTHON_DIR}`);
    return;
  }
  mkdirSync(dirname(PYTHON_DIR), { recursive: true });

  const archive = process.env.PYTHON_ARCHIVE ?? (await fetchPythonArchive(work));
  const extracted = join(work, "python-extracted");
  mkdirSync(extracted);
  extract(archive, extracted);

  const python = join(extracted, "python");
  if (!existsSync(join(python, "python.exe"))) throw new Error(`python.exe was not found in ${archive}`);
  for (const unused of PYTHON_UNUSED) rmSync(join(python, unused), { recursive: true, force: true });

  rmSync(PYTHON_DIR, { recursive: true, force: true });
  renameSync(python, PYTHON_DIR);
  console.log(`python runtime installed: ${PYTHON_DIR}`);
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

// python-build-standalone ships only vcruntime140*.dll; native wheels such as torch and
// onnxruntime also need msvcp140.dll and friends, so deploy the VC++ runtime app-locally.
function setupVcRuntime() {
  for (const name of VC_RUNTIME_DLLS) {
    const source = findVcRuntimeDll(name);
    if (!source) {
      throw new Error(`Visual C++ runtime ${name} was not found; install Visual Studio or set VC_REDIST_DIR`);
    }
    const target = join(PYTHON_DIR, name);
    if (existsSync(target) && readFileSync(target).equals(readFileSync(source))) continue;
    copyFileSync(source, target);
    console.log(`visual c++ runtime: ${source}`);
  }
}

function cleanBackendSource() {
  rmSync(join(BACKEND_SOURCE, "build"), { recursive: true, force: true });
  for (const name of readdirSync(BACKEND_SOURCE).filter((entry) => entry.endsWith(".egg-info"))) {
    rmSync(join(BACKEND_SOURCE, name), { recursive: true, force: true });
  }
}

function setupBackend() {
  if (!existsSync(PYTHON_EXE)) throw new Error(`python runtime is missing: ${PYTHON_EXE}`);

  rmSync(BACKEND_DIR, { recursive: true, force: true });
  try {
    run(PYTHON_EXE, [
      "-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir",
      "--target", BACKEND_DIR, BACKEND_SOURCE,
    ]);
  } finally {
    cleanBackendSource();
  }
  rmSync(join(BACKEND_DIR, "bin"), { recursive: true, force: true });
  console.log(`backend staged: ${BACKEND_DIR}`);
}

mkdirSync(join(ROOT, "_output"), { recursive: true });
const work = mkdtempSync(join(ROOT, "_output", "work-"));
try {
  await setupFfmpeg(work);
  await setupPython(work);
  setupVcRuntime();
  setupBackend();
} catch (error) {
  fail(error);
} finally {
  rmSync(work, { recursive: true, force: true });
}
