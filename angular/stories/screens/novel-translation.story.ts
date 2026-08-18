import type { Meta, StoryObj } from "@storybook/angular-vite";
import { MainPage } from "@app/pages/main/main.page";
import { TranslationScenario, withTranslation } from "./novel-translation.mocks";

const POLL_MS = 25;
const POLL_LIMIT = 200;

async function waitFor<T extends Element>(root: HTMLElement, selector: string): Promise<T> {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
    const element = root.querySelector<T>(selector);
    if (element) {
      return element;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Element not found: ${selector}`);
}

async function openTranslation(root: HTMLElement): Promise<void> {
  const rail = await waitFor<HTMLButtonElement>(root, '[data-testid="railbar-item"][data-rail="novels"]');
  rail.click();
  const entry = await waitFor<HTMLElement>(root, '[data-testid="novel-explorer-translation"]');
  entry.click();
}

function screen(scenario: TranslationScenario): StoryObj<MainPage> {
  return {
    ...withTranslation(scenario),
    play: async ({ canvasElement }) => {
      await openTranslation(canvasElement);
    },
  };
}

const meta: Meta<MainPage> = {
  title: "Screens/Novel Translation",
  component: MainPage,
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<MainPage>;

export const Translation: Story = screen({});

export const FreshNovel: Story = screen({ translated: false, warnings: false });

export const NoChapters: Story = screen({ chapters: false });
