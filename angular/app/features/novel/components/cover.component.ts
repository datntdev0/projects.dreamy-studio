import { Component, Input } from "@angular/core";

export type CoverSize = "" | "xs" | "md" | "lg";

export const COVER_PALETTES: string[][] = [
  ["var(--acc-midnight)", "var(--primary)", "var(--acc-twilight)"],
  ["var(--acc-sunset)", "var(--secondary)", "var(--acc-midnight)"],
  ["var(--acc-midnight)", "var(--acc-breeze)", "var(--acc-sunset)"],
];

export function coverColorsFor(seed: number): string[] {
  return COVER_PALETTES[Math.abs(Math.trunc(seed)) % COVER_PALETTES.length];
}

export function coverBackground(colors: string[], image: string): string {
  if (image) {
    return `url("${image}") center / cover no-repeat`;
  }
  const palette = colors.length >= 3 ? colors : COVER_PALETTES[0];
  return `linear-gradient(160deg,${palette[0]},${palette[1]} 55%,${palette[2]})`;
}

@Component({
  selector: "app-novel-cover",
  standalone: true,
  templateUrl: "./cover.component.html",
})
export class NovelCover {
  @Input() colors: string[] = COVER_PALETTES[0];
  @Input() image = "";
  @Input() size: CoverSize = "";

  get background(): string {
    return coverBackground(this.colors, this.image);
  }
}
