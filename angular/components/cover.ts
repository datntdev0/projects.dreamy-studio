import { Component, Input } from "@angular/core";
import { Icon } from "./icon";

export type CoverSize = "" | "xs" | "md" | "lg";

const PLACEHOLDER_ICON_SIZES: Record<CoverSize, number> = { xs: 0, "": 12, md: 18, lg: 32 };

export function coverBackground(image: string): string {
  return image ? `url("${image}") center / cover no-repeat` : "";
}

@Component({
  selector: "ds-cover",
  standalone: true,
  imports: [Icon],
  templateUrl: "./cover.html",
})
export class Cover {
  @Input() image = "";
  @Input() size: CoverSize = "";

  get background(): string {
    return coverBackground(this.image);
  }

  get placeholderSize(): number {
    return PLACEHOLDER_ICON_SIZES[this.size];
  }
}
