import { Component, Input, OnInit, inject } from "@angular/core";
import { Cover } from "@components/cover";
import { DialogItem } from "@app/core/dialog/dialog.models";
import { NovelSummary } from "../novel.models";
import { NovelService } from "../novel.service";

@Component({
  selector: "app-novel-confirm-thumb",
  standalone: true,
  imports: [Cover],
  template: `<ds-cover size="md" [image]="image()" data-testid="novel-confirm-thumb-cover" />`,
  host: { "data-testid": "novel-confirm-thumb" },
})
export class NovelConfirmThumb implements OnInit {
  private readonly novels = inject(NovelService);

  @Input() item: DialogItem = { name: "" };

  ngOnInit(): void {
    this.novels.ensureCover(this.novel());
  }

  image(): string {
    return this.novels.coverUrl(this.novel()) ?? "";
  }

  private novel(): NovelSummary {
    return this.item.data as NovelSummary;
  }
}
