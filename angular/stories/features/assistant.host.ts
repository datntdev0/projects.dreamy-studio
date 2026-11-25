import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AssistantPanel } from '@features/assistant/components/panel.component';
import { DialogHost } from '@shared/dialog/dialog-host.component';
import { ToastHost } from '@shared/toast/toast-host.component';
import type { StoryObj } from '@storybook/angular-vite';

import { click, waitFor } from '../screens/novel-screen.helpers';
import { AssistantScenario, withAssistant } from './assistant.mocks';

const PANEL_WIDTH = 480;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-panel-story',
  imports: [AssistantPanel, DialogHost, ToastHost],
  template: `
    <div
      style="display: flex; justify-content: flex-end; height: 100vh"
      data-testid="assistant-panel-story"
    >
      <aside
        class="inspector"
        style="border-left: 1px solid var(--hairline)"
        [style.width.px]="width"
        data-testid="assistant-panel-story-pane"
      >
        <div class="pane-body"><app-assistant-panel /></div>
      </aside>
    </div>
    <app-dialog-host />
    <app-toast-host />
  `,
})
export class AssistantPanelStory {
  @Input() width = PANEL_WIDTH;
}

export type AssistantStory = StoryObj<AssistantPanelStory>;

export async function openStart(root: HTMLElement): Promise<void> {
  await waitFor(root, '[data-testid="assistant-start"]');
}

async function openHistory(root: HTMLElement): Promise<void> {
  await openStart(root);
  await click(root, '[data-testid="assistant-start-history"] button');
}

export async function openSession(root: HTMLElement, id: string): Promise<void> {
  await openHistory(root);
  await click(
    root,
    `[data-testid="assistant-session"][data-session-id="${id}"] [data-testid="assistant-session-open"]`,
  );
  await waitFor(root, '[data-testid="assistant-message-assistant"]');
}

export async function send(root: HTMLElement, text: string): Promise<void> {
  const field = await waitFor<HTMLTextAreaElement>(root, '[data-testid="assistant-field"]');
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await click(root, '[data-testid="assistant-send"] button:not([disabled])');
}

export function panel(
  scenario: AssistantScenario,
  play: (root: HTMLElement) => Promise<void>,
): AssistantStory {
  return {
    ...withAssistant(scenario),
    play: async ({ canvasElement }) => play(canvasElement),
  };
}
