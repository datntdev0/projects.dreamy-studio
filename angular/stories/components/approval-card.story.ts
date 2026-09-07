import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
// prettier-ignore
import { AssistantAttachment, PipelineRun, PipelineRunLaunch, ProposalResolution } from '@features/assistant/assistant.models';
import { AssistantChangesCard } from '@features/assistant/components/changes-card.component';
import { AssistantPipelineCard } from '@features/assistant/components/pipeline-card.component';
import { AssistantReviewCard } from '@features/assistant/components/review-card.component';
import { AssistantScriptDraftCard } from '@features/assistant/components/script-draft-card.component';
import type { Meta, StoryObj } from '@storybook/angular-vite';

import {
  knowledgeChanges,
  pipelineRun,
  scriptDraft,
  translationReview,
} from '../screens/assistant.fixtures';
import { decideAttachment } from '../screens/assistant.mocks';

const MESSAGE_ID = 'story-message';
const STARTED_PIPELINE_ID = 12;
const LAUNCH_DELAY_MS = 900;

function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-approval-card-story',
  imports: [
    AssistantReviewCard,
    AssistantChangesCard,
    AssistantPipelineCard,
    AssistantScriptDraftCard,
  ],
  template: `
    <div
      style="display: flex; align-items: flex-start; gap: 16px; height: 100vh; padding: 24px; overflow: auto; box-sizing: border-box"
      data-testid="approval-card-story"
    >
      @for (item of items(); track $index) {
        <div style="flex: 0 0 468px; min-width: 0" data-testid="approval-card-story-item">
          @switch (item.kind) {
            @case ('translation_review') {
              <app-assistant-review-card
                [review]="item"
                [messageId]="messageId"
                [busy]="busy"
                (resolved)="onResolved($event)"
              />
            }
            @case ('knowledge_changes') {
              <app-assistant-changes-card
                [changeSet]="item"
                [messageId]="messageId"
                [busy]="busy"
                (resolved)="onResolved($event)"
              />
            }
            @case ('pipeline_run') {
              <app-assistant-pipeline-card
                [run]="item"
                [messageId]="messageId"
                [busy]="busy || launching() === item.id"
                (launched)="onLaunched($event)"
                (resolved)="onResolved($event)"
              />
            }
            @case ('script_draft') {
              <app-assistant-script-draft-card
                [draft]="item"
                [messageId]="messageId"
                [busy]="busy"
                (resolved)="onResolved($event)"
              />
            }
          }
        </div>
      }
    </div>
  `,
})
class ApprovalCardStory {
  readonly messageId = MESSAGE_ID;
  readonly items = signal<AssistantAttachment[]>([]);
  readonly launching = signal<string | null>(null);

  @Input() busy = false;

  @Input() set attachments(value: AssistantAttachment[]) {
    this.items.set(structuredClone(value));
  }

  onResolved(resolution: ProposalResolution): void {
    this.decide(resolution.itemIds, resolution.status, resolution.pipelineId ?? null);
  }

  async onLaunched(launch: PipelineRunLaunch): Promise<void> {
    this.launching.set(launch.run.id);
    await wait(LAUNCH_DELAY_MS);
    this.decide([launch.run.id], 'applied', STARTED_PIPELINE_ID);
    this.launching.set(null);
  }

  private decide(
    ids: string[],
    status: ProposalResolution['status'],
    pipelineId: number | null,
  ): void {
    const next = structuredClone(this.items());
    const picked = new Set(ids);
    for (const item of next) {
      decideAttachment(item, picked, status, pipelineId);
    }
    this.items.set(next);
  }
}

function startedRun(): PipelineRun {
  return { ...pipelineRun(), status: 'applied', pipelineId: STARTED_PIPELINE_ID };
}

const meta: Meta<ApprovalCardStory> = {
  title: 'Components/Approval Card',
  component: ApprovalCardStory,
  parameters: { layout: 'fullscreen' },
  args: { busy: false },
  argTypes: {
    busy: { control: 'boolean' },
    attachments: { control: 'object' },
  },
};

export default meta;

type Story = StoryObj<ApprovalCardStory>;

export const TranslationRun: Story = { args: { attachments: [pipelineRun()] } };

export const RunStarted: Story = { args: { attachments: [startedRun()] } };

export const ScriptDraft: Story = { args: { attachments: [scriptDraft()] } };

export const TranslationReview: Story = {
  args: { attachments: [translationReview(3, 'Con tàu cuối mùa')] },
};

export const KnowledgeChanges: Story = { args: { attachments: [knowledgeChanges()] } };

export const AllApprovals: Story = {
  args: {
    attachments: [
      pipelineRun(),
      scriptDraft(),
      translationReview(3, 'Con tàu cuối mùa'),
      knowledgeChanges(),
    ],
  },
};
