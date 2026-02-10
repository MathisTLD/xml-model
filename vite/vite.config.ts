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
    // remove weird typescript imports from bundle
    {
      name: "patch-imports",
      transform(src, id) {
        if (/\/typescript-rtti\//.test(id)) {
          const code = src.replace("import * as ts", "import ts");
          return { code, map: null };
        }
      },
    },
  ],
});
