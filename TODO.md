## Future: mixin-based multi-codec base classes

Goal: allow a single class to support multiple codecs with named helpers (e.g. both
`fromXML()` and `fromJSON()`) without any codec-specific re-declaration of `extend()`.

### Design

#### `extend()` in base `model()`

Accepts an optional second argument typed as `Partial<z.GlobalMeta>` and applies it via
`.meta()` on the extended schema. No codec knowledge needed in the base.

Return type uses `Omit<Self, keyof ModelConstructor<S, Inst>>` to carry over all
codec-specific statics (`fromXML`, `toXML`, …) from the parent into the result, so named
helpers are not lost after chaining `.extend()`.

#### Codec meta helpers

Each codec exposes a `root()` helper returning a typed `Partial<z.GlobalMeta>` with a
distinctive namespaced key (string for now, symbol later):

```ts
// xml-model — key is "@@xml-model/xmlRoot" internally
xml.root({ tagname: "book" });
// → { "@@xml-model/xmlRoot": { tagname: "book" } }
```

Multiple codecs compose cleanly with spread:

```ts
class Book extends Base.extend(
  { title: z.string(), pages: z.number() },
  { ...xml.root({ tagname: "book" }), ...json.root({ key: "book" }) },
) {}
```

`getXMLRootMeta(schema)` reads the namespaced key from the registry instead of `"xmlRoot"`.

#### Mixin-based multi-codec base classes

Each codec package exports a mixin and a pre-built base:

```ts
// xml-model
export function xmlMixin<T extends ModelConstructor<any>>(Base: T) {
  return class extends Base {
    static fromXML(input) {
      return this.from("xml", input);
    }
    static toXML(instance) {
      return this.to("xmljs", instance);
    }
    static toXMLString(instance, opts?) {
      return this.to("xml", instance, opts);
    }
  };
}
export const XMLBase = xmlMixin(model(z.object({})));
```

Users compose mixins for multi-codec classes:

```ts
import { xmlMixin, XMLBase } from "xml-model";
import { jsonMixin } from "json-model"; // hypothetical

// Single-codec (most common)
class Vehicle extends XMLBase.extend(
  { vin: xml.attr(z.string(), { name: "vin" }), make: xml.prop(z.string()) },
  xml.root({ tagname: "vehicle" }),
) {}

// Multi-codec
const MultiBase = jsonMixin(XMLBase);
class Book extends MultiBase.extend(
  { title: z.string(), pages: z.number() },
  { ...xml.root({ tagname: "book" }), ...json.root({ key: "book" }) },
) {}

Book.fromXML("<book>...");
Book.fromJSON({ ... });
Book.from("xml", "..."); // generic, also works
```

### Pre-requisites

- Validate that `Omit<Self, keyof ModelConstructor<...>> & ModelConstructor<NewSchema, ...>`
  correctly preserves codec-specific statics through chained `.extend()` calls in TypeScript
- ✅ Unified `"xml"` + `"xmlRoot"` into a single `"@@xml-model"` key; `XMLFieldMeta` +
  `XMLRootMeta` merged into `XMLMeta`
- Try symbol keys later as a follow-up once the string-key version is working

### Status: design only — not yet implemented

---

## Generalization

The library is two orthogonal concerns:

1. **model** — a generic class factory that instantiates typed classes from decoded data
2. **codec** — pluggable, schema-metadata-driven serialization/deserialization engines

### model

Replace `xmlModel(schema, xmlSpecificMeta)` with a generic `model(schema, options)`:

```ts
class Car extends model(schema) {}

Car.from("xml", xmlString); // decode using registered "xml" codec
Car.to("xml", instance); // encode using registered "xml" codec
Car.getCodec("xml"); // access the raw codec
```

Codec-specific factories (like `xmlModel`) become thin wrappers that call `model()` and
inject named helpers as a subclass, keeping the ergonomic API:

```ts
// xml/index.ts
function xmlModel(schema, xmlMeta?) {
  const Base = model(schema);
  return class extends Base {
    static fromXML(input) {
      return this.from("xml", input);
    }
    static toXML(instance) {
      return this.to("xmljs", instance);
    }
    static toXMLString(instance, options?) {
      return this.to("xml", instance, options);
    }
  };
}
```

This means `xmlModel` stays unchanged externally; `jsonModel` or any other codec follows
the same pattern.

#### Additional constructor arguments

`from()` calls a static `fromData(data)` hook instead of `new this(data)` directly.
Override it to inject extra constructor arguments:

```ts
// default in model()
static fromData(data: Data) {
  return new this(data);
}

// user override
class Car extends xmlModel(schema) {
  static fromData(data: CarData) {
    return new Car(data, getDb()); // pass whatever extra args are needed
  }
}
```

Extending arbitrary base classes is deferred — `Object.assign(this, data)` covers all
current use cases.

### codec

Codecs are Zod-based bidirectional transformers, configurable via schema `.meta()`.
Register them in an augmentable `CodecMap` interface for typed `from`/`to` calls:

```ts
declare module "xml-model" {
  interface CodecMap {
    xml: Codec<string, Data>;
    xmljs: Codec<XMLRoot, Data>;
  }
}
```

Codecs chain: `xmljs` handles `XMLRoot ↔ Data`; `xml` extends it to add `string ↔ XMLRoot`,
giving `string ↔ XMLRoot ↔ Data`. This maps to the current `toXML` vs `toXMLString`
distinction and replaces the hybrid logic in `xmlModel` with explicit layering.

## Known codec limitation

Non-inline serialisation (`toXMLString`) currently uses the _field_ tag name for each item
element (e.g., items in `models` are written as `<models>…</models>` instead of `<model>…
</model>`). Round-tripping via `fromXML(toXMLString(x))` works because the parser ignores
item tag names, but the output is not idiomatic XML. Fix in `codec.ts` before writing a
docs round-trip example (use `getRootTagname(elementSchema)` for item tag when available,
fall back to a configurable item tag name or the field name).

---

## Future: per-constructor default conversions

Goal: let users register a default XML conversion strategy for a Zod type class (e.g. "all
z.ZodString schemas serialize as CDATA", "z.ZodNumber coerces via parseInt not parseFloat").

### Lightweight design

```ts
// A map keyed on Zod class constructors
const typeConversions = new Map<Function, XMLConvertFn>();

// Register a default for all z.string() schemas
xmlCodec.registerDefault(z.ZodString, myStringConverter);

// Lookup during codec (fallback when no per-field meta is set):
const convert = typeConversions.get(schema.constructor) ?? builtinConvert;
```

### The `z.string().refine(...)` problem

`refine()` wraps the schema in a `ZodPipe` in v4, losing the `ZodString` constructor
identity. To handle this, the codec would need to walk the `def` chain to find the
innermost primitive:

```ts
function unwrapToLeaf(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodPipe) return unwrapToLeaf(schema.def.in);
  if (schema instanceof z.ZodOptional) return unwrapToLeaf(schema.def.innerType);
  // ... other wrappers
  return schema;
}
const convert = typeConversions.get(unwrapToLeaf(schema).constructor) ?? builtinConvert;
```

This is non-trivial but contained — all changes stay inside codec.ts. Per-field `.meta()`
overrides take precedence; the constructor default is only a fallback.

**Leave for later** unless there is a concrete use case driving it.
