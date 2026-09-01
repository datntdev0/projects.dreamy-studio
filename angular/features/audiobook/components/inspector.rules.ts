import { LanguageKey } from '@shared/language/language.models';

import { MixField } from '../audiobook.models';
import { MIX_LIMITS } from '../audiobook.rules';

export interface MixFieldDef {
  field: MixField;
  labelKey: LanguageKey;
  unitKey: LanguageKey;
  min: number;
  max: number;
  step: number;
}

function mixDef(
  field: MixField,
  labelKey: LanguageKey,
  unitKey: LanguageKey,
  step: number,
): MixFieldDef {
  const [min, max] = MIX_LIMITS[field];
  return { field, labelKey, unitKey, min, max, step };
}

export const MIX_FIELDS: MixFieldDef[] = [
  mixDef('gap', 'audiobook.inspector.mix.gap', 'audiobook.inspector.mix.seconds', 0.1),
  mixDef('intro', 'audiobook.inspector.mix.intro', 'audiobook.inspector.mix.seconds', 0.1),
  mixDef('outro', 'audiobook.inspector.mix.outro', 'audiobook.inspector.mix.seconds', 0.1),
  mixDef('vol', 'audiobook.inspector.mix.vol', 'audiobook.inspector.mix.db', 1),
];
