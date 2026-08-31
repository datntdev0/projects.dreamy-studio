import { describe, expect, it } from 'vitest';

import { DictProposal, TranslationFinding, TranslationReview } from './assistant.models';
// prettier-ignore
import { countResolved, countSeverity, markText, OP_ICONS, OP_KEYS, pendingIds, STATUS_KEYS } from './assistant.proposals';

const finding = (
  id: string,
  severity: TranslationFinding['severity'],
  status: TranslationFinding['status'],
): TranslationFinding => ({
  id,
  n: 1,
  severity,
  category: 'name',
  source: '',
  current: '',
  suggested: '',
  from: '',
  to: '',
  reason: '',
  status,
});
const entry = (id: string, status: DictProposal['status']): DictProposal => ({
  id,
  src: '',
  dst: '',
  type: 'term',
  note: '',
  occurrences: 1,
  status,
});

describe('assistant.proposals', () => {
  it('marks text', () => {
    expect(markText('hello world', 'lo w')).toEqual({ before: 'hel', mark: 'lo w', after: 'orld' });
    expect(markText('hello', '')).toEqual({ before: 'hello', mark: '', after: '' });
    expect(markText('hello', 'zzz')).toEqual({ before: 'hello', mark: '', after: '' });
  });

  it('counts proposals', () => {
    const review: TranslationReview = {
      kind: 'translation_review',
      chapter: 1,
      chapterTitle: '',
      target: 'VI',
      checked: 1,
      findings: [finding('f1', 'error', 'pending'), finding('f2', 'warning', 'applied')],
      dictionary: [entry('d1', 'pending'), entry('d2', 'rejected')],
    };
    expect(pendingIds(review)).toEqual(['f1', 'd1']);
    expect(countSeverity(review.findings, 'error')).toBe(1);
    expect(countSeverity(review.findings, 'info')).toBe(0);
    expect(countResolved([...review.findings, ...review.dictionary])).toBe(2);
  });

  it('covers every operation and status', () => {
    expect(Object.keys(OP_KEYS)).toEqual(Object.keys(OP_ICONS));
    expect(STATUS_KEYS.pending).toBe('assistant.proposal.pending');
  });
});
