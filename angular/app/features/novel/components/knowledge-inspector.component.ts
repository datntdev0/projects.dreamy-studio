import { Component, computed, inject, input } from "@angular/core";
import { CoreModule } from "@app/core/core.module";
import { KnowledgeItem } from "../novel.knowledge.models";
import { NovelKnowledgeService } from "../novel.knowledge.service";
import { NovelKnowledgeDetail } from "./knowledge-detail.component";

@Component({
  selector: "app-novel-knowledge-inspector",
  standalone: true,
  imports: [CoreModule, NovelKnowledgeDetail],
  templateUrl: "./knowledge-inspector.component.html",
})
export class NovelKnowledgeInspector {
  private readonly knowledge = inject(NovelKnowledgeService);

  readonly novelId = input.required<number>();
  readonly item = computed(this.buildItem.bind(this));

  private buildItem(): KnowledgeItem | null {
    const sel = this.knowledge.viewOf(this.novelId()).sel;
    return sel === null ? null : (this.knowledge.of(this.novelId()).items.find((item) => item.id === sel) ?? null);
  }
}
