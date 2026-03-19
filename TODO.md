<!-- #region bugs -->

## Bugs

### `XML_STATE` not preserved through `schema.parse()`

`XML_STATE` is a non-enumerable symbol attached to decoded plain-data objects. Every
`schema.parse()` call creates a fresh object that drops all symbol properties, so field
order and unknown-element passthrough are lost. `fromXML` already re-attaches it after
parsing, but two callsites remain:

- ZodCodec decode handler: `schema.parse(input)` strips `XML_STATE` for nested model
  instances used as fields.
- `xmlCodec`: `z.codec(...).decode()` calls `outSchema.parse()` internally, same effect.

Fix: capture `XML_STATE` before parse and re-attach it to the post-parse object (same
pattern already used in `fromXML`).

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
