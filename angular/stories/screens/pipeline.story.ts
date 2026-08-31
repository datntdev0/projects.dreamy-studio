import { MainPage } from '@pages/main/main.page';
import type { Meta, StoryObj } from '@storybook/angular-vite';

import { click, waitFor } from './novel-screen.helpers';
import { TranslationScenario, withTranslation } from './novel-translation.mocks';

async function openHistory(root: HTMLElement): Promise<void> {
  await click(root, '[data-testid="railbar-pipelines"]');
}

function screen(
  scenario: TranslationScenario,
  play: (root: HTMLElement) => Promise<void>,
): StoryObj<MainPage> {
  return {
    ...withTranslation(scenario),
    play: async ({ canvasElement }) => play(canvasElement),
  };
}

async function showRunning(root: HTMLElement): Promise<void> {
  await openHistory(root);
  await waitFor(root, '[data-testid="pipeline-history-row"]');
  if (!root.querySelector('[data-testid="bottom"]')) {
    await click(root, '[data-testid="statusbar-pipelines"]');
  }
  await waitFor(root, '[data-testid="pipeline-item"]');
}

async function showEmpty(root: HTMLElement): Promise<void> {
  await openHistory(root);
  await waitFor(root, '[data-testid="pipeline-history-empty"]');
}

const meta: Meta<MainPage> = {
  title: 'Screens/Pipeline Management',
  component: MainPage,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<MainPage>;

export const Default: Story = screen({ history: true, running: true }, showRunning);

export const Empty: Story = screen({}, showEmpty);
