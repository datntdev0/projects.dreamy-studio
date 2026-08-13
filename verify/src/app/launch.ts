import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { appExecutable } from "../paths.ts";

const CONNECT_TIMEOUT_MS = 60_000;
const CONNECT_RETRY_MS = 500;

export interface RunningApp {
  readonly browser: Browser;
  readonly page: Page;
  readonly dataDir: string;
  stop(): Promise<void>;
}

export interface LaunchOptions {
  readonly dataDir: string;
  readonly webviewDir: string;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function killTree(child: ChildProcess): Promise<void> {
  return new Promise((done) => {
    if (child.pid === undefined || child.exitCode !== null) {
      done();
      return;
    }
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => done());
  });
}

async function connect(port: number, child: ChildProcess): Promise<Browser> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let last: unknown = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`the app exited early with code ${child.exitCode}`);
    }
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      last = error;
      await pause(CONNECT_RETRY_MS);
    }
  }
  throw new Error(`cannot attach to the app webview on port ${port}: ${String(last)}`);
}

async function firstPage(browser: Browser): Promise<Page> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => candidate.url().startsWith("http"));
    if (page) {
      return page;
    }
    await pause(CONNECT_RETRY_MS);
  }
  throw new Error("the app did not open a page");
}

export async function launchApp(options: LaunchOptions): Promise<RunningApp> {
  const executable = appExecutable();
  if (!existsSync(executable)) {
    throw new Error(`app executable not found: ${executable}. Run "npm run build:app" first or set DREAMY_EXE.`);
  }
  await mkdir(options.dataDir, { recursive: true });
  await mkdir(options.webviewDir, { recursive: true });
  const port = await freePort();
  const child = spawn(executable, ["--data-dir", options.dataDir], {
    stdio: "ignore",
    windowsHide: false,
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: join(options.webviewDir),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  try {
    const browser = await connect(port, child);
    const page = await firstPage(browser);
    return {
      browser,
      page,
      dataDir: options.dataDir,
      stop: async () => {
        await browser.close().catch(() => undefined);
        await killTree(child);
      },
    };
  } catch (error) {
    await killTree(child);
    throw error;
  }
}
