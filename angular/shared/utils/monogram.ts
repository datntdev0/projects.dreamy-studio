const MONOGRAM_TONES = 4;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function fnvStep(hash: number, character: string): number {
  return Math.imul(hash ^ character.charCodeAt(0), FNV_PRIME);
}

function toChars(word: string): string[] {
  return Array.from(word);
}

function firstChar(chars: string[]): string {
  return chars[0];
}

export function nameTone(name: string): number {
  return ([...name].reduce(fnvStep, FNV_OFFSET) >>> 0) % MONOGRAM_TONES;
}

export function nameWords(name: string): string[][] {
  return name.trim().split(/\s+/).filter(Boolean).map(toChars);
}

export function leadingMonogram(name: string, limit: number): string {
  const words = nameWords(name);
  if (words.length === 0) return '?';
  const letters = words.length > 1 ? words.slice(0, limit).map(firstChar) : words[0].slice(0, 2);
  return letters.join('').toLocaleUpperCase();
}
