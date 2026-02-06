import { defineConfig } from "vite";

import { Lib } from "marmotte/vite/plugins/lib";

import typescript from "@rollup/plugin-typescript";
import rtti from "typescript-rtti/dist/transformer";

export default defineConfig({
  plugins: [
    // for tests
    typescript({
      transformers: {
        before: [
          {
            type: "program",
            factory: rtti,
          },
        ],
      },
      // optionally set declaration to `false` to let plugin dts handle the declarations
      // declaration: false,
    }),
    Lib({
      docs: false,
    }),
  ],
});
