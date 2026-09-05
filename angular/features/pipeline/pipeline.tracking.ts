// prettier-ignore
import { PipelineEvent, PipelineSnapshot, PipelineTask } from '@features/novel/novel.translation.models';

function replaceTask(tasks: PipelineTask[], next: PipelineTask): PipelineTask[] {
  const result: PipelineTask[] = [];
  for (const task of tasks) {
    result.push(task.id === next.id ? next : task);
  }
  return result;
}

function taskTotals(tasks: PipelineTask[]): { done: number; failed: number } {
  let done = 0;
  let failed = 0;
  for (const task of tasks) {
    if (task.status === 'completed') {
      done += 1;
    }
    if (task.status === 'failed') {
      failed += 1;
    }
  }
  return { done, failed };
}

function withSnapshot(pipeline: PipelineSnapshot, next: PipelineSnapshot): PipelineSnapshot {
  return pipeline.id === next.id
    ? { ...pipeline, status: next.status, startedAt: next.startedAt }
    : pipeline;
}

function withTask(
  pipeline: PipelineSnapshot,
  pipelineId: number,
  task: PipelineTask,
): PipelineSnapshot {
  if (pipeline.id !== pipelineId) {
    return pipeline;
  }
  const tasks = replaceTask(pipeline.tasks, task);
  return { ...pipeline, ...taskTotals(tasks), tasks };
}

export function withoutPipeline(
  running: PipelineSnapshot[],
  pipelineId: number,
): PipelineSnapshot[] {
  return running.filter((pipeline) => pipeline.id !== pipelineId);
}

export function withStarted(
  running: PipelineSnapshot[],
  pipeline: PipelineSnapshot,
): PipelineSnapshot[] {
  return [...withoutPipeline(running, pipeline.id), pipeline];
}

export function trackPipeline(
  running: PipelineSnapshot[],
  event: PipelineEvent,
): PipelineSnapshot[] {
  switch (event.type) {
    case 'started':
      return withStarted(running, event.pipeline);
    case 'updated':
      return running.map((pipeline) => withSnapshot(pipeline, event.pipeline));
    case 'task':
      return running.map((pipeline) => withTask(pipeline, event.pipelineId, event.task));
    default:
      return withoutPipeline(running, event.pipeline.id);
  }
}
