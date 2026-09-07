import { pipelineRun } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

import { DictProposal, TranslationFinding, TranslationReview } from './assistant.models';
// prettier-ignore
import { canRun, countResolved, countSeverity, markText, OP_ICONS, OP_KEYS, overwritesAudio, pendingIds, PIPELINE_MODE_KEYS, PIPELINE_RUN_KINDS, runItemIds, runKindOf, STATUS_KEYS } from './assistant.proposals';

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

  it('runs a pipeline proposal only while it is pending and has tasks', () => {
    expect(canRun(pipelineRun())).toBe(true);
    expect(canRun(pipelineRun({ totalTasks: 0 }))).toBe(false);
    expect(canRun(pipelineRun({ status: 'applied' }))).toBe(false);
    expect(canRun(pipelineRun({ status: 'rejected' }))).toBe(false);
  });

  it('lists the item ids and maps the job to the pipeline kind', () => {
    expect(runItemIds(pipelineRun())).toEqual(['c1', 'c2']);
    expect(runItemIds(pipelineRun({ items: [] }))).toEqual([]);
    expect(runKindOf(pipelineRun({ job: 'translation' }))).toBe('translation');
    expect(runKindOf(pipelineRun({ job: 'analysis' }))).toBe('analysis');
    expect(runKindOf(pipelineRun({ job: 'synthesis' }))).toBe('audio');
    expect(Object.keys(PIPELINE_RUN_KINDS)).toEqual(['translation', 'analysis', 'synthesis']);
  });

  it('overwrites audio for the all mode or an explicit overwrite', () => {
    expect(overwritesAudio(pipelineRun({ mode: 'missing' }))).toBe(false);
    expect(overwritesAudio(pipelineRun({ mode: null }))).toBe(false);
    expect(overwritesAudio(pipelineRun({ mode: 'all' }))).toBe(true);
    expect(overwritesAudio(pipelineRun({ mode: 'missing', overwrite: true }))).toBe(true);
    expect(Object.keys(PIPELINE_MODE_KEYS)).toEqual(['missing', 'all']);
  });
});
