import {
  applicationConfig,
  type Meta,
  moduleMetadata,
  type StoryObj,
} from '@storybook/angular-vite';

import { settingsProvider } from './mocks';
import { FLOW_FAILURES, flowProviders, SplashFlowDemo } from './splash.mocks';

const meta: Meta<SplashFlowDemo> = {
  title: 'Features/Splash',
  component: SplashFlowDemo,
  decorators: [
    moduleMetadata({ imports: [SplashFlowDemo] }),
    applicationConfig({ providers: [...flowProviders(), settingsProvider()] }),
  ],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    failure: {
      control: 'select',
      options: FLOW_FAILURES,
      description:
        'Inject one failure; setup-* failures need firstLaunch because nothing is downloaded otherwise.',
    },
    firstLaunch: { control: 'boolean' },
  },
};

export default meta;

type Story = StoryObj<SplashFlowDemo>;

export const FirstLaunch: Story = { args: { firstLaunch: true, failure: 'none' } };

export const ReturningUser: Story = { args: { firstLaunch: false, failure: 'none' } };
