import { SplashPage } from '@pages/splash/splash.page';
import type { Meta, StoryObj } from '@storybook/angular-vite';

// prettier-ignore
import { LOADING_STATE, RECENT_WORKSPACES, settingsProvider, withProviders, workspaceProvider, WorkspaceScenario } from './mocks';

function splash(scenario: WorkspaceScenario): StoryObj<SplashPage> {
  return withProviders([workspaceProvider(scenario), settingsProvider()]);
}

const meta: Meta<SplashPage> = {
  title: 'Features/Splash',
  component: SplashPage,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<SplashPage>;

export const WithRecent: Story = splash({ recent: RECENT_WORKSPACES });

export const FirstRun: Story = splash({ recent: [] });

export const WithNotice: Story = splash({
  recent: RECENT_WORKSPACES,
  notice: 'Không thể mở workspace: thư mục không còn tồn tại.',
});

export const Loading: Story = splash({ recent: RECENT_WORKSPACES, state: LOADING_STATE });
