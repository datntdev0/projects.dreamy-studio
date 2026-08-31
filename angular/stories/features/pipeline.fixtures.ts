// prettier-ignore
import { PipelineSnapshot, PipelineStatus, PipelineTask, TaskStatus } from '@features/novel/novel.translation.models';

export const NOVEL_NAMES: Record<number, string> = {
  1: 'Người giữ đèn Harrowmere',
  2: 'Gió qua thung lũng',
};

interface TaskSpec {
  chapter: number;
  status: TaskStatus;
  passage?: number;
  progress?: number;
  error?: string;
}

interface PipelineSpec {
  id: number;
  novelId: number;
  kind?: string;
  target: string;
  status: PipelineStatus;
  startedAt: string;
  finishedAt: string | null;
  tasks: TaskSpec[];
}

const TASK_STEP_MS = 24000;
const TASK_SPAN_MS = 21000;
const MINUTE_MS = 60000;

function shifted(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

function taskOf(spec: TaskSpec, index: number, base: string): PipelineTask {
  const startedAt = shifted(base, index * TASK_STEP_MS);
  const started = spec.status === 'queued' ? null : startedAt;
  const done =
    spec.status === 'completed' || spec.status === 'failed' || spec.status === 'cancelled';
  const finished = done ? shifted(startedAt, TASK_SPAN_MS) : null;
  const progress = spec.status === 'completed' ? 100 : (spec.progress ?? 0);
  return {
    id: index + 1,
    chapterId: `ch-${spec.chapter}`,
    passage: spec.passage ?? null,
    status: spec.status,
    progress,
    error: spec.error ?? '',
    startedAt: started,
    finishedAt: finished,
  };
}

function count(tasks: PipelineTask[], status: TaskStatus): number {
  return tasks.filter((task) => task.status === status).length;
}

function pipelineOf(spec: PipelineSpec): PipelineSnapshot {
  const tasks = spec.tasks.map((task, index) => taskOf(task, index, spec.startedAt));
  return {
    id: spec.id,
    novelId: spec.novelId,
    kind: spec.kind ?? 'translation',
    target: spec.target,
    status: spec.status,
    total: tasks.length,
    done: count(tasks, 'completed'),
    failed: count(tasks, 'failed'),
    createdAt: spec.startedAt,
    startedAt: spec.startedAt,
    finishedAt: spec.finishedAt,
    tasks,
  };
}

function chapters(from: number, to: number, status: TaskStatus): TaskSpec[] {
  const out: TaskSpec[] = [];
  for (let chapter = from; chapter <= to; chapter += 1) {
    out.push({ chapter, status });
  }
  return out;
}

function minutesAgo(minutes: number, seconds = 0): string {
  return new Date(Date.now() - minutes * MINUTE_MS - seconds * 1000).toISOString();
}

export function runningPipeline(novelId = 1): PipelineSnapshot {
  return pipelineOf({
    id: 5,
    novelId,
    target: 'VI',
    status: 'running',
    startedAt: minutesAgo(2, 14),
    finishedAt: null,
    tasks: [
      ...chapters(1, 2, 'completed'),
      { chapter: 3, status: 'running', progress: 60 },
      { chapter: 4, status: 'running', progress: 20 },
      ...chapters(5, 12, 'queued'),
    ],
  });
}

export function runningAnalysis(novelId = 2): PipelineSnapshot {
  return pipelineOf({
    id: 6,
    novelId,
    kind: 'analysis',
    target: 'Knowledge',
    status: 'running',
    startedAt: minutesAgo(6, 40),
    finishedAt: null,
    tasks: [
      ...chapters(1, 8, 'completed'),
      { chapter: 9, status: 'running', progress: 75 },
      { chapter: 10, status: 'running', progress: 40 },
      ...chapters(11, 12, 'queued'),
    ],
  });
}

export function runningAudio(novelId = 1): PipelineSnapshot {
  return pipelineOf({
    id: 7,
    novelId,
    kind: 'audio',
    target: 'Voice An',
    status: 'running',
    startedAt: minutesAgo(1, 5),
    finishedAt: null,
    tasks: [
      ...chapters(1, 2, 'completed'),
      { chapter: 3, status: 'running', progress: 35 },
      ...chapters(4, 8, 'queued'),
    ],
  });
}

export function runningRender(novelId = 1): PipelineSnapshot {
  return pipelineOf({
    id: 8,
    novelId,
    kind: 'render',
    target: '1080p',
    status: 'running',
    startedAt: minutesAgo(12, 30),
    finishedAt: null,
    tasks: [
      ...chapters(1, 3, 'completed'),
      { chapter: 4, status: 'running', progress: 82 },
      { chapter: 5, status: 'queued' },
    ],
  });
}

export function runningLarge(novelId = 2): PipelineSnapshot {
  return pipelineOf({
    id: 9,
    novelId,
    kind: 'analysis',
    target: 'Knowledge',
    status: 'running',
    startedAt: minutesAgo(41, 8),
    finishedAt: null,
    tasks: [
      ...chapters(1, 74, 'completed'),
      { chapter: 75, status: 'failed', error: 'Ontology parse error' },
      ...chapters(76, 96, 'completed'),
      { chapter: 97, status: 'running', progress: 55 },
      { chapter: 98, status: 'running', progress: 10 },
      ...chapters(99, 160, 'queued'),
    ],
  });
}

export function pipelineHistory(): PipelineSnapshot[] {
  return [
    pipelineOf({
      id: 4,
      novelId: 1,
      target: 'VI',
      status: 'failed',
      startedAt: '2026-11-16T14:05:00Z',
      finishedAt: '2026-11-16T14:09:12Z',
      tasks: [
        ...chapters(1, 2, 'completed'),
        { chapter: 3, status: 'failed', error: 'Provider timed out after 120s' },
        { chapter: 4, status: 'failed', passage: 2, error: 'Output was not valid JSON' },
        { chapter: 5, status: 'completed' },
      ],
    }),
    pipelineOf({
      id: 3,
      novelId: 2,
      target: 'EN',
      status: 'completed',
      startedAt: '2026-11-16T09:40:00Z',
      finishedAt: '2026-11-16T09:40:21Z',
      tasks: [{ chapter: 2, passage: 4, status: 'completed' }],
    }),
    pipelineOf({
      id: 2,
      novelId: 1,
      target: 'VI',
      status: 'cancelled',
      startedAt: '2026-11-15T20:12:00Z',
      finishedAt: '2026-11-15T20:14:48Z',
      tasks: [...chapters(1, 3, 'completed'), ...chapters(4, 8, 'cancelled')],
    }),
    pipelineOf({
      id: 1,
      novelId: 1,
      target: 'VI',
      status: 'completed',
      startedAt: '2026-11-15T10:00:00Z',
      finishedAt: '2026-11-15T10:06:05Z',
      tasks: chapters(1, 12, 'completed'),
    }),
  ];
}

export function mixedHistory(): PipelineSnapshot[] {
  return [
    pipelineOf({
      id: 14,
      novelId: 1,
      kind: 'audio',
      target: 'Voice An',
      status: 'failed',
      startedAt: '2026-11-17T08:20:00Z',
      finishedAt: '2026-11-17T08:22:40Z',
      tasks: [
        ...chapters(1, 4, 'completed'),
        { chapter: 5, status: 'failed', error: 'TTS model is not loaded: vieneu-v2' },
        ...chapters(6, 8, 'cancelled'),
      ],
    }),
    pipelineOf({
      id: 13,
      novelId: 2,
      kind: 'analysis',
      target: 'Knowledge',
      status: 'completed',
      startedAt: '2026-11-17T07:55:00Z',
      finishedAt: '2026-11-17T08:03:18Z',
      tasks: chapters(1, 18, 'completed'),
    }),
    pipelineOf({
      id: 12,
      novelId: 1,
      kind: 'render',
      target: '1080p',
      status: 'completed',
      startedAt: '2026-11-16T22:10:00Z',
      finishedAt: '2026-11-16T22:31:45Z',
      tasks: chapters(1, 5, 'completed'),
    }),
    ...pipelineHistory(),
  ];
}
