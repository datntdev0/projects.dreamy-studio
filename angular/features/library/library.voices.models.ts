export type VoiceEngineKind = 'local' | 'cloud';
export type VoiceSource = 'preset' | 'clone' | 'design';
export type VoiceGender = 'female' | 'male' | 'neutral';
export type VoicePresetFilter = 'all' | VoiceGender;
export type VoiceReferenceMode = 'library' | 'upload' | 'record';
export type VoiceReferenceKind = 'sound' | 'file' | 'recording';

import { AssetRights } from './library.models';

export interface LibraryVoice {
  id: number;
  name: string;
  engine: string;
  engineKind: VoiceEngineKind;
  source: VoiceSource;
  language: string;
  gender: VoiceGender;
  preset: string | null;
  referenceKind: VoiceReferenceKind | null;
  referenceSoundId: number | null;
  referenceName: string;
  prompt: string;
  sampleText: string;
  rights: AssetRights;
  collectionId: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type VoiceReference =
  | { kind: 'sound'; soundId: number }
  | { kind: 'file'; path: string; name: string }
  | { kind: 'recording'; data: string; mime: string; durationMs: number };

export interface VoiceReferenceFile {
  path: string;
  name: string;
  size: number | null;
}

export interface VoiceInput {
  name: string;
  engine: string;
  engineKind: VoiceEngineKind;
  source: VoiceSource;
  language: string;
  gender: VoiceGender;
  preset: string | null;
  reference: VoiceReference | null;
  prompt: string;
}

export interface VoicePreset {
  id: string;
  name: string;
  gender: VoiceGender;
  region: string;
  style: string;
  language?: string;
  detail?: string;
  previewUrl?: string;
}

export interface CloudVoice {
  id: string;
  name: string;
  gender: string;
  language: string;
  accent: string;
  category: string;
  description: string;
  previewUrl: string;
}

export interface VoiceEngine {
  id: string;
  name: string;
  kind: VoiceEngineKind;
  ready: boolean;
  sources: VoiceSource[];
  presets: VoicePreset[];
  searchable: boolean;
}

export const VOICE_LANGUAGES = ['vi', 'en', 'ja', 'zh', 'ko', 'multi'] as const;
export const VOICE_GENDERS: VoiceGender[] = ['female', 'male', 'neutral'];
export const VOICE_SOURCES: VoiceSource[] = ['preset', 'clone', 'design'];
export const VOICE_REFERENCE_MODES: VoiceReferenceMode[] = ['library', 'upload', 'record'];
export const VOICE_ENGINE_KINDS: VoiceEngineKind[] = ['local', 'cloud'];

export interface VoicePatch {
  name?: string;
  sampleText?: string;
  rights?: AssetRights;
  collectionId?: number | null;
  tags?: string[];
}

export interface VoiceEngineGroup {
  kind: VoiceEngineKind;
  engines: VoiceEngine[];
}
