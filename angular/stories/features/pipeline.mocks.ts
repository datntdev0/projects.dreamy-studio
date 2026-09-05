import { computed, Provider, signal } from '@angular/core';
import { NovelError } from '@features/novel/novel.models';
import { PipelineSnapshot } from '@features/novel/novel.translation.models';
import { PipelineChapter } from '@features/pipeline/pipeline.models';
import { totalsOf } from '@features/pipeline/pipeline.rules';
import { PipelineService } from '@features/pipeline/pipeline.service';

import { LANTERN_CHAPTERS } from '../screens/novel-translation.fixtures';
import { NOVEL_NAMES, PROJECT_NAMES } from './pipeline.fixtures';

export interface PipelineScenario {
  pipelines?: PipelineSnapshot[];
  running?: PipelineSnapshot[];
  selectedId?: number | null;
  loaded?: boolean;
  error?: NovelError | null;
}

function chapterOf(_pipeline: PipelineSnapshot, chapterId: string): PipelineChapter {
  const seq = Number(chapterId.slice(3));
  return { seq, title: LANTERN_CHAPTERS[seq - 1]?.title ?? '' };
}

function ownerName(pipeline: PipelineSnapshot): string {
  if (pipeline.projectId !== null) {
    return PROJECT_NAMES[pipeline.projectId] ?? `#${pipeline.projectId}`;
  }
  const novelId = pipeline.novelId ?? 0;
  return NOVEL_NAMES[novelId] ?? `#${novelId}`;
}

function serviceMock(scenario: PipelineScenario): Partial<PipelineService> {
  const running = signal(scenario.running ?? []);
  const history = signal([...(scenario.running ?? []), ...(scenario.pipelines ?? [])]);
  const selectedId = signal<number | null>(scenario.selectedId ?? null);
  const selected = computed(() => history().find((item) => item.id === selectedId()) ?? null);
  return {
    loaded: signal(scenario.loaded ?? true),
    loading: signal(false),
    error: signal(scenario.error ?? null),
    selectedId,
    running,
    history,
    selected,
    totals: computed(() => totalsOf(running())),
    ownerName,
    chapterOf,
    load: () => Promise.resolve(),
    select: (id) => selectedId.set(id),
    openLog: (id) => selectedId.set(id),
    cancel: () => Promise.resolve(),
  };
}

export function pipelineProvider(scenario: PipelineScenario = {}): Provider {
  return { provide: PipelineService, useValue: serviceMock(scenario) };
}
