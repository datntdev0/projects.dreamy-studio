import { mkdirSync, openSync, readSync, closeSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { baselineRoot, outputRoot } from "./paths.ts";

const PIXEL_PATTERN = /(\d+) pixels \(ratio ([\d.]+) of all image pixels\) are different/;
const SIZE_PATTERN = /Expected an image (\d+)px by (\d+)px, received (\d+)px by (\d+)px/;
const MISSING_PATTERN = /A snapshot doesn't exist at/;
const SNAPSHOT_PATTERN = /Snapshot: (.+\.png)/;
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const SUMMARY_FILE = join(outputRoot, "diff-summary.json");

interface Difference {
  readonly project: string;
  readonly panel: string;
  readonly kind: "pixels" | "size" | "missing";
  readonly pixels: number;
  readonly ratio: number;
  readonly detail: string;
}

function panelName(message: string): string | null {
  const snapshot = SNAPSHOT_PATTERN.exec(message) ?? /snapshot doesn't exist at (.+\.png)/.exec(message);
  if (!snapshot?.[1]) {
    return null;
  }
  const path = snapshot[1].trim();
  const local = isAbsolute(path) ? relative(baselineRoot, path) : path;
  return local.replaceAll("\\", "/").replace(/\.png$/, "");
}

function describe(message: string, project: string): Difference | null {
  const panel = panelName(message);
  if (panel === null) {
    return null;
  }
  const pixels = PIXEL_PATTERN.exec(message);
  const size = SIZE_PATTERN.exec(message);
  if (size) {
    const ratio = pixels ? Number(pixels[2]) : 1;
    return { project, panel, kind: "size", pixels: pixels ? Number(pixels[1]) : 0, ratio, detail: `size ${size[1]}x${size[2]} -> ${size[3]}x${size[4]}` };
  }
  if (pixels) {
    return { project, panel, kind: "pixels", pixels: Number(pixels[1]), ratio: Number(pixels[2]), detail: `${pixels[1]} px` };
  }
  if (MISSING_PATTERN.test(message)) {
    return { project, panel, kind: "missing", pixels: 0, ratio: 1, detail: "no baseline" };
  }
  return null;
}

function imageSize(path: string): { width: number; height: number } | null {
  const header = Buffer.alloc(24);
  const handle = openSync(path, "r");
  try {
    readSync(handle, header, 0, header.length, 0);
  } finally {
    closeSync(handle);
  }
  return header.toString("latin1", 12, 16) === "IHDR" ? { width: header.readUInt32BE(16), height: header.readUInt32BE(20) } : null;
}

function diffTotals(result: TestResult): Map<string, number> {
  const totals = new Map<string, number>();
  for (const attachment of result.attachments) {
    if (!attachment.path || !attachment.name.endsWith("-diff.png")) {
      continue;
    }
    const size = imageSize(attachment.path);
    if (size) {
      totals.set(attachment.name.replace(/-diff\.png$/, "").replaceAll("\\", "/"), size.width * size.height);
    }
  }
  return totals;
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

function componentOf(panel: string): string {
  return panel.slice(panel.lastIndexOf("/") + 1);
}

export default class DifferenceReporter implements Reporter {
  private readonly found: Difference[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? "";
    const totals = diffTotals(result);
    for (const error of result.errors) {
      const message = (error.message ?? "").replace(ANSI_PATTERN, "");
      const found = describe(message, project);
      if (found) {
        this.found.push(this.exact(found, totals));
      }
    }
  }

  private exact(found: Difference, totals: Map<string, number>): Difference {
    const total = totals.get(found.panel);
    if (!total || found.pixels === 0) {
      return found;
    }
    return { ...found, ratio: found.pixels / total };
  }

  onEnd(_result: FullResult): void {
    const ranked = [...this.found].sort((left, right) => right.ratio - left.ratio || right.pixels - left.pixels);
    mkdirSync(dirname(SUMMARY_FILE), { recursive: true });
    writeFileSync(SUMMARY_FILE, JSON.stringify(ranked, null, 2));
    if (ranked.length === 0) {
      console.log("\nVisual differences: none");
      return;
    }
    const width = Math.max(...ranked.map((item) => item.panel.length));
    console.log(`\nVisual differences, most different first (${ranked.length} panels):`);
    for (const item of ranked) {
      const score = item.kind === "missing" ? "MISSING" : percent(item.ratio);
      console.log(`  ${item.panel.padEnd(width)}  ${score.padStart(8)}  ${item.detail}  [${item.project}]`);
    }
    this.printComponents(ranked);
    console.log(`Summary written to ${SUMMARY_FILE}`);
  }

  private printComponents(ranked: readonly Difference[]): void {
    const groups = new Map<string, Difference[]>();
    for (const item of ranked) {
      const key = componentOf(item.panel);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const rows = [...groups.entries()].map(([name, items]) => ({
      name,
      screens: items.length,
      mean: items.reduce((sum, item) => sum + item.ratio, 0) / items.length,
      worst: Math.max(...items.map((item) => item.ratio)),
    }));
    rows.sort((left, right) => right.mean - left.mean);
    console.log("\nBy component (mean difference over the screens where it differs):");
    for (const row of rows) {
      console.log(`  ${row.name.padEnd(10)} mean ${percent(row.mean).padStart(7)}  worst ${percent(row.worst).padStart(7)}  screens ${row.screens}`);
    }
  }
}
