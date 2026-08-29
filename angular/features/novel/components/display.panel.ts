import { Component, inject } from "@angular/core";
import { LanguageKey } from "@core/language/language.models";
import { CoreModule } from "@core/core.module";
import { Slider } from "@components/slider";
import { ReaderFont } from "../novel.models";
import { ReaderPaper } from "../novel.models";
import { NovelReaderService } from "../novel.reader.service";
import { READER_SIZE_RANGE } from "../novel.rules";
import { formatCount } from "../novel.rules";

interface DisplayOption<T> {
  value: T;
  label: LanguageKey;
}

const FONT_OPTIONS: DisplayOption<ReaderFont>[] = [
  { value: "serif", label: "novel.display.font.serif" },
  { value: "sans", label: "novel.display.font.sans" },
  { value: "mono", label: "novel.display.font.mono" },
];

const LH_OPTIONS: DisplayOption<number>[] = [
  { value: 1.5, label: "novel.display.lh.tight" },
  { value: 1.75, label: "novel.display.lh.normal" },
  { value: 2, label: "novel.display.lh.loose" },
];

const WIDTH_OPTIONS: DisplayOption<number>[] = [
  { value: 560, label: "novel.display.width.narrow" },
  { value: 680, label: "novel.display.width.medium" },
  { value: 820, label: "novel.display.width.wide" },
];

const PAPER_OPTIONS: DisplayOption<ReaderPaper>[] = [
  { value: "default", label: "novel.display.paper.default" },
  { value: "sepia", label: "novel.display.paper.sepia" },
  { value: "night", label: "novel.display.paper.night" },
];

@Component({
  selector: "app-novel-display-panel",
  standalone: true,
  imports: [CoreModule, Slider],
  templateUrl: "./display.panel.html",
})
export class NovelDisplayPanel {
  readonly reader = inject(NovelReaderService);
  readonly count = formatCount;
  readonly prefs = this.reader.prefs;
  readonly fonts = FONT_OPTIONS;
  readonly lineHeights = LH_OPTIONS;
  readonly widths = WIDTH_OPTIONS;
  readonly papers = PAPER_OPTIONS;
  readonly sizeRange = READER_SIZE_RANGE;

  setFont(font: ReaderFont): void {
    this.reader.setPref("font", font);
  }

  setLineHeight(lh: number): void {
    this.reader.setPref("lh", lh);
  }

  setWidth(width: number): void {
    this.reader.setPref("width", width);
  }

  setPaper(paper: ReaderPaper): void {
    this.reader.setPref("paper", paper);
  }

  onSize(value: number): void {
    this.reader.setPref("size", value);
  }

  onNums(event: Event): void {
    this.reader.setPref("nums", (event.target as HTMLInputElement).checked);
  }

  onJustify(event: Event): void {
    this.reader.setPref("justify", (event.target as HTMLInputElement).checked);
  }

  reset(): void {
    this.reader.resetPrefs();
  }
}
