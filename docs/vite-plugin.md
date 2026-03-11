# Vite Plugin

xml-model relies on [typescript-rtti](https://typescript-rtti.org) for runtime type information. typescript-rtti works by injecting a TypeScript compiler transformer that emits metadata during compilation. The Vite plugin wires this transformer into your Vite build.

## Installation

`vite` and `@rollup/plugin-typescript` are peer dependencies:

```bash
npm install --save-dev vite @rollup/plugin-typescript tslib
```

## Setup

```ts
// vite.config.ts
import { defineConfig } from "vite";
import XMLModelPlugin from "xml-model/vite";

export default defineConfig({
  plugins: [...XMLModelPlugin()],
});
```

`XMLModelPlugin()` returns an array of plugins. Spread it into `plugins`.

:::tip tsconfig requirement
The plugin requires `experimentalDecorators: true` and `useDefineForClassFields: false` in your `tsconfig.json`. See [Getting Started](/guide/getting-started#typescript-configuration) for details.
:::

## Options

```ts
XMLModelPlugin({
  include: /\.ts$/,       // only transform matching files
  exclude: /node_modules/, // never transform these files
  debug: false,            // print RTTI transformer debug logs
  typescript: { ... },     // options forwarded to @rollup/plugin-typescript
})
```

### include

`RegExp` — Restrict RTTI transformation to files whose path matches this pattern. When omitted, all files are transformed.

```ts
// Only transform application source files, not tests
XMLModelPlugin({ include: /src\/(?!.*\.test\.ts)/ });
```

### exclude

`RegExp` — Skip RTTI transformation for files whose path matches this pattern. Evaluated before `include`.

```ts
XMLModelPlugin({ exclude: /node_modules/ });
```

### typescript

Options forwarded directly to `@rollup/plugin-typescript`. Useful for specifying a custom `tsconfig` path:

```ts
XMLModelPlugin({
  typescript: { tsconfig: "./tsconfig.app.json" },
});
```

:::warning
Do not override the `transformers` option inside `typescript` — the plugin uses it to inject the RTTI transformer, and overriding it would break the integration.
:::

### debug

`boolean` (default: `false`) — When `true`, prints a log line for each file the RTTI transformer processes.

```ts
XMLModelPlugin({ debug: true });
// [RTTI] Transformer is running!
// [RTTI] transforming /path/to/src/models/book.ts
```

## Individual plugins

The plugins composing `XMLModelPlugin` are also exported individually:

```ts
import { FixClassNames, TypescriptRTTI } from "xml-model/vite";
```

- **`FixClassNames()`** — Post-transform plugin that prevents esbuild from mangling class names that the library relies on for tag-name derivation.
- **`TypescriptRTTI(options)`** — Applies the typescript-rtti TypeScript transformer via `@rollup/plugin-typescript`.

## Caveats

### Monorepo / Vitest workspaces

The RTTI transformer must be loaded by the Vite/Vitest instance that processes your source files. In a monorepo, running `vitest` from the repo root may not pick up the package-level `vite.config.ts`, which means the transformer never runs and all runtime type reflection silently returns empty results.

**Fix:** run `vitest` from within the package directory, or configure [Vitest workspaces](https://vitest.dev/guide/workspace) so each package uses its own `vite.config.ts`.

### `import type` and property erasure

typescript-rtti emits metadata by reading TypeScript type information during compilation. If a class used as a property type is imported with `import type` (or `import { type X }`), TypeScript erases the import before the transformer runs — leaving the property with no usable type information at runtime.

xml-model will log a warning when it detects this:

```
[xml-model] Property 'mask' on 'VideoAnalysisFilter' has type Object at runtime.
If its declared type is a class, make sure it is imported as a value and not with 'import type'.
```

**Fix:** change `import type Foo from "./foo"` to `import Foo from "./foo"` for any class used as a property type.
