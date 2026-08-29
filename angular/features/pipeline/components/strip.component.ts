import { Component, computed, inject, input } from "@angular/core";
import { LanguageService } from "@core/language/language.service";
import { PipelineSnapshot } from "@features/novel/novel.translation.models";
import { PipelineBar } from "../pipeline.models";
import { barOf } from "../pipeline.rules";

@Component({
  selector: "app-pipeline-strip",
  standalone: true,
  templateUrl: "./strip.component.html",
})
export class PipelineStrip {
  private readonly languageService = inject(LanguageService);

  readonly pipeline = input.required<PipelineSnapshot>();
  readonly bar = computed(this.buildBar.bind(this));
  readonly label = computed(this.buildLabel.bind(this));

  private buildBar(): PipelineBar {
    return barOf(this.pipeline());
  }

  private buildLabel(): string {
    const pipeline = this.pipeline();
    return this.languageService.translate("pipeline.strip.label", { done: pipeline.done, total: pipeline.total });
  }
}
