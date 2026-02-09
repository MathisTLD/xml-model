import { build, defineConfig } from "vite";

import { Lib } from "marmotte/vite/plugins/lib";

import { XMLModelVitePlugin } from "./vite/src";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    // for tests
    XMLModelVitePlugin({
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
        console.log("building the vite plugin");
        await build({
          root: resolve(import.meta.dirname, "vite"),
        });
      },
    },
  ],
});
