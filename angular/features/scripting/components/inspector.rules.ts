import { ProjectModuleId } from '@features/project/project.models';
import { LanguageKey } from '@shared/language/language.models';

import { castUsage } from '../scripting.edit';
// prettier-ignore
import { BlockType, CastMember, Script, ScriptConfig, ScriptIssue, ScriptMetrics, UnitStatus } from '../scripting.models';
import { paragraphChapter, paragraphNumber } from '../scripting.rules';

export const MAX_INSPECTOR_ISSUES = 8;

export interface WhoRow {
  id: string;
  words: number;
  percent: number;
}

export interface TypeRow {
  type: BlockType;
  count: number;
  percent: number;
}

export interface CastRow {
  member: CastMember;
  used: number;
  manual: boolean;
  removable: boolean;
  deleteKey: LanguageKey;
}

export interface StatusBadge {
  key: LanguageKey;
  className: string;
}

export interface EvidenceRef {
  ref: string;
  chapter: number;
  paragraph: number;
}

const STATUS_BADGES: Record<UnitStatus, StatusBadge> = {
  locked: { key: 'scripting.status.locked', className: 'badge-success' },
  review: { key: 'scripting.status.review', className: 'badge-warning' },
  draft: { key: 'scripting.status.draft', className: '' },
};

const GENERATING_BADGE: StatusBadge = {
  key: 'scripting.status.generating',
  className: 'badge-running',
};

function percentOf(value: number, total: number): number {
  return Math.round((value / (total || 1)) * 100);
}

export function nextModuleOf(config: ScriptConfig): ProjectModuleId {
  return config.types.includes('narration') ? 'audiobook' : 'storyboard';
}

export function statusBadgeOf(status: UnitStatus, generating: boolean): StatusBadge {
  return generating ? GENERATING_BADGE : STATUS_BADGES[status];
}

export function whoRowsOf(metrics: ScriptMetrics): WhoRow[] {
  const entries = Object.entries(metrics.byWho);
  const total = entries.reduce((sum, [, words]) => sum + words, 0);
  return entries
    .sort((left, right) => right[1] - left[1])
    .map(([id, words]) => ({ id, words, percent: percentOf(words, total) }));
}

export function typeRowsOf(metrics: ScriptMetrics): TypeRow[] {
  const entries = Object.entries(metrics.byType) as [BlockType, number][];
  return entries.map(([type, count]) => ({
    type,
    count,
    percent: percentOf(count, metrics.blocks),
  }));
}

export function visibleIssues(issues: ScriptIssue[]): ScriptIssue[] {
  return issues.slice(0, MAX_INSPECTOR_ISSUES);
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

export function evidenceOf(refs: string[]): EvidenceRef[] {
  return refs.map((ref) => ({
    ref,
    chapter: paragraphChapter(ref),
    paragraph: paragraphNumber(ref),
  }));
}
