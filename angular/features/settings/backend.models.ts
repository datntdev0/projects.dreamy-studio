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
  computeCapability: string;
  cudaSupported: boolean;
}

export interface BackendView {
  server: BackendServer;
  gpu: BackendGpu;
  device: BackendDevice;
  modelsDir: string;
}

export interface RemoteView extends BackendView {
  url: string;
  keyHint: string;
  active: boolean;
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
