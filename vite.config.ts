import { build, defineConfig } from "vite";
import { resolve } from "path";

import { Lib } from "marmotte/vite/plugins/lib";

import type { XMLModelVitePluginOptions } from "./vite/src";
import { existsSync } from "fs";

const vitePluginRoot = resolve(import.meta.dirname, "vite");

async function buildVitePlugin() {
  console.log("building the vite plugin");
  await build({
    root: vitePluginRoot,
  });
}

async function resolveVitePlugin(options: XMLModelVitePluginOptions = {}) {
  const pluginEntry = resolve(vitePluginRoot, "dist", "index.js");
  if (!existsSync(pluginEntry)) {
    // build vite plugin if not already built
    await buildVitePlugin();
  }
  return import(pluginEntry).then((m) => (m as typeof import("./vite/src")).default(options));
}

export default defineConfig({
  plugins: [
    // for tests
    resolveVitePlugin({
      include: /\.test\.ts$/,
    }),
    Lib({
      docs: false,
      dts: {
        exclude: ["/**/*.test.ts"],
        // FIXME: declaration map are not generated
        // compilerOptions: { declaration: true, declarationMap: true },
      },
    }),
    {
      name: "build-vite-plugin",
      // only when building
      apply: "build",
      async closeBundle() {
        await buildVitePlugin();
      },
    },
  ],
});
