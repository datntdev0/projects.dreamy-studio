import { byId } from '@testing/dom';
import { exercise, mount } from '@testing/exercise';
import { setupWorld } from '@testing/world';
import { describe, expect, it } from 'vitest';

import { LoadState } from '../workspace.models';
import { WorkspaceLoading } from './loading.component';

const state: LoadState = {
  origin: 'splash',
  path: 'C:/ws',
  name: 'ws',
  mode: 'open',
  steps: [
    { id: 'application', state: 'done' },
    { id: 'backend', state: 'running' },
    { id: 'llm', state: 'pending' },
    { id: 'workspace', state: 'error' },
  ],
  percent: 40,
  status: 'running',
};

describe('WorkspaceLoading', () => {
  it('renders the load state and cancels', async () => {
    const ipc = setupWorld();
    const mounted = await mount(WorkspaceLoading, { state });
    expect(byId(mounted.root, 'workspace-loading')).not.toBeNull();
    expect(mounted.instance.modeKey(null)).toBe('loading.mode.prepare');
    expect(mounted.instance.modeKey('create')).toBe('loading.mode.create');
    expect(mounted.instance.stepKey('llm')).toBe('loading.step.llm');
    await exercise(mounted);
    expect(ipc.called('workspace_cancel')).toBeGreaterThan(0);
  });
});
