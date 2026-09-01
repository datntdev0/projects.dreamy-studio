import { MainPage } from '@pages/main/main.page';
import type { Meta, StoryObj } from '@storybook/angular-vite';

import { click, waitFor } from './novel-screen.helpers';
import { withProjects } from './project-management.mocks';

const FIRST_PROJECT = '[data-testid="project-explorer-project"][data-project-id="1"]';

async function openProjects(root: HTMLElement): Promise<void> {
  if (!root.querySelector('[data-testid="explorer-projects-host"]')) {
    await click(root, '[data-testid="railbar-item"][data-rail="projects"]');
  }
  await waitFor(root, '[data-testid="explorer-projects-host"]');
}

async function expandFirstProject(root: HTMLElement): Promise<void> {
  await openProjects(root);
  await waitFor(root, FIRST_PROJECT);
  await click(root, `${FIRST_PROJECT} [data-testid="project-explorer-expand"]`);
}

const meta: Meta<MainPage> = {
  title: 'Screens/Project Management',
  component: MainPage,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<MainPage>;

export const Default: Story = {
  ...withProjects(),
  play: async ({ canvasElement }) => {
    await expandFirstProject(canvasElement);
    await waitFor(canvasElement, `${FIRST_PROJECT} [data-testid="project-modules-row"]`);
  },
};

export const Stale: Story = {
  ...withProjects({ stale: true }),
  play: Default.play,
};

export const NoProject: Story = {
  ...withProjects({ empty: true }),
  play: async ({ canvasElement }) => {
    await openProjects(canvasElement);
    await waitFor(canvasElement, '[data-testid="project-explorer-empty"]');
  },
};
