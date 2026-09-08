import { MainPage } from '@pages/main/main.page';
import type { Meta, StoryObj } from '@storybook/angular-vite';

import { HomeScenario, withHome } from './home.mocks';
import { waitFor } from './novel-screen.helpers';

function screen(scenario: HomeScenario, selector: string): StoryObj<MainPage> {
  return {
    ...withHome(scenario),
    play: async ({ canvasElement }) => {
      await waitFor(canvasElement, selector);
    },
  };
}

const meta: Meta<MainPage> = {
  title: 'Screens/Home',
  component: MainPage,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<MainPage>;

export const Default: Story = screen({}, '[data-testid="home-attention-item"]');

export const AllClear: Story = screen({ healthy: true }, '[data-testid="home-attention-empty"]');

export const EmptyWorkspace: Story = screen({ empty: true }, '[data-testid="home-recent-empty"]');
