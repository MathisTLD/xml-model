import { defineConfig } from "vite";
import XMLModelVitePlugin from "xml-model/vite";

export default defineConfig({
  plugins: [
    // see options in JSDoc
    XMLModelVitePlugin(),
  ],
  build: {
    minify: false,
    lib: {
      entry: { index: "./src/index.ts" },
      formats: ["es"],
    },
  },
});
