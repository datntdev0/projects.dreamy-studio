import { Component, computed, input } from "@angular/core";
import { Icon } from "@components/icon";
import { CoreModule } from "@app/core/core.module";
import { EntityTypeDef } from "../novel.knowledge.models";
import { typeDef } from "../novel.knowledge.ontology";

@Component({
  selector: "app-novel-knowledge-type",
  standalone: true,
  imports: [Icon, CoreModule],
  templateUrl: "./knowledge-type.component.html",
})
export class NovelKnowledgeType {
  readonly type = input.required<string>();
  readonly def = computed(this.buildDef.bind(this));

  private buildDef(): EntityTypeDef | undefined {
    return typeDef(this.type());
  }
}
