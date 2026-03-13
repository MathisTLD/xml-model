import { type Plugin } from "vite";

/**
 * Vite plugin that preserves class names at build time.
 *
 * When building, bundlers may rename or anonymise class expressions, breaking
 * the tag-name derivation and model registry that rely on `Class.name`.
 * This plugin rewrites the final chunk output to restore the variable name as
 * the class name, and enables esbuild's `keepNames` as an additional safeguard.
 *
 * Handles all declaration forms:
 * - `let Foo = class Bar`  → `let Foo = class Foo`
 * - `const Foo = class {`  → `const Foo = class Foo {`
 * - `let Foo = class Bar extends Base` → `let Foo = class Foo extends Base`
 * - `export let Foo = class Bar` → `export let Foo = class Foo`
 *
 * @returns A Vite plugin that normalises class names in bundled output.
 */
/**
 * Rewrites mangled class name expressions in bundled JavaScript output.
 * Exported for testing.
 */
export function fixClassNames(code: string): string {
  // Match: [export] (let|const|var) VarName = class [AnyName]
  // The optional class name group is skipped if followed by `extends`.
  return code.replace(
    /\b((?:export\s+)?(?:let|const|var))\s+(\w+)\s*=\s*class\b(?:\s+(?!extends\b)\w+)?/g,
    "$1 $2 = class $2",
  );
}

export function FixClassNames() {
  return {
    name: "fix-class-names",
    config() {
      return {
        esbuild: { keepNames: true },
      };
    },
    renderChunk(code: string) {
      const fixed = fixClassNames(code);
      if (fixed === code) return null;
      return { code: fixed, map: null };
    },
  } satisfies Plugin;
}
