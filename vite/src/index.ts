import { type Plugin } from "vite";

import typescript from "@rollup/plugin-typescript";
import _rtti from "typescript-rtti/dist/transformer";

// typing is wrong for some reason in reality rtti has type { default: Factory }
const rtti = "default" in _rtti ? (_rtti as unknown as { default: typeof _rtti }).default : _rtti;

/**
 * When Building, class names are changed but the library relies on them
 * so they need to be preserved
 * @returns
 */
// FIXME: this would be better in a typescript transformer. This WILL break
export function FixClassNames(): Plugin {
  return {
    name: "fix-class-names",
    enforce: "post" as const,
    transform(code: string, id: string) {
      if (!id.endsWith(".ts") && !id.endsWith(".tsx")) return;
      // Regex to find: let Name = class Name2
      // but not let Name = class extends BaseClass
      const fixed = code.replace(/let\s+(\w+)\s*=\s*class\s+(?!extends)\w+/g, "let $1 = class $1");
      return { code: fixed, map: null };
    },
    config() {
      return {
        esbuild: {
          // if not using this ClassName is changed back to ClassName2 on build
          keepNames: true,
        },
      };
    },
  };
}

type RTTIPluginOptions = {
  /** Files where the rtti transformer should be applied
   *
   * If not set, will include every files by default
   */
  include?: RegExp;
  /** Files where the rtti transformer should not be applied */
  exclude?: RegExp;
  /** Print debug logs */
  debug?: boolean;
};
export function TypescriptRTTI(options: RTTIPluginOptions = {}): Plugin {
  const { include, exclude, debug = false } = options;
  const doTransform: (path: string) => boolean =
    !include && !exclude
      ? () => true
      : (path: string) => {
          if (exclude?.test(path)) return false;
          return include ? include.test(path) : true;
        };
  return typescript({
    transformers: {
      before: [
        {
          type: "program",
          factory: (program) => {
            if (debug) console.debug("[RTTI] Transformer is running!");
            const transformerFactory = rtti(program);
            return (context) => {
              const transform = transformerFactory(context);
              return (source) => {
                if (doTransform(source.fileName)) {
                  if (debug) console.debug(`[RTTI] transforming ${source.fileName}`);
                  return transform(source);
                } else return source;
              };
            };
          },
        },
      ],
    },
    // set declaration to `false` to let plugin dts handle the declarations
    declaration: false,
  });
}

export function XMLModelVitePlugin(options: RTTIPluginOptions = {}) {
  return [FixClassNames(), TypescriptRTTI(options)];
}
export default XMLModelVitePlugin;
