import { describe, expect, it } from "vitest";
import { libraryImage } from "@testing/fixtures";
import { dimensionsText, filterImages, imageCode, imageInspectorDimensionsText, imageInspectorFormatText, searchImages, sortImages } from "./library.images.rules";

describe("library.images.rules", () => {
  const items = [libraryImage({ id: 1, name: "b.png", size: 10, tags: ["x"], createdAt: "2026-01-01", collectionId: 5 }), libraryImage({ id: 2, name: "a.png", size: 30, tags: ["y"], createdAt: "2026-02-01" }), libraryImage({ id: 3, name: "c.png", size: 30, createdAt: "2026-02-01", ext: "" })];

  it("formats text", () => {
    expect(imageCode(7)).toBe("IMG-0007");
    expect(dimensionsText(items[0])).toBe("100×50");
    expect(imageInspectorDimensionsText(items[0])).toBe("100 × 50 px");
    expect(imageInspectorFormatText(items[0])).toBe("PNG");
    expect(imageInspectorFormatText(items[2])).toBe("—");
  });

  it("searches and sorts", () => {
    expect(searchImages(items, "")).toHaveLength(3);
    expect(searchImages(items, " A.p ").map((item) => item.id)).toEqual([2]);
    expect(searchImages(items, "Y").map((item) => item.id)).toEqual([2]);
    expect(sortImages(items, "new").map((item) => item.id)).toEqual([3, 2, 1]);
    expect(sortImages(items, "name").map((item) => item.id)).toEqual([2, 1, 3]);
    expect(sortImages(items, "size").map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("filters by collection and tags", () => {
    expect(filterImages(items, { query: "", sort: "new", collection: 5, tags: [] }).map((item) => item.id)).toEqual([1]);
    expect(filterImages(items, { query: "", sort: "new", collection: "none", tags: [] }).map((item) => item.id)).toEqual([3, 2]);
    expect(filterImages(items, { query: "", sort: "name", collection: null, tags: ["y"] }).map((item) => item.id)).toEqual([2]);
    expect(filterImages(items, { query: "", sort: "name", collection: null, tags: [] })).toHaveLength(3);
  });
});
