import { Component } from "@angular/core";
import { COVER_PALETTES, CoverSize, NovelCover } from "../app/features/novel/components/cover.component";
import { NovelProgressFrac } from "../app/features/novel/components/progress-frac.component";
import { Badge } from "../components/badge";
import { Icon } from "../components/icon";

type FracSample = { label: string; done: number; total: number };

const COVER_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 40'><rect width='30' height='40' fill='#2f6aa8'/><circle cx='15' cy='16' r='7' fill='#ffc285'/><rect y='28' width='30' height='12' fill='#0d1726'/></svg>";

@Component({
  selector: "app-novel-page",
  standalone: true,
  imports: [NovelCover, NovelProgressFrac, Badge, Icon],
  templateUrl: "./novel.page.html",
})
export class NovelPage {
  readonly palettes = COVER_PALETTES;
  readonly sizes: CoverSize[] = ["xs", "", "md", "lg"];
  readonly image = `data:image/svg+xml;utf8,${encodeURIComponent(COVER_SVG)}`;
  readonly fractions: FracSample[] = [
    { label: "Chưa có", done: 0, total: 12 },
    { label: "Một phần", done: 3, total: 12 },
    { label: "Đủ", done: 12, total: 12 },
    { label: "Novel rỗng", done: 0, total: 0 },
  ];
  readonly tags = ["fantasy", "dark-harbor", "slow-burn"];

  sizeLabel(size: CoverSize): string {
    return size || "default";
  }
}
