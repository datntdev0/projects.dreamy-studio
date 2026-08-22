import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { CoreModule } from "@app/core/core.module";
import { EntityTypeDef } from "../novel.knowledge.models";
import { NovelKnowledgeService } from "../novel.knowledge.service";

@Component({
  selector: "app-novel-knowledge-type",
  standalone: true,
  imports: [Icon, CoreModule],
  templateUrl: "./knowledge-type.component.html",
})
export class NovelKnowledgeType {
  private readonly knowledge = inject(NovelKnowledgeService);

  readonly type = input.required<string>();
  readonly def = computed(this.buildDef.bind(this));

  private buildDef(): EntityTypeDef | undefined {
    return this.knowledge.ontology().typeDef(this.type());
  }
}
