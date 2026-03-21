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
        // FIXME: typedocs fails at build
        typedoc: false,
      }),
    ],
    test: {
      typecheck: {
        enabled: true,
      },
    },
  };
});
