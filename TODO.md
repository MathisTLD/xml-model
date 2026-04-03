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
