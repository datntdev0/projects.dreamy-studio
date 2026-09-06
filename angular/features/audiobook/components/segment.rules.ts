import { LanguageKey } from '@shared/language/language.models';

import { SegmentRow } from '../audiobook.models';
import { isInProgress } from '../audiobook.rules';

export type SegmentActionKind = 'regen' | 'flag' | 'edit';

export interface SegmentAction {
  kind: SegmentActionKind;
  icon: string;
  labelKey: LanguageKey;
  disabled: boolean;
  active: boolean;
}

function flagLabel(row: SegmentRow): LanguageKey {
  return row.record?.flag ? 'audiobook.editor.seg.clearFlag' : 'audiobook.editor.seg.flag';
}

export function segmentActions(row: SegmentRow): SegmentAction[] {
  const hasAudio = row.record !== null;
  const running = isInProgress(row.state);
  return [
    {
      kind: 'regen',
      icon: 'refresh',
      labelKey: 'audiobook.editor.seg.regenerate',
      disabled: running,
      active: false,
    },
    {
      kind: 'flag',
      icon: 'flag',
      labelKey: flagLabel(row),
      disabled: !hasAudio || running,
      active: !!row.record?.flag,
    },
    {
      kind: 'edit',
      icon: 'pen',
      labelKey: 'audiobook.editor.seg.edit',
      disabled: false,
      active: false,
    },
  ];
}
