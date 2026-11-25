import type { Meta } from '@storybook/angular-vite';

import { click, waitFor } from '../screens/novel-screen.helpers';
// prettier-ignore
import { AssistantPanelStory, AssistantStory, openSession, openStart, panel, send } from './assistant.host';

const meta: Meta<AssistantPanelStory> = {
  title: 'Features/Assistant',
  component: AssistantPanelStory,
  parameters: { layout: 'fullscreen' },
  argTypes: { width: { control: { type: 'range', min: 280, max: 720, step: 20 } } },
};

export default meta;

export const Start: AssistantStory = panel({}, openStart);

export const FirstSession: AssistantStory = panel({ sessions: false }, openStart);

export const ManyNovels: AssistantStory = panel({ novels: 40 }, openStart);

export const Working: AssistantStory = panel({ replyDelayMs: 4000 }, async (root) => {
  await openSession(root, 's-terms');
  await send(root, 'Giữ “Chuông triều” là term riêng.');
  await waitFor(root, '[data-testid="assistant-live-activity"]');
});

export const SendFailed: AssistantStory = panel(
  { failSend: true, replyDelayMs: 200 },
  async (root) => {
    await openSession(root, 's-terms');
    await send(root, 'Giữ “Chuông triều” là term riêng.');
    await waitFor(root, '[data-testid="assistant-chat-error"]');
  },
);

export const ReviewConflict: AssistantStory = panel({ resolveConflict: true }, async (root) => {
  await openSession(root, 's-review');
  await click(root, '[data-testid="assistant-review-finding-apply"]');
  await waitFor(root, '[data-testid="toast-item"]');
});
