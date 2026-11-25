import { SettingsDialog } from '@features/settings/components/settings.dialog';
import { SettingsSectionId } from '@features/settings/settings.models';
import type { Meta, StoryObj } from '@storybook/angular-vite';

import { CURRENT_WORKSPACE, settingsProvider, withProviders, workspaceProvider } from './mocks';
// prettier-ignore
import { backendServiceProvider, COLAB_T4, remoteBackendServiceProvider, RemoteScenario } from './settings-backend.mocks';
import { cloudServiceProvider } from './settings-cloud.mocks';
import { LLM_FEATURES, llmProviders, LlmScenario, llmServiceProvider } from './settings-llm.mocks';

function settings(
  section: SettingsSectionId,
  llm: LlmScenario = {},
  remote: RemoteScenario = {},
): StoryObj<SettingsDialog> {
  return withProviders([
    settingsProvider({ section }),
    workspaceProvider({ current: CURRENT_WORKSPACE }),
    llmServiceProvider(llmProviders(llm.install), LLM_FEATURES, llm),
    backendServiceProvider(),
    remoteBackendServiceProvider(remote),
    cloudServiceProvider(),
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

export const LlmNotInstalled: Story = settings('llm', { install: 'missing' });

export const LlmDownloading: Story = settings('llm', { install: 'downloading' });

export const LlmDownloadFailed: Story = settings('llm', { install: 'failed' });

export const LlmUsageLimited: Story = settings('llm', { usage: 'limited' });

export const LlmUsageFailed: Story = settings('llm', { usage: 'failed' });

export const LocalBackend: Story = settings('backend');

export const RemoteBackend: Story = settings('remote', {}, COLAB_T4);

export const RemoteBackendSetup: Story = settings('remote');
