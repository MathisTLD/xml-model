import { defineConfig } from "vite";

import { Lib } from "marmotte/vite/plugins/lib";

export default defineConfig({
  plugins: [
    Lib({
      docs: false,
      externals: {
        exclude: [
          // bundle the rtti transformer because it's weirdly built
          /typescript-rtti/,
        ],
      },
    }),
  ],
});
