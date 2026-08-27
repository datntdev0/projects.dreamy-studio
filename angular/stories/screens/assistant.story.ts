import type { Meta, StoryObj } from "@storybook/angular-vite";
import { MainPage } from "@app/pages/main/main.page";
import { AssistantScenario, withAssistant } from "./assistant.mocks";
import { click, waitFor } from "./novel-screen.helpers";

async function openAssistant(root: HTMLElement): Promise<void> {
  await click(root, '[data-testid="railbar-assistant"]');
  await waitFor(root, '[data-testid="assistant-start"]');
}

async function openSession(root: HTMLElement, id: string): Promise<void> {
  await openAssistant(root);
  await click(root, '[data-testid="assistant-start-history"] button');
  await click(root, `[data-testid="assistant-session"][data-session-id="${id}"] [data-testid="assistant-session-open"]`);
  await waitFor(root, '[data-testid="assistant-message-assistant"]');
}

async function send(root: HTMLElement, text: string): Promise<void> {
  const field = await waitFor<HTMLTextAreaElement>(root, '[data-testid="assistant-field"]');
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await click(root, '[data-testid="assistant-send"] button:not([disabled])');
}

function screen(scenario: AssistantScenario, play: (root: HTMLElement) => Promise<void>): StoryObj<MainPage> {
  return {
    ...withAssistant(scenario),
    play: async ({ canvasElement }) => play(canvasElement),
  };
}

const meta: Meta<MainPage> = {
  title: "Screens/Assistant",
  component: MainPage,
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<MainPage>;

export const Default: Story = screen({}, openAssistant);

export const ManyNovels: Story = screen({ novels: 40 }, openAssistant);

export const FirstSession: Story = screen({ sessions: false }, openAssistant);

export const SendFailed: Story = screen({ failSend: true, replyDelayMs: 200 }, async (root) => {
  await openSession(root, "s-terms");
  await send(root, "Giữ “Chuông triều” là term riêng.");
  await waitFor(root, '[data-testid="assistant-chat-error"]');
});

export const Working: Story = screen({ replyDelayMs: 4000 }, async (root) => {
  await openSession(root, "s-terms");
  await send(root, "Giữ “Chuông triều” là term riêng.");
  await waitFor(root, '[data-testid="assistant-live-activity"]');
});

export const EditEnabled: Story = screen({}, async (root) => {
  await openSession(root, "s-terms");
  await click(root, '[data-testid="assistant-composer-edit"]');
  await click(root, '[data-testid="dialog-host-accept"] button');
  await waitFor(root, '[data-testid="assistant-chat-edit-notice"]');
});

export const ReviewConflict: Story = screen({ resolveConflict: true }, async (root) => {
  await openSession(root, "s-review");
  await click(root, '[data-testid="assistant-review-finding-apply"]');
  await waitFor(root, '[data-testid="toast-item"]');
});

export const KnowledgeReview: Story = screen({}, async (root) => {
  await openSession(root, "s-kb-fix");
  await waitFor(root, '[data-testid="assistant-changes-card"]');
});
