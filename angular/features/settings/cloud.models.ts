export type CloudServiceKind = 'speech' | 'image';

export type CloudCheckStatus = 'none' | 'checking' | 'ok' | 'error';

export interface CloudAccount {
  id: string;
  name: string;
  site: string;
  services: CloudServiceKind[];
  requiresKey: boolean;
  connected: boolean;
  keyHint: string;
  status: CloudCheckStatus;
  error: string;
  checkedAt: string;
}

export interface CloudCheckResult {
  ok: boolean;
  error: string;
  checkedAtMs: number;
}

export interface CloudCacheStatus {
  entries: number;
  bytes: number;
  limitBytes: number;
  dir: string;
}
