import { defineConfig } from "vitepress";
import Sidebar from "marmotte/vitepress/sidebar";

export default async () => {
  return defineConfig({
    title: "xml-model",
    description: "Transparent XML ↔ Object conversion in TypeScript",
    themeConfig: {
      search: { provider: "local" },
      nav: [
        { text: "Guide", link: "/guide/getting-started" },
        { text: "Vite Plugin", link: "/vite-plugin" },
      ],
    },
    vite: { plugins: [Sidebar()] },
  });
};
