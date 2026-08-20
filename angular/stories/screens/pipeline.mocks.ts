import { Injectable, computed } from "@angular/core";
import { PipelineSnapshot } from "@app/features/novel/novel.translation.models";
import { PipelineService } from "@app/features/pipeline/pipeline.service";

function isRunning(pipeline: PipelineSnapshot): boolean {
  return pipeline.status === "running";
}

@Injectable()
export class ConcurrentPipelineService extends PipelineService {
  override readonly running = computed(this.buildConcurrent.bind(this));

  private buildConcurrent(): PipelineSnapshot[] {
    return this.history().filter(isRunning);
  }
}
