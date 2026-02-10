# XML Model

## Usage

Needs [typescript-rtti](https://github.com/typescript-rtti/typescript-rtti) to retrieve type at runtime.

To build something that relies in `xml-model` with vite

```typescript
import { defineConfig } from "vite";
import XMLModelVitePlugin from "xml-model/vite";

export default defineConfig({
  plugins: [
    // see options in JSDoc
    // note that is tsconfig that includes your source files is not tsconfig.json you MUST use the tsconfig option
    XMLModelVitePlugin(),
  ],
  // ... rest of the config
});
```

## Documentation

### Example

```typescript
import { Model, getModel, XML } from "xml-model";

@Model({
  fromXML(ctx) {
    const instance = new MyClass();
    if (ctx.properties.foo) instance.foo = ctx.properties.foo;
    return instance;
  },
})
class MyClass {
  foo = "bar";
}

const model = getModel(MyClass);

const a: MyClass = model.fromXML("<my-class><foo>test</foo></my-class>");
console.log(JSON.stringify(a)); // {"foo":"test"}

const b = new MyClass();
console.log(XML.stringify(model.toXML(b))); // <my-class><foo>bar</foo></my-class>
b.foo = "other";
console.log(XML.stringify(model.toXML(b))); // <my-class><foo>other</foo></my-class>
```

See [source code](https://github.com/MathisTLD/xml-model) for more
