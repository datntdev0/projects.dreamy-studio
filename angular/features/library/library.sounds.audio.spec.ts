import { describe, expect, it } from "vitest";
import { PEAK_RATE, decodePeaks, overviewBars, overviewLevel, pageStart, peakAt, peakLevel, peakScale, slideStart, spectrumBands, spectrumContrast } from "./library.sounds.audio";

describe("library.sounds.audio", () => {
  it("decodes peaks", () => {
    expect([...decodePeaks(btoa(String.fromCharCode(0, 128, 255)))]).toEqual([0, 128, 255]);
  });

  it("interpolates peaks over time", () => {
    const peaks = Uint8Array.from([0, 255]);
    expect(peakAt(null, 1)).toBe(0);
    expect(peakAt(new Uint8Array(), 1)).toBe(0);
    expect(peakAt(peaks, 0)).toBe(0);
    expect(peakAt(peaks, 100)).toBe(1);
    expect(peakAt(peaks, (0.5 + 0.5) / PEAK_RATE)).toBeCloseTo(0.5, 1);
  });

  it("scales and shapes levels", () => {
    const peaks = Uint8Array.from({ length: 100 }, (_, index) => index * 2);
    const scale = peakScale(peaks);
    expect(scale.high).toBeGreaterThan(scale.low);
    expect(peakLevel(peaks, 1, 0, scale)).toBeGreaterThanOrEqual(0.06);
    expect(peakLevel(peaks, 2, 1, scale)).toBeGreaterThan(peakLevel(peaks, 0, 1, scale));
    expect(peakLevel(peaks, 1000, 1, scale)).toBeGreaterThanOrEqual(0.06);
  });

  it("derives overview data", () => {
    expect(overviewLevel([], 10, 5)).toBe(0);
    expect(overviewLevel([0, 255], 10, 5)).toBeCloseTo(0.5);
    expect(overviewBars([0, 255, 128])).toEqual([14, 100, 50]);
  });

  it("positions waveform windows", () => {
    expect(slideStart(1, 100, 10)).toBe(0);
    expect(slideStart(50, 100, 10)).toBe(45);
    expect(slideStart(99, 100, 10)).toBe(90);
    expect(pageStart(25, 100, 10)).toBe(20);
    expect(pageStart(100, 100, 10)).toBe(90);
  });

  it("computes spectrum bands", () => {
    expect(spectrumContrast(0)).toBe(0);
    expect(spectrumContrast(1)).toBe(1);
    const freq = Uint8Array.from({ length: 1024 }, (_, index) => (index < 512 ? 255 : 0));
    const bands = spectrumBands(freq, 8, 44100);
    expect(bands).toHaveLength(8);
    expect(bands.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(spectrumBands(Uint8Array.from([255, 255]), 4, 8000)).toHaveLength(4);
  });
});
