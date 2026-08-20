import type { Meta, StoryObj } from "@storybook/angular-vite";
import { MainPage } from "@app/pages/main/main.page";
import { choose, click, waitFor } from "./novel-screen.helpers";
import { TranslationScenario, withTranslation } from "./novel-translation.mocks";

const EMPTY_CHAPTER = "ch-4";
const SOURCE_ONLY: TranslationScenario = { translated: false, warnings: false };

async function openNovels(root: HTMLElement): Promise<void> {
  await click(root, '[data-testid="railbar-item"][data-rail="novels"]');
}

async function openChapters(root: HTMLElement): Promise<void> {
  await openNovels(root);
  await click(root, '[data-testid="novel-explorer-chapters"]');
}

async function openReader(root: HTMLElement, chapterId: string): Promise<void> {
  await openChapters(root);
  await click(root, `[data-testid="novel-chapter-row"][data-row-key="${chapterId}"]`);
  await choose(root, '[data-testid="novel-lang-switch"]', "src");
}

function translation(scenario: TranslationScenario): StoryObj<MainPage> {
  return {
    ...withTranslation(scenario),
    play: async ({ canvasElement }) => {
      await openNovels(canvasElement);
      await click(canvasElement, '[data-testid="novel-explorer-translation"]');
    },
  };
}

const meta: Meta<MainPage> = {
  title: "Screens/Novel Management",
  component: MainPage,
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<MainPage>;

export const Default: Story = {
  ...withTranslation(),
  play: async ({ canvasElement }) => {
    await openChapters(canvasElement);
    await waitFor(canvasElement, '[data-testid="novel-chapter-row"]');
  },
};

export const ReadingNoChapter: Story = {
  ...withTranslation({ ...SOURCE_ONLY, chapters: false }),
  play: async ({ canvasElement }) => {
    await openChapters(canvasElement);
    await waitFor(canvasElement, '[data-testid="novel-chapters-empty"]');
  },
};

export const ReadingNoContent: Story = {
  ...withTranslation(SOURCE_ONLY),
  play: async ({ canvasElement }) => {
    await openReader(canvasElement, EMPTY_CHAPTER);
    await waitFor(canvasElement, '[data-testid="novel-reader-empty"]');
  },
};

export const TranslationFreshNovel: Story = translation({ translated: false, warnings: false });
