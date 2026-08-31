import { SettingsDialog } from '@features/settings/components/settings.dialog';
import { SettingsSectionId } from '@features/settings/settings.models';
import type { Meta, StoryObj } from '@storybook/angular-vite';

// prettier-ignore
import { CURRENT_WORKSPACE, LLM_PROVIDERS, llmServiceProvider, settingsProvider, withProviders, workspaceProvider } from './mocks';

function settings(section: SettingsSectionId): StoryObj<SettingsDialog> {
  return withProviders([
    settingsProvider({ section }),
    workspaceProvider({ current: CURRENT_WORKSPACE }),
    llmServiceProvider(LLM_PROVIDERS),
  ]);
}

const meta: Meta<SettingsDialog> = {
  title: 'Features/Settings',
  component: SettingsDialog,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<SettingsDialog>;

export const General: Story = settings('general');

export const LlmProviders: Story = settings('llm');

export const ComingSoon: Story = settings('backend');
