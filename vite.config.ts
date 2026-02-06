import { defineConfig, type Plugin } from "vite";

import { Lib } from "marmotte/vite/plugins/lib";

import typescript from "@rollup/plugin-typescript";

import _rtti from "typescript-rtti/dist/transformer";

// typing is wrong for some reason in reality rtti has type { default: Factory }
const rtti = (_rtti as unknown as { default: typeof _rtti }).default;

/**
 * When Building, class names are changed but the library relies on them
 * so they need to be preserved
 * @returns
 */
function FixClassNamesPlugin(): Plugin {
  return {
    name: "fix-class-names",
    enforce: "post" as const,
    transform(code: string, id: string) {
      if (!id.endsWith(".ts") && !id.endsWith(".tsx")) return;
      // Regex to find: let Name = class Name2
      const fixed = code.replace(/let\s+(\w+)\s*=\s*class\s+\w+/g, "let $1 = class $1");
      return { code: fixed, map: null };
    },
    config() {
      return {
        esbuild: {
          keepNames: true,
        },
      };
    },
  };
}

export default defineConfig({
  plugins: [
    // for tests
    typescript({
      transformers: {
        before: [
          {
            type: "program",
            factory: rtti,
            // factory: (program) => {
            //   console.log("🔧 RTTI Transformer is running!");
            //   const transformer = rtti(program);
            //   return (context) => {
            //     console.log("🔧 Transforming source files...");
            //     return transformer(context);
            //   };
            // },
          },
        ],
      },
      // set declaration to `false` to let plugin dts handle the declarations
      // declaration: false,
    }),
    FixClassNamesPlugin(),
    Lib({
      docs: false,
      dts: { exclude: ["/**/*.test.ts"] },
    }),
  ],
});
