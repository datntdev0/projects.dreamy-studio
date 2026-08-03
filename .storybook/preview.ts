import type { Preview } from "@storybook/angular-vite";
import "../angular/styles.scss";

const preview: Preview = {
  initialGlobals: { theme: "dark" },
  globalTypes: {
    theme: {
      description: "Design system theme",
      toolbar: {
        dynamicTitle: true,
        icon: "circlehollow",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
      },
    },
  },
  decorators: [
    (story, context) => {
      document.documentElement.setAttribute("data-theme", context.globals["theme"] === "light" ? "light" : "dark");
      return story();
    },
  ],
  parameters: { layout: "fullscreen" },
};

export default preview;
