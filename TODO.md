<!-- #region bugs -->

## Bugs

### `XML_STATE` not preserved for nested objects through `schema.parse()`

`XML_STATE` is a non-enumerable symbol attached to decoded plain-data objects. It contains
`fieldOrder: Array<string | XMLElement>` where `XMLElement` entries are **unknown/unsupported
elements** that must be re-emitted verbatim on encode.

`fromXML` already saves/restores `XML_STATE` around `schema.parse(inputData)` — but only
at the **top level**. For nested model instances (e.g. `users: User[]`), `schema.parse()`
runs `User.schema()` on each already-created User instance, which:

1. Reads the instance's enumerable properties through the ZodObject chain
2. Creates a **new** plain data object (stripping the non-enumerable XML_STATE)
3. Wraps it in a new User instance via `fromData()`

Re-attaching after the fact won't work either — the new objects have no connection to the
originals, so there's no way to map old states to new ones.

**Fix: remove `schema.parse(inputData)` from `fromXML`.**

The `decode()` step already does everything `schema.parse()` does:

- ZodCodec decode handler calls `schema.def.transform()` = `fromData()` for model fields
- ZodDefault handler returns `getDefault()` when `ctx.xml` is null
- ZodOptional handler returns `undefined` when `ctx.xml` is null
- All primitive coercion happens in the typed decode handlers

So `schema.parse()` is purely redundant in `fromXML` — and harmful because it loses
`XML_STATE` on nested objects.

```ts
// src/xml/model.ts — fromXML
static fromXML(this: T, input: string | XMLRoot | XMLElement): InstanceType<T> {
  if (typeof input === "string") input = XML.parse(input);
  if (XML.isRoot(input)) input = XML.elementFromRoot(input);
  const inputData = decode(this.dataSchema, input);
  // Don't call schema.parse() — it recreates nested data objects, stripping the
  // non-enumerable XML_STATE symbol and losing unknown-element passthrough.
  // decode() already applies all transforms and defaults.
  return this.fromData(inputData as unknown as z.output<typeof this.dataSchema>);
}
```

<!-- #endregion bugs -->

---

<!-- #region limitations -->

## Known Limitations

### Non-inline primitive arrays require an explicit item tagname

For non-inline arrays of primitive types, the element schema must carry an explicit tagname
via `xml.root(schema, { tagname: "…" })`, otherwise encoding throws "tagname is not
defined". Model arrays are fine because the model's root tagname is resolved automatically
from the ZodObject.

```ts
// ✅ works — explicit item tagname
models: z.array(xml.root(z.string(), { tagname: "model" }));

// ❌ throws at encode time — no tagname on item schema
names: z.array(z.string());
```

### TypeDoc does not show inherited fields from `.extend()` subclasses

TypeDoc resolves the merged Zod schema of a subclass (produced by `.extend()`) back to
the original field declarations in the parent schema. As a result, fields like `vin`,
`make`, or `year` only appear on the parent class (`Vehicle`) in the API reference — they
are not listed again under `Car` or `SportCar`, even though those classes carry them.

This is a TypeDoc limitation: it does not understand the Zod-specific inheritance pattern
and cannot tell that the fields were intentionally re-exposed on the subclass. There is no
TypeDoc option to force field re-listing for this case.

**Workaround:** document inherited fields in the parent class JSDoc comments, and note in
the subclass description that it inherits fields from the parent (e.g. `@see Vehicle`).

<!-- #endregion limitations -->

---

<!-- #region roadmap -->

## Roadmap

### Mixin-based multi-codec base classes

Goal: allow a single class to support multiple codecs with named helpers (e.g. both
`fromXML()` and `fromJSON()`) without any codec-specific re-declaration of `extend()`.

Each codec package exports a mixin and a pre-built base:

```ts
// xml-model
export function xmlMixin<T extends ModelConstructor<any>>(Base: T) {
  return class extends Base {
    static fromXML(input) { … }
    static toXML(instance) { … }
    static toXMLString(instance, opts?) { … }
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
  { vin: xml.attr(z.string(), { name: "vin" }), make: z.string() },
  xml.root({ tagname: "vehicle" }),
) {}

// Multi-codec
const MultiBase = jsonMixin(XMLBase);
class Book extends MultiBase.extend(
  { title: z.string(), pages: z.number() },
  { ...xml.root({ tagname: "book" }), ...json.root({ key: "book" }) },
) {}
```

**Status: design only — not yet implemented**

### Per-constructor default conversions

Goal: let users register a default XML conversion strategy for a Zod type class (e.g. "all
`z.ZodString` schemas serialize as CDATA", "`z.ZodNumber` coerces via `parseInt` not
`parseFloat`").

```ts
xmlCodec.registerDefault(z.ZodString, myStringConverter);
```

The main complication: `refine()` wraps schemas in a `ZodPipe` in v4, losing the
constructor identity. The codec would need to walk the `def` chain to find the innermost
primitive. Non-trivial but self-contained inside `codec.ts`; per-field `.meta()` overrides
take precedence regardless.

**Leave for later** unless there is a concrete use case driving it.

<!-- #endregion roadmap -->
