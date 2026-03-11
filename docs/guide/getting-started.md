# Getting Started

## Installation

```bash
npm install xml-model
```

`vite` and `@rollup/plugin-typescript` are optional peer dependencies required only when building with Vite (see [Vite Plugin](/vite-plugin)).

## TypeScript configuration

xml-model relies on TypeScript decorators and on [typescript-rtti](https://typescript-rtti.org) for runtime type information. Two `tsconfig.json` settings are required:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

:::warning useDefineForClassFields
Setting `useDefineForClassFields: false` is essential. With `true` (the TypeScript default when `target` is `ES2022` or later), class field initializers override the metadata written by decorators, breaking property detection.
:::

## Vite plugin setup

The typescript-rtti transformer must run during compilation. Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import XMLModelPlugin from "xml-model/vite";

export default defineConfig({
  plugins: [...XMLModelPlugin()],
});
```

See [Vite Plugin](/vite-plugin) for all available options.

## First example

```ts
import { Model, Prop, getModel } from "xml-model";

@Model({
  fromXML({ properties }) {
    const article = new Article();
    article.title = properties.title as string;
    article.body = properties.body as string;
    return article;
  },
})
class Article {
  @Prop() title: string = "";
  @Prop() body: string = "";
}

const model = getModel(Article);

// Parse XML into an Article instance
const article = model.fromXML(`
  <article>
    <title>Hello world</title>
    <body>This is the body.</body>
  </article>
`);

console.log(article.title); // "Hello world"

// Serialise back to XML
const xml = model.toXML(article);
console.log(XML.stringify(xml));
// <article><title>Hello world</title><body>This is the body.</body></article>
```

Property names are converted to kebab-case automatically: a TypeScript property `publishedAt` maps to the `<published-at>` XML tag. The class name `Article` maps to the `<article>` root tag. Both defaults can be overridden — see [Models](/guide/models) and [Properties](/guide/properties).
