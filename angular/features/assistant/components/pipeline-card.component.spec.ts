import { TestBed } from '@angular/core/testing';
import { PipelineService } from '@features/pipeline/pipeline.service';
import { TabsService } from '@layout/tabs.service';
import { LanguageService } from '@shared/language/language.service';
import { allById, byId, click } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { FakeIpc } from '@testing/fake-ipc';
import { pipelineRun } from '@testing/fixtures';
import { setupWorld, warmWorld, worldSession } from '@testing/world';
import { describe, expect, it, vi } from 'vitest';

import {
  AssistantMessage,
  PipelineRun,
  PipelineRunLaunch,
  ProposalResolution,
} from '../assistant.models';
import { AssistantService } from '../assistant.service';
import { AssistantChat } from './chat.component';
import { AssistantPipelineCard } from './pipeline-card.component';

function mountCard(run: PipelineRun, busy = false): Promise<Mounted<AssistantPipelineCard>> {
  return mount(AssistantPipelineCard, { run, messageId: 'm2', busy }, () => {
    setupWorld();
  });
}

function textOf(mounted: Mounted<unknown>, id: string): string {
  return byId(mounted.root, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function translate(key: Parameters<LanguageService['translate']>[0], params = {}): string {
  return TestBed.inject(LanguageService).translate(key, params);
}

function isDisabled(mounted: Mounted<unknown>, id: string): boolean {
  return (byId(mounted.root, id) as HTMLButtonElement).disabled;
}

describe('AssistantPipelineCard', () => {
  describe('pending', () => {
    it('describes the job, its items and what was skipped', async () => {
      const mounted = await mountCard(pipelineRun());
      expect(textOf(mounted, 'assistant-pipeline-name')).toBe('Translate chapters 1-2');
      expect(textOf(mounted, 'assistant-pipeline-meta')).toContain(
        translate('pipeline.kind.translation'),
      );
      expect(textOf(mounted, 'assistant-pipeline-meta')).toContain(
        translate('assistant.pipeline.summary', { items: 2, tasks: 2 }),
      );
      expect(textOf(mounted, 'assistant-pipeline-target')).toBe(
        translate('assistant.pipeline.target', { target: 'VI' }),
      );
      expect(allById(mounted.root, 'assistant-pipeline-item')).toHaveLength(2);
      expect(textOf(mounted, 'assistant-pipeline-item-title')).toBe('Opening');
      expect(allById(mounted.root, 'assistant-pipeline-item-seq')[1].textContent).toContain('#2');
      expect(allById(mounted.root, 'assistant-pipeline-item-note')).toHaveLength(1);
      expect(textOf(mounted, 'assistant-pipeline-skipped-summary')).toBe(
        translate('assistant.pipeline.skipped', { count: 1 }),
      );
      expect(textOf(mounted, 'assistant-pipeline-skipped-item')).toContain('no paragraphs');
      expect(byId(mounted.root, 'assistant-pipeline-mode')).toBeNull();
      expect(byId(mounted.root, 'assistant-pipeline-overwrite')).toBeNull();
      expect(textOf(mounted, 'assistant-pipeline-run')).toBe(
        translate('assistant.pipeline.run', { count: 2 }),
      );
      expect(byId(mounted.root, 'assistant-pipeline-status')).toBeNull();
    });

    it('shows the synthesis mode, the overwrite warning and the warnings', async () => {
      const mounted = await mountCard(
        pipelineRun({
          job: 'synthesis',
          target: null,
          mode: 'all',
          overwrite: true,
          warnings: ['Cloud voices are billed'],
          skipped: [],
        }),
      );
      expect(textOf(mounted, 'assistant-pipeline-meta')).toContain(
        translate('pipeline.kind.audio'),
      );
      expect(textOf(mounted, 'assistant-pipeline-mode')).toBe(
        translate('assistant.pipeline.mode.all'),
      );
      expect(byId(mounted.root, 'assistant-pipeline-overwrite')).not.toBeNull();
      expect(byId(mounted.root, 'assistant-pipeline-target')).toBeNull();
      expect(textOf(mounted, 'assistant-pipeline-warning')).toBe('Cloud voices are billed');
      expect(byId(mounted.root, 'assistant-pipeline-skipped')).toBeNull();
    });

    it('labels the analysis job and ignores an unknown mode', async () => {
      const mounted = await mountCard(pipelineRun({ job: 'analysis', target: 'src', mode: 'odd' }));
      expect(textOf(mounted, 'assistant-pipeline-meta')).toContain(
        translate('pipeline.kind.analysis'),
      );
      expect(byId(mounted.root, 'assistant-pipeline-mode')).toBeNull();
    });

    it('emits the launch when Run is pressed', async () => {
      const run = pipelineRun();
      const mounted = await mountCard(run);
      const launches: PipelineRunLaunch[] = [];
      mounted.instance.launched.subscribe((launch) => launches.push(launch));
      click(mounted.root, 'assistant-pipeline-run');
      expect(launches).toEqual([{ messageId: 'm2', run }]);
    });

    it('emits a rejection without a pipeline id when Reject is pressed', async () => {
      const mounted = await mountCard(pipelineRun());
      const resolutions: ProposalResolution[] = [];
      mounted.instance.resolved.subscribe((resolution) => resolutions.push(resolution));
      click(mounted.root, 'assistant-pipeline-reject');
      expect(resolutions).toEqual([{ messageId: 'm2', itemIds: ['pr1'], status: 'rejected' }]);
    });

    it('cannot run a card without tasks but can still dismiss it', async () => {
      const mounted = await mountCard(pipelineRun({ items: [], totalTasks: 0 }));
      const launches: PipelineRunLaunch[] = [];
      mounted.instance.launched.subscribe((launch) => launches.push(launch));
      expect(isDisabled(mounted, 'assistant-pipeline-run')).toBe(true);
      expect(isDisabled(mounted, 'assistant-pipeline-reject')).toBe(false);
      mounted.instance.start();
      expect(launches).toEqual([]);
    });

    it('disables both actions while busy', async () => {
      const mounted = await mountCard(pipelineRun(), true);
      const emitted: unknown[] = [];
      mounted.instance.launched.subscribe((launch) => emitted.push(launch));
      mounted.instance.resolved.subscribe((resolution) => emitted.push(resolution));
      expect(isDisabled(mounted, 'assistant-pipeline-run')).toBe(true);
      expect(isDisabled(mounted, 'assistant-pipeline-reject')).toBe(true);
      mounted.instance.start();
      mounted.instance.reject();
      expect(emitted).toEqual([]);
    });
  });

  describe('resolved', () => {
    it('shows a started card and opens its pipeline', async () => {
      const mounted = await mountCard(pipelineRun({ status: 'applied', pipelineId: 9 }));
      const opened: number[] = [];
      mounted.instance.opened.subscribe((id) => opened.push(id));
      expect(textOf(mounted, 'assistant-pipeline-status')).toBe(
        translate('assistant.pipeline.started'),
      );
      expect(byId(mounted.root, 'assistant-pipeline-run')).toBeNull();
      expect(byId(mounted.root, 'assistant-pipeline-reject')).toBeNull();
      click(mounted.root, 'assistant-pipeline-open');
      expect(opened).toEqual([9]);
    });

    it('offers no pipeline to open when the id is unknown', async () => {
      const mounted = await mountCard(pipelineRun({ status: 'applied', pipelineId: null }));
      const opened: number[] = [];
      mounted.instance.opened.subscribe((id) => opened.push(id));
      expect(byId(mounted.root, 'assistant-pipeline-open')).toBeNull();
      mounted.instance.open();
      expect(opened).toEqual([]);
    });

    it('shows a dismissed card without actions', async () => {
      const mounted = await mountCard(pipelineRun({ status: 'rejected' }));
      expect(textOf(mounted, 'assistant-pipeline-status')).toBe(
        translate('assistant.proposal.rejected'),
      );
      expect(byId(mounted.root, 'assistant-pipeline-run')).toBeNull();
      expect(byId(mounted.root, 'assistant-pipeline-open')).toBeNull();
      mounted.instance.reject();
    });
  });

  describe('in the chat', () => {
    function messageWith(run: PipelineRun): AssistantMessage {
      return {
        id: 'm2',
        role: 'assistant',
        text: 'Ready to translate.',
        createdAt: '2026-01-02T03:05:00Z',
        activities: [],
        citations: [],
        attachments: [run],
      };
    }

    let ipc: FakeIpc;

    async function mountChat(run: PipelineRun): Promise<Mounted<AssistantChat>> {
      return mount(AssistantChat, {}, async () => {
        ipc = setupWorld();
        ipc.on('assistant_session_get', worldSession('s1', { messages: [messageWith(run)] }));
        await warmWorld();
        await TestBed.inject(AssistantService).open('s1');
      });
    }

    it('starts the job and resolves the card with the pipeline id', async () => {
      const mounted = await mountChat(pipelineRun());
      click(mounted.root, 'assistant-pipeline-run');
      await vi.waitFor(() => expect(ipc.called('assistant_proposal_resolve')).toBe(1));
      expect(ipc.lastArgs('pipeline_start')).toMatchObject({ novelId: 1, target: 'VI' });
      expect(ipc.lastArgs('assistant_proposal_resolve')).toMatchObject({
        sessionId: 's1',
        messageId: 'm2',
        itemIds: ['pr1'],
        status: 'applied',
        pipelineId: 5,
      });
      expect(TestBed.inject(AssistantService).launching()).toBeNull();
    });

    it('resolves a dismissal without starting anything', async () => {
      const mounted = await mountChat(pipelineRun());
      click(mounted.root, 'assistant-pipeline-reject');
      await vi.waitFor(() => expect(ipc.called('assistant_proposal_resolve')).toBe(1));
      expect(ipc.called('pipeline_start')).toBe(0);
      const args = ipc.lastArgs('assistant_proposal_resolve');
      expect(args).toMatchObject({ messageId: 'm2', itemIds: ['pr1'], status: 'rejected' });
      expect(args).not.toHaveProperty('pipelineId');
    });

    it('opens the pipeline of a started card', async () => {
      const mounted = await mountChat(pipelineRun({ status: 'applied', pipelineId: 9 }));
      click(mounted.root, 'assistant-pipeline-open');
      await settle(mounted.fixture, 2);
      expect(TestBed.inject(TabsService).active().id).toBe('pipelines');
      expect(TestBed.inject(PipelineService).selectedId()).toBe(9);
    });
  });
});
