import { type Plugin } from "vite";

import typescript, { type RollupTypescriptOptions } from "@rollup/plugin-typescript";
import rtti from "typescript-rtti/dist.esm/transformer";

/**
 * Vite plugin that preserves class names at build time.
 *
 * When Building, class names are changed but the library relies on them
 * so they need to be preserved.
 *
 * @returns A Vite plugin that rewrites mangled class name expressions and enables `keepNames`.
 */
// FIXME: this would be better in a typescript transformer. This WILL break
export function FixClassNames() {
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
  } satisfies Plugin;
}

/** Options for the `TypescriptRTTI` and `XMLModelVitePlugin` plugins. */
export type RTTIPluginOptions = {
  /**
   * Options forwarded to `@rollup/plugin-typescript`.
   *
   * The plugin may not work correctly if you override the `transformers` property,
   * as these options are shallow-merged (not deep-merged).
   */
  typescript?: RollupTypescriptOptions;
  /**
   * Restrict RTTI transformation to files matching this pattern.
   *
   * When omitted, all files are transformed.
   */
  include?: RegExp;
  /** Exclude files matching this pattern from RTTI transformation. */
  exclude?: RegExp;
  /** Print debug logs from the RTTI transformer. */
  debug?: boolean;
};

/**
 * Vite plugin that applies the `typescript-rtti` TypeScript transformer.
 *
 * This transformer emits the runtime type metadata that xml-model uses to
 * introspect property types without manual annotations.
 *
 * @param options - Plugin options controlling which files are transformed.
 * @returns A configured `@rollup/plugin-typescript` instance with the RTTI transformer injected.
 */
export function TypescriptRTTI(options: RTTIPluginOptions = {}) {
  const { typescript: rollupPluginTypescriptOptions, include, exclude, debug = false } = options;
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
    ...rollupPluginTypescriptOptions,
  });
}

/** Alias for `RTTIPluginOptions`. */
export type XMLModelVitePluginOptions = RTTIPluginOptions;

/**
 * Main xml-model Vite plugin.
 *
 * Combines `FixClassNames`, `TypescriptRTTI`, and an internal resolver that
 * rewrites the `xml-model/dist/*` import paths emitted by typescript-rtti back
 * to the canonical `xml-model/*` paths exported by the package.
 *
 * @param options - Options forwarded to `TypescriptRTTI`.
 * @returns An array of Vite plugins.
 */
export function XMLModelVitePlugin(options: RTTIPluginOptions = {}) {
  const distResolver: Plugin = {
    name: "xml-model-resolve-dist",
    enforce: "pre",
    async resolveId(id) {
      const match = id.match(/^xml-model\/dist\/(.*)/);
      if (match) return this.resolve(`xml-model/${match[1]}`);
    },
  };
  return [FixClassNames(), TypescriptRTTI(options), distResolver];
}
export default XMLModelVitePlugin;
