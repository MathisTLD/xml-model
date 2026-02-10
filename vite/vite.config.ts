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
          // patch imports
          let code = src.replace("import * as ts", "import ts");

          // inject a require polyfill
          const importRegex = /^import\s+.*?from\s+['"].*?['"];?\s*$/gm;

          // find the end of imports
          let cursor = 0;
          for (const match of code.matchAll(importRegex)) {
            cursor =
              match.index +
              match[0].length +
              // account for newline
              1;
          }
          // inject the require polyfill after import
          code = `${code.slice(0, cursor)}
import { createRequire as __createRequire } from "module";
const require = __createRequire(import.meta.url);
${code.slice(cursor)}`;

          return { code, map: null };
        }
      },
    },
  ],
});
