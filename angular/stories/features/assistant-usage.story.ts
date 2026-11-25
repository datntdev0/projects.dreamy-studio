import type { Meta } from '@storybook/angular-vite';

import { click, waitFor } from '../screens/novel-screen.helpers';
import { AssistantPanelStory, AssistantStory, openSession, panel } from './assistant.host';
import { UsageLevel } from './assistant.mocks';

function usage(level: UsageLevel): AssistantStory {
  return panel({ usage: level }, async (root) => {
    await openSession(root, 's-names');
    await click(root, '[data-testid="assistant-usage-toggle"]');
    await waitFor(root, '[data-testid="assistant-usage-pop"]');
  });
}

const meta: Meta<AssistantPanelStory> = {
  title: 'Features/Assistant/Usage',
  component: AssistantPanelStory,
  parameters: { layout: 'fullscreen' },
  argTypes: { width: { control: { type: 'range', min: 280, max: 720, step: 20 } } },
};

export default meta;

export const CodexFilling: AssistantStory = usage('codex-filling');

export const ClaudeCode: AssistantStory = usage('claude');

export const ClaudeCodeLimited: AssistantStory = usage('claude-limited');

export const ClaudeCodeApiKey: AssistantStory = usage('claude-api-key');

export const ClaudeCodeLegacy: AssistantStory = usage('claude-legacy');

export const Antigravity: AssistantStory = usage('antigravity');

export const QuotaPending: AssistantStory = usage('pending');
