import { LanguageKey } from '@shared/language/language.models';

import { VoiceEngineKind } from '../../library/library.voices.models';
// prettier-ignore
import { voiceGenderKey, voiceLanguageText, VoiceTranslate } from '../../library/library.voices.rules';
// prettier-ignore
import { SpeakerDeleteBlock, SpeakerRow, VoiceIssue, VoiceOption, VoiceOptionGroup } from '../audiobook.models';

export interface VoiceChoice {
  id: number;
  label: string;
}

export interface VoiceChoiceGroup {
  kind: VoiceEngineKind;
  labelKey: LanguageKey;
  choices: VoiceChoice[];
}

export interface VoiceChoiceTexts {
  translate: VoiceTranslate;
  issue: (issue: VoiceIssue) => string;
}

const GROUP_KEYS: Record<VoiceEngineKind, LanguageKey> = {
  local: 'audiobook.voices.group.local',
  cloud: 'audiobook.voices.group.cloud',
};

const DELETE_KEYS: Record<SpeakerDeleteBlock, LanguageKey> = {
  narrator: 'audiobook.voices.delete.narrator',
  kb: 'audiobook.voices.delete.kb',
  inUse: 'audiobook.voices.delete.inUse',
};

const STATUS_KEYS = {
  ready: 'audiobook.voices.status.ready',
  noVoice: 'audiobook.voices.status.noVoice',
  unused: 'audiobook.voices.status.unused',
  cloud: 'audiobook.voices.status.notConnected',
  local: 'audiobook.voices.status.modelRequired',
} as const;

function choiceOf(option: VoiceOption, texts: VoiceChoiceTexts): VoiceChoice {
  const { voice } = option;
  const base = [
    voice.name,
    voiceLanguageText(voice.language, texts.translate),
    texts.translate(voiceGenderKey(voice.gender)),
  ].join(' · ');
  return { id: voice.id, label: option.issue ? `${base} — ${texts.issue(option.issue)}` : base };
}

export function voiceChoiceGroups(
  groups: VoiceOptionGroup[],
  texts: VoiceChoiceTexts,
): VoiceChoiceGroup[] {
  return groups.map((group) => ({
    kind: group.kind,
    labelKey: GROUP_KEYS[group.kind],
    choices: group.options.map((option) => choiceOf(option, texts)),
  }));
}

export function speakerStatusKey(row: SpeakerRow): LanguageKey {
  if (row.status === 'engine') {
    return STATUS_KEYS[row.issue?.kind === 'cloud' ? 'cloud' : 'local'];
  }
  return STATUS_KEYS[row.status];
}

export function speakerDeleteKey(row: SpeakerRow): LanguageKey {
  return row.deleteBlock ? DELETE_KEYS[row.deleteBlock] : 'audiobook.voices.delete';
}
