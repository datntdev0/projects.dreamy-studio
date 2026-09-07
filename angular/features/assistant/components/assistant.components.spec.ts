import { TestBed } from '@angular/core/testing';
import { ComponentCase, describeComponents } from '@testing/exercise';
import { pipelineRun, scriptDraft } from '@testing/fixtures';
import { setupWorld, warmWorld, worldSession } from '@testing/world';

import { KnowledgeChangeSet, TranslationReview } from '../assistant.models';
import { AssistantService } from '../assistant.service';
import { AssistantChangesCard } from './changes-card.component';
import { AssistantChat } from './chat.component';
import { AssistantComposer } from './composer.component';
import { AssistantPanel } from './panel.component';
import { AssistantPipelineCard } from './pipeline-card.component';
import { AssistantReviewCard } from './review-card.component';
import { AssistantScriptDraftCard } from './script-draft-card.component';
import { AssistantSessions } from './sessions.component';
import { AssistantStart } from './start.component';

async function warm(): Promise<void> {
  await warmWorld();
}

const attachments = worldSession().messages[1].attachments ?? [];
const review = attachments[0] as TranslationReview;
const changes = attachments[1] as KnowledgeChangeSet;

async function chatting(): Promise<void> {
  await warm();
  await TestBed.inject(AssistantService).open('s1');
}

const cases: ComponentCase[] = [
  { name: 'AssistantPanel (start)', type: AssistantPanel, before: warm },
  {
    name: 'AssistantPanel (sessions)',
    type: AssistantPanel,
    before: async () => {
      await warm();
      TestBed.inject(AssistantService).showSessions();
    },
  },
  { name: 'AssistantPanel (chat)', type: AssistantPanel, before: chatting },
  { name: 'AssistantStart', type: AssistantStart, before: warm },
  { name: 'AssistantSessions', type: AssistantSessions, before: warm },
  { name: 'AssistantChat', type: AssistantChat, before: chatting },
  {
    name: 'AssistantChat (sending)',
    type: AssistantChat,
    before: async () => {
      await chatting();
      const assistant = TestBed.inject(AssistantService);
      assistant.sending.set(true);
      assistant.pendingText.set('hello');
      assistant.liveActivities.set(['Reading']);
      assistant.sendError.set('failed');
    },
  },
  { name: 'AssistantComposer', type: AssistantComposer, before: warm },
  {
    name: 'AssistantReviewCard',
    type: AssistantReviewCard,
    inputs: { review, messageId: 'm2' },
    before: chatting,
  },
  {
    name: 'AssistantChangesCard',
    type: AssistantChangesCard,
    inputs: { changeSet: changes, messageId: 'm2' },
    before: chatting,
  },
  {
    name: 'AssistantPipelineCard',
    type: AssistantPipelineCard,
    inputs: { run: pipelineRun(), messageId: 'm2' },
    before: chatting,
  },
  {
    name: 'AssistantScriptDraftCard',
    type: AssistantScriptDraftCard,
    inputs: { draft: scriptDraft(), messageId: 'm2' },
    before: chatting,
  },
];

describeComponents('assistant components', cases, () => {
  setupWorld();
});
