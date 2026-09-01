import { LanguageKey } from '@shared/language/language.models';

import { castUsage } from '../scripting.edit';
import { CastMember, Script } from '../scripting.models';

export interface CastRow {
  member: CastMember;
  used: number;
  manual: boolean;
  removable: boolean;
  deleteKey: LanguageKey;
}

function deleteKeyOf(member: CastMember, used: number): LanguageKey {
  if (member.kind === 'kb') {
    return 'scripting.inspector.cast.deleteKb';
  }
  if (member.kind === 'narrator') {
    return 'scripting.inspector.cast.deleteNarrator';
  }
  return used > 0 ? 'scripting.inspector.cast.deleteUsed' : 'scripting.inspector.cast.delete';
}

export function castRowsOf(cast: CastMember[], script: Script): CastRow[] {
  return cast.map((member) => {
    const used = castUsage(script, member.id);
    const manual = member.kind === 'extra';
    return {
      member,
      used,
      manual,
      removable: manual && used === 0,
      deleteKey: deleteKeyOf(member, used),
    };
  });
}
