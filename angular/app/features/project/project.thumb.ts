const PALETTES: string[][] = [
  ["--acc-midnight", "--primary", "--acc-twilight"],
  ["--acc-midnight", "--acc-breeze", "--acc-sunset"],
  ["--acc-sunset", "--secondary", "--acc-midnight"],
  ["--acc-midnight", "--secondary", "--acc-sunset"],
  ["--acc-twilight", "--primary", "--acc-midnight"],
  ["--acc-breeze", "--acc-midnight", "--primary"],
];

const DISCS = ["--acc-twilight", "--acc-sunset", "--acc-breeze"];

function hashOf(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

class SeededRandom {
  private state: number;

  constructor(seed: string) {
    this.state = hashOf(seed);
  }

  next(): number {
    this.state = (this.state | 0) + 0x6d2b79f5 | 0;
    let mixed = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }
}

export function thumbBackground(seed: string): string {
  const random = new SeededRandom(seed);
  const palette = PALETTES[Math.floor(random.next() * PALETTES.length)];
  const angle = Math.floor(random.next() * 360);
  const x = 15 + Math.floor(random.next() * 70);
  const y = 15 + Math.floor(random.next() * 45);
  const size = 4 + Math.floor(random.next() * 7);
  const discs: string[] = [];
  for (const disc of DISCS) {
    if (disc !== palette[2] && disc !== palette[0]) {
      discs.push(disc);
    }
  }
  const disc = discs[Math.floor(random.next() * discs.length)];
  return `radial-gradient(circle at ${x}% ${y}%, color-mix(in srgb, var(${disc}) 90%, transparent) 0 ${size}%, transparent ${size + 1}%), linear-gradient(${angle}deg, var(${palette[0]}), var(${palette[1]}) 58%, var(${palette[2]}))`;
}
