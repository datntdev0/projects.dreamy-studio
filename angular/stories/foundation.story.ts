import type { Meta, StoryObj } from '@storybook/angular-vite';

import { FoundationComponent } from './foundation.component';

const meta: Meta<FoundationComponent> = {
  title: 'Design System/Foundation',
  component: FoundationComponent,
};

export default meta;

type Story = StoryObj<FoundationComponent>;

export const Overview: Story = {};
