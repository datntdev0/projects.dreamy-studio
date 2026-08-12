export const PEAK_RATE = 12;

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function average(values: Uint8Array, start: number, end: number): number { let total = 0; for (let index = start; index < end; index++) total += values[index] as number; return end > start ? total / (end - start) / 255 : 0; }

export function decodePeaks(base64: string): Uint8Array { const binary = atob(base64); const values = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index++) values[index] = binary.charCodeAt(index); return values; }
export function peakAt(peaks: Uint8Array | null, seconds: number): number { if (!peaks?.length) return 0; const position = clamp(seconds * PEAK_RATE / Math.max(1, peaks.length - 1)) * Math.max(0, peaks.length - 1); const lower = Math.floor(position); const upper = Math.min(peaks.length - 1, lower + 1); const progress = position - lower; return ((peaks[lower] ?? 0) * (1 - progress) + (peaks[upper] ?? 0) * progress) / 255; }
export function overviewBars(overview: number[]): number[] { return overview.map((value) => Math.max(14, Math.round(clamp(value / 255) * 100))); }
export function spectrumBands(freq: Uint8Array, count: number, sampleRate: number): number[] { const values: number[] = []; const nyquist = sampleRate / 2; const minimum = 60; const maximum = Math.min(16_000, nyquist); for (let index = 0; index < count; index++) { const low = minimum * Math.pow(maximum / minimum, index / count); const high = minimum * Math.pow(maximum / minimum, (index + 1) / count); const start = Math.max(0, Math.floor(low / nyquist * freq.length)); const end = Math.min(freq.length, Math.max(start + 1, Math.ceil(high / nyquist * freq.length))); values.push(average(freq, start, end)); } return values; }
