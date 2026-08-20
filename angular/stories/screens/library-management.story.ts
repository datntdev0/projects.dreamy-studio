import type { Meta, StoryObj } from "@storybook/angular-vite";
import { MainPage } from "@app/pages/main/main.page";
import { click, waitFor } from "./novel-screen.helpers";
import { LibraryScenario, withLibrary } from "./library-management.mocks";

async function openLibrary(root: HTMLElement, entry: string): Promise<void> {
  await click(root, '[data-testid="railbar-item"][data-rail="library"]');
  await click(root, `[data-testid="${entry}"]`);
}

const VIEW_STORAGE_KEY = "ds.lb.view";

function storeGridView(): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, "grid");
  } catch {
    return;
  }
}

function screen(entry: string, ready: string, scenario: LibraryScenario = {}): StoryObj<MainPage> {
  return {
    ...withLibrary(scenario),
    loaders: [storeGridView],
    play: async ({ canvasElement }) => {
      await openLibrary(canvasElement, entry);
      await waitFor(canvasElement, ready);
    },
  };
}

const meta: Meta<MainPage> = {
  title: "Screens/Library Management",
  component: MainPage,
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<MainPage>;

export const Default: Story = screen("library-explorer-images", '[data-testid="library-images-card"]');

export const Sounds: Story = screen("library-explorer-sounds", '[data-testid="library-sounds-card"]');

export const Videos: Story = screen("library-explorer-videos", '[data-testid="library-videos-card"]');

export const Prompts: Story = screen("library-explorer-prompts", '[data-testid="library-prompts-card"]');

export const Collections: Story = screen("library-explorer-taxonomy", '[data-testid="library-collections-page"]');

export const Empty: Story = screen("library-explorer-images", '[data-testid="library-images-empty"]', { empty: true });
