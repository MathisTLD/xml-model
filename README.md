# XML Model

## Usage
needs [typescript-rtti](https://github.com/typescript-rtti/typescript-rtti) and [ttypescript](https://github.com/cevek/ttypescript) to work

To build something that relies in `xml-model` with vite

```typescript
import { defineConfig } from "vite";
import XMLModelVitePlugin from "xml-model/vite";

export default defineConfig({
  plugins: [
    // see options in JSDoc
    XMLModelVitePlugin()
  ],
  // ... rest of the config
});
```

## Documentation
check source