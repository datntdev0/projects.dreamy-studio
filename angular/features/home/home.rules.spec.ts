import { pipeline, project, projectModuleState, task } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { failedCount, greetingKey, libraryTotal, moduleAttention, pipelineAttention, projectCard, recentActivity, recentLiveProjects } from './home.rules';

function ownerOf(): string {
  return 'Owner';
}

describe('home.rules', () => {
  it('greets by the hour', () => {
    expect(greetingKey(8)).toBe('home.greeting.morning');
    expect(greetingKey(12)).toBe('home.greeting.afternoon');
    expect(greetingKey(18)).toBe('home.greeting.evening');
  });

  it('lists recent live projects, newest opened first', () => {
    const list = [
      project({ id: 1, openedAt: '2026-11-01T00:00:00Z' }),
      project({ id: 2, openedAt: '2026-11-03T00:00:00Z' }),
      project({ id: 3, openedAt: '2026-11-04T00:00:00Z', archived: true }),
      project({ id: 4, openedAt: '2026-11-02T00:00:00Z' }),
    ];
    expect(recentLiveProjects(list, 2).map((item) => item.id)).toEqual([2, 4]);
  });

  it('builds a card from enabled module states only', () => {
    const card = projectCard(project({ modules: ['scripting', 'audiobook'] }), [
      projectModuleState({ id: 'scripting', state: 'done' }),
      projectModuleState({ id: 'audiobook', state: 'idle' }),
      projectModuleState({ id: 'video', state: 'done' }),
    ]);
    expect(card.states.map((state) => state.id)).toEqual(['scripting', 'audiobook']);
    expect(card.percent).toBe(50);
  });

  it('raises attention for stale modules', () => {
    const card = projectCard(project({ id: 7, name: 'Harrowmere' }), [
      projectModuleState({ id: 'audiobook', state: 'stale', note: '2 need review' }),
      projectModuleState({ id: 'scripting', state: 'doing' }),
    ]);
    expect(moduleAttention([card])).toEqual([
      expect.objectContaining({
        id: 'module:7:audiobook',
        level: 'warn',
        kind: 'module',
        projectId: 7,
        moduleId: 'audiobook',
        owner: 'Harrowmere',
        detail: '2 need review',
      }),
    ]);
  });

  it('raises attention for failed pipelines', () => {
    const failed = pipeline({
      id: 9,
      kind: 'audio',
      status: 'failed',
      tasks: [task({ status: 'failed', error: 'Model missing' })],
    });
    const items = pipelineAttention([pipeline({ status: 'completed' }), failed], ownerOf);
    expect(items).toEqual([
      expect.objectContaining({
        id: 'pipeline:9',
        level: 'danger',
        pipelineId: 9,
        owner: 'Owner',
        detail: 'Model missing',
        pipelineKind: 'audio',
      }),
    ]);
    expect(failedCount([failed, pipeline()])).toBe(1);
  });

  it('orders activity by newest pipeline and uses the latest timestamp', () => {
    const rows = recentActivity(
      [
        pipeline({ id: 1, finishedAt: '2026-11-01T01:00:00Z' }),
        pipeline({ id: 3, startedAt: null, createdAt: '2026-11-03T00:00:00Z' }),
        pipeline({ id: 2, startedAt: '2026-11-02T00:00:00Z' }),
      ],
      ownerOf,
      2,
    );
    expect(rows.map((row) => [row.pipeline.id, row.at])).toEqual([
      [3, '2026-11-03T00:00:00Z'],
      [2, '2026-11-02T00:00:00Z'],
    ]);
  });

  it('sums library assets', () => {
    const assets = { image: 2, sound: 3, video: 1, prompt: 4, voice: 5 };
    expect(libraryTotal({ assets, unfiled: assets })).toBe(15);
  });
});
