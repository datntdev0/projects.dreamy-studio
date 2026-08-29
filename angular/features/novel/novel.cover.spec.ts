import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCoverFile, coverScale, prepareCover } from "./novel.cover";

function fileOf(type: string, size: number): File {
  const file = new File(["x"], "c.png", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("novel.cover", () => {
  afterEach(() => vi.restoreAllMocks());

  it("checks files", () => {
    expect(checkCoverFile(fileOf("text/plain", 1))).toBe("notImage");
    expect(checkCoverFile(fileOf("image/png", 9 * 1024 * 1024))).toBe("tooLarge");
    expect(checkCoverFile(fileOf("image/jpeg", 10))).toBe("ok");
  });

  it("scales tall images only", () => {
    expect(coverScale(0)).toBe(1);
    expect(coverScale(320)).toBe(1);
    expect(coverScale(1280)).toBe(0.5);
  });

  it("renders a scaled data url", async () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    vi.stubGlobal("Image", class {
      src = "";
      width = 800;
      height = 1280;
      decode(): Promise<void> {
        return Promise.resolve();
      }
    });
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AA");
    expect(await prepareCover(fileOf("image/png", 1))).toBe("data:image/png;base64,AA");
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 640);
  });

  it("fails when no canvas context exists", async () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    vi.stubGlobal("Image", class {
      width = 1;
      height = 1;
      decode(): Promise<void> {
        return Promise.resolve();
      }
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(prepareCover(fileOf("image/png", 1))).rejects.toThrow("canvas unavailable");
    vi.unstubAllGlobals();
  });
});
