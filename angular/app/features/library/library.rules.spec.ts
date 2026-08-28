import { describe, expect, it } from "vitest";
import { collectionCode, durationText, fileNameOf, formatBytes, formatIsoMinute, libraryErrorKey, normalizeTag, sumCounts, toLibraryError } from "./library.rules";

describe("library.rules", () => {
  it("normalizes tags", () => {
    expect(normalizeTag("  #Hello, World  ")).toBe("hello-world");
    expect(normalizeTag("x".repeat(40))).toHaveLength(24);
  });

  it("formats collection codes", () => {
    expect(collectionCode(3)).toBe("COL-03");
    expect(collectionCode(120)).toBe("COL-120");
  });

  it("sums counts across kinds", () => {
    expect(sumCounts({ image: 1, sound: 2, video: 3, prompt: 4 })).toBe(10);
  });

  it("formats durations", () => {
    expect(durationText(65_000)).toBe("1:05");
    expect(durationText(3_725_000)).toBe("1:02:05");
    expect(durationText(-5)).toBe("0:00");
  });

  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(10)).toBe("1 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("formats timestamps and file names", () => {
    expect(formatIsoMinute("2026-01-02T03:04:05Z")).toBe("2026-01-02 03:04");
    expect(fileNameOf("C:\\a\\b\\c.png")).toBe("c.png");
    expect(fileNameOf("a/b/c.png")).toBe("c.png");
  });

  it("maps errors to language keys", () => {
    expect(libraryErrorKey({ code: "tag_exists", detail: "" })).toBe("library.error.tagExists");
    expect(libraryErrorKey({ code: "other", detail: "" })).toBe("library.error.generic");
    expect(toLibraryError("boom")).toEqual({ code: "unknown", detail: "boom" });
  });
});
