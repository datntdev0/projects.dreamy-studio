import type { Meta, StoryObj } from '@storybook/angular-vite';

import { ComponentsPage } from './components.page';

const meta: Meta<ComponentsPage> = {
  title: 'Design System/Components',
  component: ComponentsPage,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<ComponentsPage>;

export const AllVariants: Story = {};
