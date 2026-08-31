export function readGridSize(key: string, fallback = 176): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= 110 && value <= 360 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function readGridRatio(key: string, fallback = '16/9'): string {
  try {
    const value = localStorage.getItem(key);
    return value === '1/1' || value === '9/16' || value === '16/9' ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}
