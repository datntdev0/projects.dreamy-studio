import { Component, Input } from "@angular/core";
import { moduleMetadata } from "@storybook/angular-vite";
import type { Meta, StoryObj } from "@storybook/angular-vite";
import { PipelineList } from "@features/pipeline/components/list.component";
import { CURRENT_WORKSPACE, withProviders, workspaceProvider } from "./mocks";
import { mixedHistory, runningAnalysis, runningAudio, runningLarge, runningPipeline, runningRender } from "./pipeline.fixtures";
import { PipelineScenario, pipelineProvider } from "./pipeline.mocks";

@Component({
  selector: "app-pipeline-list-story",
  standalone: true,
  imports: [PipelineList],
  template: `<div style="height: 100vh; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start" data-testid="pipeline-list-story"><section class="bottom" [style.--bt-h.px]="height" [style.width]="width" data-testid="pipeline-list-story-panel"><header class="bottom-head"><button type="button" class="ins-tab is-active">Pipelines</button><button type="button" class="ins-tab">Output</button></header><div class="bottom-body"><app-pipeline-list /></div></section></div>`,
})
class PipelineListStory {
  @Input() height = 340;
  @Input() width = "100%";
}

const ALL_RUNNING = [runningPipeline(), runningAnalysis(), runningAudio(), runningRender()];

function providers(scenario: PipelineScenario) {
  return withProviders([pipelineProvider(scenario), workspaceProvider({ current: CURRENT_WORKSPACE })]);
}

function list(scenario: PipelineScenario, width = "100%", height = 340): StoryObj<PipelineListStory> {
  return { ...providers(scenario), render: () => ({ props: { width, height }, template: '<app-pipeline-list-story [width]="width" [height]="height" />' }) };
}

const meta: Meta<PipelineListStory> = {
  title: "Features/Pipeline",
  component: PipelineListStory,
  decorators: [moduleMetadata({ imports: [PipelineListStory] })],
  parameters: { layout: "fullscreen" },
};

export default meta;

export const Bottom: StoryObj<PipelineListStory> = list({ running: [...ALL_RUNNING, runningLarge()] }, "100%", 420);

export const BottomIdle: StoryObj<PipelineListStory> = list({ pipelines: mixedHistory() }, "100%", 300);
