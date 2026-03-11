import { build, defineConfig } from "vite";
import { join, resolve } from "path";

import { Lib } from "marmotte/vite/lib";

export default defineConfig((env) => {
  return {
    plugins: [
      // for tests
      env.command === "serve" && process.env.VITEST
        ? // only use plugin in tests
          import("xml-model/vite")
            .then((m) =>
              m.default({
                include: /\.test\.ts$/,
                exclude: /src\/vite\//,
              }),
            )
            .catch((error) => {
              throw new Error(
                "Failed to load xml-model/vite, you should run `npm run build` first",
                {
                  cause: error,
                },
              );
            })
        : false,
      Lib({
        docs: false,
        // TODO: bundle the types of typescript-rtti so we don't have to add it as a dependency
      }),
      // TODO: we could build both with a single vite config once we fully bundle typescript-rtti
      {
        name: "build-vite-plugin",
        // only when building
        apply: "build",
        async generateBundle() {
          const outputs = await build({
            root: import.meta.dirname,
            configFile: resolve(import.meta.dirname, "vite.config.vite-plugin.ts"),
            build: {
              write: false,
            },
          });
          if (!Array.isArray(outputs)) throw new Error("expected array of outputs");
          if (outputs.length !== 1) throw new Error("expected a single output");
          const { output } = outputs[0];
          for (const o of output) {
            console.log(o.fileName);
            const fileName = join("vite", o.fileName);
            if (o.type === "asset") {
              this.emitFile({
                type: "asset",
                fileName,
                source: o.source,
              });
            } else {
              this.emitFile({
                type: "prebuilt-chunk",
                fileName,
                code: o.code,
                map: o.map ?? undefined,
                sourcemapFileName: o.sourcemapFileName ?? undefined,
                exports: o.exports,
              });
            }
          }
        },
      },
    ],
    build: {
      // emptyOutDir: false,
    },
  };
});
