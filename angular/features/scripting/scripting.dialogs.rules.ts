import { DraftOption, ScriptUnit } from './scripting.models';
import { chaptersOf } from './scripting.rules';

const FALLBACK_PROVIDER = 'claude';

export interface DialogProvider {
  id: string;
  name: string;
  ready: boolean;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function formatMoney(value: number): string {
  return `≈ $${value.toFixed(2)}`;
}

export function chapterSpan(unit: Pick<ScriptUnit, 'ch' | 'chs'>): string | null {
  const chapters = chaptersOf(unit);
  if (chapters.length === 0) {
    return null;
  }
  const first = chapters[0];
  const last = chapters[chapters.length - 1];
  return chapters.length > 1 ? `${first}–${last}` : `${first}`;
}

export function defaultProviderId(providers: DialogProvider[], current: string): string {
  if (providers.some((provider) => provider.id === current)) {
    return current;
  }
  const preferred = providers.find(
    (provider) => provider.id === FALLBACK_PROVIDER && provider.ready,
  );
  const ready = providers.find((provider) => provider.ready);
  return (preferred ?? ready ?? providers[0])?.id ?? current;
}

export function overwriteCount(options: DraftOption[], selected: string[]): number {
  return options.filter((option) => selected.includes(option.unit.id) && option.hasContent).length;
}
