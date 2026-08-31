export const PEAK_RATE = 12;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}
function average(values: Uint8Array, start: number, end: number): number {
  let total = 0;
  for (let index = start; index < end; index++) total += values[index] as number;
  return end > start ? total / (end - start) / 255 : 0;
}
function peak(values: Uint8Array, start: number, end: number): number {
  let maximum = 0;
  for (let index = start; index < end; index++)
    if ((values[index] ?? 0) > maximum) maximum = values[index] as number;
  return maximum / 255;
}
function interpolate(values: Uint8Array, position: number): number {
  const lower = Math.floor(position);
  const upper = Math.min(values.length - 1, lower + 1);
  const progress = position - lower;
  return ((values[lower] ?? 0) * (1 - progress) + (values[upper] ?? 0) * progress) / 255;
}

export function decodePeaks(base64: string): Uint8Array {
  const binary = atob(base64);
  const values = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) values[index] = binary.charCodeAt(index);
  return values;
}
export function peakAt(peaks: Uint8Array | null, seconds: number): number {
  if (!peaks?.length) return 0;
  return interpolate(peaks, clamp(seconds * PEAK_RATE - 0.5, 0, peaks.length - 1));
}
export interface PeakScale {
  low: number;
  high: number;
}
const WAVE_LOW_PERCENTILE = 0.05;
const WAVE_HIGH_PERCENTILE = 0.98;
const WAVE_GAMMA = 1.25;
const WAVE_MINIMUM = 0.06;
const WAVE_MINIMUM_SPAN = 24;
function percentileOf(sorted: Uint8Array, fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))] ?? 0;
}
export function peakScale(peaks: Uint8Array): PeakScale {
  const sorted = Uint8Array.from(peaks).sort();
  const low = percentileOf(sorted, WAVE_LOW_PERCENTILE);
  const high = Math.max(low + WAVE_MINIMUM_SPAN, percentileOf(sorted, WAVE_HIGH_PERCENTILE));
  return { low, high };
}
function waveShape(value: number, scale: PeakScale): number {
  return (
    WAVE_MINIMUM +
    (1 - WAVE_MINIMUM) * Math.pow(clamp((value - scale.low) / (scale.high - scale.low)), WAVE_GAMMA)
  );
}
export function peakLevel(
  peaks: Uint8Array,
  seconds: number,
  slice: number,
  scale: PeakScale,
): number {
  if (slice <= 1.5 / PEAK_RATE) return waveShape(peakAt(peaks, seconds) * 255, scale);
  const start = Math.max(0, Math.floor((seconds - slice / 2) * PEAK_RATE));
  const end = Math.min(peaks.length - 1, Math.floor((seconds + slice / 2) * PEAK_RATE));
  let maximum = 0;
  let total = 0;
  for (let index = start; index <= end; index++) {
    const value = peaks[index] ?? 0;
    total += value;
    if (value > maximum) maximum = value;
  }
  const mean = end >= start ? total / (end - start + 1) : 0;
  return waveShape(mean * 0.5 + maximum * 0.5, scale);
}
export function overviewLevel(overview: number[], duration: number, seconds: number): number {
  if (!overview.length) return 0;
  const position = clamp((seconds / duration) * (overview.length - 1), 0, overview.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(overview.length - 1, lower + 1);
  return (
    ((overview[lower] ?? 0) * (1 - (position - lower)) +
      (overview[upper] ?? 0) * (position - lower)) /
    255
  );
}
export function overviewBars(overview: number[]): number[] {
  return overview.map((value) => Math.max(14, Math.round(clamp(value / 255) * 100)));
}
export function slideStart(position: number, duration: number, window: number): number {
  return Math.max(0, Math.min(duration - window, position - window / 2));
}
export function pageStart(position: number, duration: number, window: number): number {
  return Math.floor(Math.min(position, duration - 0.001) / window) * window;
}
const SPECTRUM_FLOOR = 0.35;
const SPECTRUM_GAMMA = 1.7;
export function spectrumContrast(value: number): number {
  return Math.pow(clamp((value - SPECTRUM_FLOOR) / (1 - SPECTRUM_FLOOR)), SPECTRUM_GAMMA);
}
export function spectrumBands(freq: Uint8Array, count: number, sampleRate: number): number[] {
  const values: number[] = [];
  const perBin = sampleRate / 2 / freq.length;
  const minimum = 60;
  const maximum = Math.min(16_000, sampleRate / 2);
  for (let index = 0; index < count; index++) {
    const low = minimum * Math.pow(maximum / minimum, index / count);
    const high = minimum * Math.pow(maximum / minimum, (index + 1) / count);
    const start = Math.min(freq.length - 1, Math.floor(low / perBin));
    const end = Math.min(freq.length, Math.max(start + 1, Math.ceil(high / perBin)));
    values.push(
      spectrumContrast(
        end - start > 1
          ? average(freq, start, end) * 0.4 + peak(freq, start, end) * 0.6
          : interpolate(freq, clamp(Math.sqrt(low * high) / perBin - 0.5, 0, freq.length - 1)),
      ),
    );
  }
  return values;
}
