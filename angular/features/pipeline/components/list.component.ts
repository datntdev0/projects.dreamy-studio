import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { Icon } from "@components/icon";
import { CoreModule } from "@core/core.module";
import { PIPELINE_KINDS } from "../pipeline.rules";
import { PipelineService } from "../pipeline.service";
import { PipelineItem } from "./item.component";

const CLOCK_MS = 1000;

@Component({
  selector: "app-pipeline-list",
  standalone: true,
  imports: [Icon, CoreModule, PipelineItem],
  templateUrl: "./list.component.html",
})
export class PipelineList implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly pipelines = inject(PipelineService);
  readonly kinds = Object.values(PIPELINE_KINDS);
  readonly now = signal(Date.now());

  ngOnInit(): void {
    const timer = setInterval(this.tick.bind(this), CLOCK_MS);
    this.destroyRef.onDestroy(clearInterval.bind(null, timer));
  }

  private tick(): void {
    this.now.set(Date.now());
  }
}
