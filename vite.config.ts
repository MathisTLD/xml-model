import { defineConfig } from "vite";

import { Lib } from "marmotte/vite/lib";

export default defineConfig(() => {
  return {
    plugins: [
      Lib({
        // FIXME: typedocs fails at build
        typedoc: false,
      }),
    ],
  };
});
