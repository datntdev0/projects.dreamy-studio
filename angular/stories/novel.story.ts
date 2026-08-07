import type { Meta, StoryObj } from "@storybook/angular-vite";
import { NovelPage } from "./novel.page";

const meta: Meta<NovelPage> = {
  title: "Novel/Primitives",
  component: NovelPage,
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<NovelPage>;

export const AllPrimitives: Story = {};
