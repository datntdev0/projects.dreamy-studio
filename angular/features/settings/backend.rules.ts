import { BackendDownload } from './backend.models';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function downloadPercent(download: BackendDownload): number {
  if (download.totalBytes <= 0) {
    return 0;
  }
  return Math.min(100, Math.floor((download.receivedBytes / download.totalBytes) * 100));
}

export function formatUptime(startedAt: string | null, now: number): string {
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (!Number.isFinite(started)) {
    return '—';
  }
  const elapsed = Math.max(0, now - started);
  const days = Math.floor(elapsed / DAY_MS);
  const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatVram(vramMb: number): string {
  return String(Math.round((vramMb / 1024) * 10) / 10);
}

export function isBackendUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}
