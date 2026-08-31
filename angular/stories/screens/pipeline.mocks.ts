import { computed, Injectable } from '@angular/core';
import { PipelineSnapshot } from '@features/novel/novel.translation.models';
import { PipelineService } from '@features/pipeline/pipeline.service';

function isRunning(pipeline: PipelineSnapshot): boolean {
  return pipeline.status === 'running';
}

@Injectable()
export class ConcurrentPipelineService extends PipelineService {
  override readonly running = computed(this.buildConcurrent.bind(this));

  private buildConcurrent(): PipelineSnapshot[] {
    return this.history().filter(isRunning);
  }
}
