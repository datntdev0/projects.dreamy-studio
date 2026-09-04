export type BackendStatus = 'starting' | 'running' | 'stopped' | 'error';

export type BackendDevice = 'cpu' | 'cuda';

export type DownloadState = 'none' | 'downloading' | 'installed' | 'error';

export interface BackendDownload {
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number;
  error: string;
}

export interface BackendServer {
  status: BackendStatus;
  port: number | null;
  version: string;
  pythonVersion: string;
  startedAt: string | null;
  latencyMs: number | null;
  checkedAt: string;
  error: string;
}

export interface BackendGpu {
  found: boolean;
  name: string;
  vramMb: number;
  driver: string;
}

export interface BackendCuda extends BackendDownload {
  version: string;
}

export interface BackendView {
  server: BackendServer;
  gpu: BackendGpu;
  cuda: BackendCuda;
  device: BackendDevice;
  modelsDir: string;
}

export interface TtsVoicePreset {
  id: string;
  name: string;
  gender: string;
  region: string;
  style: string;
}

export interface TtsModel extends BackendDownload {
  id: string;
  name: string;
  source: string;
  languages: string[];
  cloning: boolean;
  gpuRecommended: boolean;
  sources: string[];
  presets: TtsVoicePreset[];
  license: string;
  commercialUse: boolean;
}
