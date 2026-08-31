export interface Identified {
  id: number;
}

export function replaceById<T extends Identified>(items: T[], next: T): T[] {
  return items.map((item) => (item.id === next.id ? next : item));
}

export function withoutIds<T extends Identified>(items: T[], ids: Set<number>): T[] {
  return items.filter((item) => !ids.has(item.id));
}

export function withoutKeys<V>(record: Record<number, V>, ids: Set<number>): Record<number, V> {
  const entries = Object.entries(record).filter(([key]) => !ids.has(Number(key)));
  return Object.fromEntries(entries) as Record<number, V>;
}

export function pickByIds<T extends Identified>(items: T[], ids: number[]): T[] {
  const picked = new Set(ids);
  return items.filter((item) => picked.has(item.id));
}
