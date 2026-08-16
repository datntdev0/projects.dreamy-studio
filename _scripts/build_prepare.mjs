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
  setupBackend();
} catch (error) {
  fail(error);
} finally {
  rmSync(work, { recursive: true, force: true });
}
