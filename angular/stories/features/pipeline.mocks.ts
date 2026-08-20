import { Provider, computed, signal } from "@angular/core";
import { ChapterRow, NovelError } from "@app/features/novel/novel.models";
import { PipelineSnapshot } from "@app/features/novel/novel.translation.models";
import { PipelineService } from "@app/features/pipeline/pipeline.service";
import { totalsOf } from "@app/features/pipeline/pipeline.rules";
import { LANTERN_CHAPTERS } from "../screens/novel-translation.fixtures";
import { NOVEL_NAMES } from "./pipeline.fixtures";

export interface PipelineScenario {
  pipelines?: PipelineSnapshot[];
  running?: PipelineSnapshot[];
  selectedId?: number | null;
  loaded?: boolean;
  error?: NovelError | null;
}

function chapterRow(novelId: number, chapterId: string): ChapterRow {
  const seq = Number(chapterId.slice(3));
  const stamp = "2026-11-09T09:15:00Z";
  return { id: chapterId, novelId, seq, title: LANTERN_CHAPTERS[seq - 1]?.title ?? "", wordCount: 0, translationStatus: "none", analysisStatus: "none", createdAt: stamp, updatedAt: stamp };
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
    novelName: (novelId) => NOVEL_NAMES[novelId] ?? `#${novelId}`,
    chapterOf: chapterRow,
    load: () => Promise.resolve(),
    select: (id) => selectedId.set(id),
    openLog: (id) => selectedId.set(id),
    cancel: () => Promise.resolve(),
  };
}

export function pipelineProvider(scenario: PipelineScenario = {}): Provider {
  return { provide: PipelineService, useValue: serviceMock(scenario) };
}
