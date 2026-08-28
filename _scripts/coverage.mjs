import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";

function position(line, column) {
  return { line, column };
}

function lineRange(line, length) {
  return { start: position(line, 0), end: position(line, length) };
}

function parseRecord(text, base) {
  const record = { path: "", lines: new Map(), functions: new Map(), branches: new Map() };
  for (const row of text.split(/\r?\n/)) {
    const separator = row.indexOf(":");
    const key = separator < 0 ? row : row.slice(0, separator);
    const fields = separator < 0 ? [] : row.slice(separator + 1).split(",");
    if (key === "SF") record.path = isAbsolute(row.slice(3)) ? row.slice(3) : resolve(base, row.slice(3));
    if (key === "FN") record.functions.set(fields.slice(1).join(","), { line: Number(fields[0]), hits: 0 });
    if (key === "FNDA") {
      const entry = record.functions.get(fields.slice(1).join(","));
      if (entry) entry.hits = Number(fields[0]);
    }
    if (key === "DA") record.lines.set(Number(fields[0]), Number(fields[1]));
    if (key === "BRDA") {
      const id = `${fields[0]}:${fields[1]}`;
      const branch = record.branches.get(id) ?? { line: Number(fields[0]), hits: [] };
      branch.hits.push(fields[3] === "-" ? 0 : Number(fields[3]));
      record.branches.set(id, branch);
    }
  }
  return record;
}

function toFileCoverage(record) {
  const source = existsSync(record.path) ? readFileSync(record.path, "utf8").split(/\r?\n/) : [];
  const lengthOf = (line) => (source[line - 1] ?? "").length;
  const data = { path: record.path, statementMap: {}, fnMap: {}, branchMap: {}, s: {}, f: {}, b: {} };
  let index = 0;
  for (const [line, hits] of record.lines) {
    data.statementMap[index] = lineRange(line, lengthOf(line));
    data.s[index] = hits;
    index += 1;
  }
  index = 0;
  for (const [name, entry] of record.functions) {
    const range = lineRange(entry.line, lengthOf(entry.line));
    data.fnMap[index] = { name, decl: range, loc: range, line: entry.line };
    data.f[index] = entry.hits;
    index += 1;
  }
  index = 0;
  for (const branch of record.branches.values()) {
    const range = lineRange(branch.line, lengthOf(branch.line));
    data.branchMap[index] = { type: "branch", line: branch.line, loc: range, locations: branch.hits.map(() => range) };
    data.b[index] = branch.hits;
    index += 1;
  }
  return data;
}

export function renderHtml(lcovFile, base, outputDir) {
  const map = libCoverage.createCoverageMap({});
  const records = readFileSync(lcovFile, "utf8").split("end_of_record").filter((text) => text.includes("SF:"));
  for (const text of records) {
    const record = parseRecord(text, base);
    if (existsSync(record.path)) map.addFileCoverage(toFileCoverage(record));
  }
  const context = libReport.createContext({
    dir: outputDir,
    coverageMap: map,
    defaultSummarizer: "nested",
    sourceFinder: (path) => readFileSync(path, "utf8"),
  });
  reports.create("html").execute(context);
  reports.create("text-summary").execute(context);
}
