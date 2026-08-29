import { ComponentCase, describeComponents } from "@testing/exercise";
import { pipeline, task } from "@testing/fixtures";
import { setupWorld, warmWorld } from "@testing/world";
import { PipelineHistory } from "./history.component";
import { PipelineItem } from "./item.component";
import { PipelineList } from "./list.component";
import { PipelineLog } from "./log.component";
import { PipelineStrip } from "./strip.component";

async function warm(): Promise<void> {
  await warmWorld();
}

const running = pipeline({ id: 3, status: "running", total: 3, tasks: [task({ id: 1, status: "completed" }), task({ id: 2, status: "running", progress: 40, chapterId: "c2", startedAt: "2026-01-02T03:04:20Z" }), task({ id: 3, status: "queued", chapterId: "c3", passage: 2 })] });
const failed = pipeline({ id: 2, status: "failed", failed: 1, finishedAt: "2026-01-02T03:05:00Z", tasks: [task({ id: 1, status: "failed", error: "boom" })] });
const done = pipeline({ id: 1, status: "completed", done: 2, finishedAt: "2026-01-02T03:05:00Z", kind: "analysis" });

const cases: ComponentCase[] = [
  { name: "PipelineHistory", type: PipelineHistory, before: warm },
  { name: "PipelineList", type: PipelineList, before: warm },
  { name: "PipelineLog", type: PipelineLog, before: warm },
  { name: "PipelineItem (running)", type: PipelineItem, inputs: { pipeline: running, now: Date.parse("2026-01-02T03:05:00Z"), selected: true }, before: warm },
  { name: "PipelineItem (failed)", type: PipelineItem, inputs: { pipeline: failed }, before: warm },
  { name: "PipelineItem (completed)", type: PipelineItem, inputs: { pipeline: done }, before: warm },
  { name: "PipelineStrip", type: PipelineStrip, inputs: { pipeline: running }, before: warm },
];

describeComponents("pipeline components", cases, () => {
  setupWorld();
});
