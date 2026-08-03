import type { StorybookConfig } from "@storybook/angular-vite";

const config: StorybookConfig = {
  stories: ["../angular/stories/**/*.story.ts"],
  addons: [],
  framework: "@storybook/angular-vite",
  staticDirs: [{ from: "../angular/assets", to: "/assets" }],
};

export default config;
