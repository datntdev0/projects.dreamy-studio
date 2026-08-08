import { Component } from "@angular/core";
import { COVER_PALETTES, CoverSize, NovelCover } from "../app/features/novel/components/cover.component";
import { NovelProgressFrac } from "../app/features/novel/components/progress-frac.component";
import { Badge } from "../components/badge";
import { Datatable, DatatableCell, DatatableColumn } from "../components/datatable";
import { Icon } from "../components/icon";

type FracSample = { label: string; done: number; total: number };
type NovelTableSample = { id: number; title: string; author: string; lang: string; chapters: string; words: string; translated: number; analyzed: number; total: number; updated: string; colors: string[] };

const COVER_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 40'><rect width='30' height='40' fill='#2f6aa8'/><circle cx='15' cy='16' r='7' fill='#ffc285'/><rect y='28' width='30' height='12' fill='#0d1726'/></svg>";

@Component({
  selector: "app-novel-page",
  standalone: true,
  imports: [NovelCover, NovelProgressFrac, Badge, Datatable, DatatableCell, Icon],
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
  readonly tableColumns: DatatableColumn[] = [
    { key: "title", label: "Novel" },
    { key: "lang", label: "Source", width: "80px" },
    { key: "chapters", label: "Chapters", align: "right", width: "90px" },
    { key: "words", label: "Words", align: "right", width: "100px" },
    { key: "translated", label: "Translation", align: "center", width: "120px" },
    { key: "analyzed", label: "Knowledge", align: "center", width: "120px" },
    { key: "updated", label: "Updated", width: "120px" },
  ];
  readonly tableRows: NovelTableSample[] = [
    { id: 1, title: "The Lantern Keeper of Harrowmere", author: "Mira Okonkwo", lang: "EN", chapters: "12", words: "29,400", translated: 3, analyzed: 12, total: 12, updated: "2026-06-01", colors: this.palettes[0] },
    { id: 2, title: "Gi\u00f3 Mu\u1ed9n Tr\u00ean \u0110\u1ed3i Th\u00f4ng", author: "Unknown", lang: "VI", chapters: "0", words: "0", translated: 0, analyzed: 0, total: 0, updated: "2026-06-02", colors: this.palettes[1] },
  ];

  novelSample(row: object): NovelTableSample {
    return row as NovelTableSample;
  }

  sizeLabel(size: CoverSize): string {
    return size || "default";
  }
}