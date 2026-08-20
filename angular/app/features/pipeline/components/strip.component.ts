import { Component, computed, inject, input } from "@angular/core";
import { I18nService } from "@app/core/i18n/i18n.service";
import { PipelineSnapshot } from "@app/features/novel/novel.translation.models";
import { PipelineBar } from "../pipeline.models";
import { barOf } from "../pipeline.rules";

@Component({
  selector: "app-pipeline-strip",
  standalone: true,
  templateUrl: "./strip.component.html",
})
export class PipelineStrip {
  private readonly i18n = inject(I18nService);

  readonly pipeline = input.required<PipelineSnapshot>();
  readonly bar = computed(this.buildBar.bind(this));
  readonly label = computed(this.buildLabel.bind(this));

  private buildBar(): PipelineBar {
    return barOf(this.pipeline());
  }

  private buildLabel(): string {
    const pipeline = this.pipeline();
    return this.i18n.translate("pipeline.strip.label", { done: pipeline.done, total: pipeline.total });
  }
}
