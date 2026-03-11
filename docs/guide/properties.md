# Properties

The `@Prop()` decorator customises how a single class property is mapped to XML. All options are optional — omitting `@Prop()` entirely uses the defaults inferred from the property's TypeScript type.

## Basic usage

```ts
@Model({ fromXML: ... })
class Book {
  @Prop() title: string = "";
  @Prop() year: number = 0;
}
```

Property names are converted to kebab-case XML tags automatically: `publishedAt` → `<published-at>`.

## Options

### tagname

Override the XML tag name for this property:

```ts
@Prop({ tagname: "pub-year" })
year: number = 0;
// maps to <pub-year>1965</pub-year>
```

### ignore

Exclude a property from XML conversion entirely:

```ts
@Prop({ ignore: true })
internalId: string = "";
// never appears in XML output or input
```

### sourceElements

Controls which XML elements are used as the source for this property during `fromXML`.

- **`string`** — exact tag name match
- **`RegExp`** — tag name pattern match
- **`function`** — custom predicate `(element, context) => boolean`

```ts
// Match any element whose name starts with "alt-"
@Prop({ sourceElements: /^alt-/ })
altTitles: string[] = [];

// Custom predicate
@Prop({
  sourceElements: (element) => element.attributes?.lang === "en",
})
englishTitle: string = "";
```

### inline

When `true`, array items are serialised and deserialised directly inside the parent element rather than being wrapped in a container tag.

**Default (container tag):**

```xml
<book>
  <chapters>
    <chapter>...</chapter>
    <chapter>...</chapter>
  </chapters>
</book>
```

**With `inline: true`:**

```xml
<book>
  <chapter>...</chapter>
  <chapter>...</chapter>
</book>
```

```ts
@Prop({ inline: true })
chapters: Chapter[] = [];
```

### model

Explicitly specify which `XMLModel` to use when converting this property's value. Useful when the property type is an interface or when you want to use a different model than the default for that class.

```ts
const specialModel = createModel(Address, { ... });

@Prop({ model: specialModel })
address: Address = new Address();
```

### fromXML

Override the default deserialization logic for this property:

```ts
@Prop({
  fromXML({ elements }) {
    return elements[0]?.attributes?.["value"] ?? "";
  },
})
code: string = "";
```

### toXML

Override the default serialization logic for this property:

```ts
@Prop({
  toXML({ value }) {
    return {
      elements: [{ type: "element", name: "code", attributes: { value: String(value) } }],
    };
  },
})
code: string = "";
```

## Array handling

For array properties whose element type has a registered model, xml-model handles conversion automatically.

**Without `inline`** (default), the array is expected to live inside a wrapper element whose tag matches the property name:

```xml
<book>
  <chapters>
    <chapter><title>One</title></chapter>
    <chapter><title>Two</title></chapter>
  </chapters>
</book>
```

```ts
@Prop()
chapters: Chapter[] = [];
```

**With `inline: true`**, each item's element appears directly inside the parent:

```xml
<book>
  <chapter><title>One</title></chapter>
  <chapter><title>Two</title></chapter>
</book>
```

```ts
@Prop({ inline: true })
chapters: Chapter[] = [];
```

## Union of literals

Union types composed entirely of literals of the same primitive type are handled automatically by delegating to the constructor's model. For example, a property typed as `0 | 1 | 2` delegates to the `Number` model.

```ts
@Prop()
status: 0 | 1 | 2 = 0;
```

## Caveats

### `import type` and silent property skipping

xml-model uses typescript-rtti to read property types at runtime. If a class used as a property type is imported with `import type`, TypeScript erases the import before the RTTI transformer runs — the property's type becomes `Object` at runtime and xml-model cannot convert it.

xml-model logs a warning when it detects this situation:

```
[xml-model] Property 'mask' on 'VideoAnalysisFilter' has type Object at runtime.
If its declared type is a class, make sure it is imported as a value and not with 'import type'.
```

**Fix:** use a value import for any class that appears as a property type:

```ts
// Wrong — erased at runtime
import type { Mask } from "./mask";

// Correct
import { Mask } from "./mask";

class VideoAnalysisFilter {
  mask: Mask; // now reflected correctly
}
```

If you need the type only for type-checking and not at runtime, use `@Prop({ model: ... })` to supply the model explicitly instead.
