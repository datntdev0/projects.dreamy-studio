import { describe, expect, it } from "vitest";
import { pipeline, task } from "@testing/fixtures";
import { barOf, compareNewestFirst, countsOf, durationMs, elapsedMs, etaMs, firstError, formatClock, formatDuration, isActive, kindIcon, kindKey, kindSize, logOf, matchesFilter, matchesQuery, percentOf, queuedCount, runningTasks, totalsOf } from "./pipeline.rules";

const begin = "2026-01-02T03:04:10Z";
const at = (seconds: number): number => new Date(begin).getTime() + seconds * 1000;

describe("pipeline.rules", () => {
  it("classifies activity and kinds", () => {
    expect(isActive(pipeline({ status: "queued" }))).toBe(true);
    expect(isActive(pipeline({ status: "completed" }))).toBe(false);
    expect(kindKey("translation")).toBe("pipeline.kind.translation");
    expect(kindKey("other")).toBeNull();
    expect(kindIcon("audio")).toBe("mic");
    expect(kindIcon("other")).toBe("activity");
    expect(kindSize("render")).toBe(15);
    expect(kindSize("other")).toBe(16);
  });

  it("counts statuses and totals", () => {
    const list = [pipeline({ status: "running", done: 1, failed: 1, total: 5 }), pipeline({ id: 2, status: "failed", total: 3, done: 3 })];
    expect(countsOf(list)).toMatchObject({ all: 2, running: 1, failed: 1, queued: 0 });
    expect(totalsOf(list)).toEqual({ count: 2, done: 5, total: 8 });
  });

  it("computes elapsed time and ETA", () => {
    const running = pipeline({ total: 4, tasks: [task({ status: "completed" }), task({ id: 2, status: "running", progress: 50 })] });
    expect(elapsedMs(running, at(30))).toBe(30000);
    expect(elapsedMs(running, at(-5))).toBeNull();
    expect(elapsedMs(pipeline({ startedAt: null, createdAt: "bad" }), at(1))).toBeNull();
    expect(etaMs(running, at(30))).toBe(Math.round((30000 / 38) * 62));
    expect(etaMs(pipeline({ total: 0 }), at(30))).toBeNull();
    expect(etaMs(pipeline({ startedAt: "bad", createdAt: "bad" }), at(30))).toBeNull();
    expect(etaMs(pipeline({ total: 1, done: 1 }), at(30))).toBeNull();
  });

  it("computes percentages and the progress bar", () => {
    expect(percentOf(pipeline({ total: 0 }))).toBe(0);
    expect(percentOf(pipeline({ total: 4, done: 1, failed: 1 }))).toBe(50);
    expect(percentOf(pipeline({ total: 2, tasks: [task({ status: "completed" }), task({ id: 2, status: "failed" }), task({ id: 3, status: "completed" })] }))).toBe(100);
    expect(barOf(pipeline({ total: 4, done: 2, failed: 1 }))).toEqual({ completed: 50, failed: 25, running: 0 });
    expect(barOf(pipeline({ total: 0 }))).toEqual({ completed: 0, failed: 0, running: 0 });
    const bar = barOf(pipeline({ tasks: [task({ status: "completed" }), task({ id: 2, status: "failed" }), task({ id: 3, status: "running", progress: 50 }), task({ id: 4, status: "queued" })] }));
    expect(bar).toEqual({ completed: 25, failed: 25, running: 12.5 });
  });

  it("filters tasks", () => {
    const p = pipeline({ tasks: [task({ status: "running" }), task({ id: 2, status: "queued" }), task({ id: 3, status: "failed", error: "boom" }), task({ id: 4, status: "failed" })] });
    expect(runningTasks(p)).toHaveLength(1);
    expect(queuedCount(p)).toBe(1);
    expect(firstError(p)).toBe("boom");
    expect(firstError(pipeline())).toBe("");
    expect(compareNewestFirst(pipeline({ id: 1 }), pipeline({ id: 2 }))).toBeGreaterThan(0);
    expect(matchesFilter("failed", "all")).toBe(true);
    expect(matchesFilter("failed", "failed")).toBe(true);
    expect(matchesFilter("failed", "queued")).toBe(false);
    expect(matchesQuery("Hello", " ")).toBe(true);
    expect(matchesQuery("Hello", "ell")).toBe(true);
    expect(matchesQuery("Hello", "xyz")).toBe(false);
  });

  it("computes durations and formats", () => {
    expect(durationMs(pipeline({ finishedAt: "2026-01-02T03:05:10Z" }))).toBe(60000);
    expect(durationMs(pipeline())).toBeNull();
    expect(durationMs(pipeline({ finishedAt: "2026-01-02T03:00:00Z" }))).toBeNull();
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(125000)).toBe("2m 05s");
    expect(formatDuration(3_900_000)).toBe("1h 05m");
    expect(formatClock("bad")).toBe("bad");
    expect(formatClock("2026-03-04T05:06:07")).toBe("05:06:07");
  });

  it("builds a chronological log", () => {
    const p = pipeline({
      status: "failed",
      finishedAt: "2026-01-02T03:06:00Z",
      tasks: [
        task({ id: 1, status: "completed", startedAt: "2026-01-02T03:04:20Z", finishedAt: "2026-01-02T03:04:30Z" }),
        task({ id: 2, status: "failed", startedAt: "2026-01-02T03:04:40Z" }),
        task({ id: 3, status: "cancelled" }),
        task({ id: 4, status: "running", startedAt: "2026-01-02T03:04:50Z" }),
        task({ id: 5, status: "queued" }),
      ],
    });
    const kinds = logOf(p).map((entry) => entry.kind);
    expect(kinds[0]).toBe("started");
    expect(kinds.at(-1)).toBe("finished");
    expect(kinds).toEqual(expect.arrayContaining(["taskStarted", "taskDone", "taskFailed", "taskCancelled", "taskRunning"]));
    expect(logOf(pipeline({ status: "running" })).map((entry) => entry.kind)).toEqual(["started"]);
  });
});
