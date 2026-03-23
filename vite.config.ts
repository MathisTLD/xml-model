/// <reference types="vite-plus" />
import { defineConfig } from "vite-plus";

import { Lib } from "marmotte/vite/lib";

export default defineConfig(() => {
  return {
    lint: { options: { typeAware: true, typeCheck: true } },
    staged: {
      "*": "vp fmt --no-error-on-unmatched-pattern",
    },
    plugins: [
      Lib({
        typedoc: {
          // see "TypeDoc does not show inherited fields from `.extend()` subclasses"
          entryPoints: ["./src/index.ts", "./src/xml/index.ts"],
          entryPointStrategy: "resolve",
        },
      }),
    ],
    test: {
      typecheck: {
        enabled: true,
      },
    },
  };
});
