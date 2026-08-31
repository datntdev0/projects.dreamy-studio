import type { StorybookConfig } from '@storybook/angular-vite';

const config: StorybookConfig = {
  stories: ['../stories/**/*.story.ts'],
  addons: [],
  framework: '@storybook/angular-vite',
  staticDirs: [{ from: '../assets', to: '/assets' }],
};

export default config;
