import { defineConfig } from "vitepress";
import Sidebar from "marmotte/vitepress/sidebar";

export default async () => {
  return defineConfig({
    title: "xml-model",
    description: "Transparent XML ↔ Object conversion in TypeScript",
    base: process.env.VITEPRESS_BASE ?? "/",
    themeConfig: {
      search: { provider: "local" },
      nav: [
        { text: "Guide", link: "/guide/getting-started" },
        { text: "Vite Plugin", link: "/vite-plugin" },
      ],
      socialLinks: [{ icon: "github", link: "https://github.com/MathisTLD/xml-model" }],
    },
    vite: { plugins: [Sidebar()] },
  });
};
