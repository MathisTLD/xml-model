Some questions

- Why do you use weakmaps to store propmeta ? they could just be in the global zod registry or a dedicated registry (but it might hurt the DX a little idk)
  → Done: replaced with z.globalRegistry via .meta()

- I don't see an example of a class extending another and addin new fields to the schema in your tests. class created with the xmlModel helper could be extended by using `parent.dataSchema.extend` what do you think ?
  → Done: added static .extend() helper + tests showing both verbose (dataSchema.extend) and concise (Vehicle.extend) patterns

- We could keep an API very close to the old one by storing the old conversion options in the meta registry instead of what decorators did before. The tricky part would be resolving parents which is doable for classes (we can discuss about this)

- these changes would remove the need for `xml.attr` or `xml.prop` we could just use `z.<someType>().meta({ xml: <actual conversion options> })` then we could still have helpers to handle the `.meta` part for us but we could manually set it when we need more fine-grained options
  → Done: helpers now delegate to .meta(); users can call z.string().meta({ xml: { attr: "id" } }) directly

## Docs plan (VitePress)

All examples live in `src/examples.ts` with named regions. Import them in `.md` files with:

```md
<<< @/src/examples.ts#region-name
```

### Pages / sections to write

| Region         | Doc section                   | Notes                                           |
| -------------- | ----------------------------- | ----------------------------------------------- |
| `vehicle`      | Getting started — basic model | Show the XML alongside the class                |
| `engine`       | Nested classes                | Pair with `car` region                          |
| `car`          | Nested classes + `.extend()`  | Show the XML, note inherit of `label()`         |
| `sport-car`    | Chained extension             | Show `instanceof` chain                         |
| `motorcycle`   | Optional fields               | Show absent vs present `<sidecar>`              |
| `fleet`        | Inline arrays                 | **Must document inline behaviour** (see below)  |
| `showroom`     | Non-inline (wrapped) arrays   | Contrast with fleet, show `<models>` wrapper    |
| `car-no-proto` | Fresh class pattern           | Contrast with `.extend()`, note no `instanceof` |

### Inline vs non-inline — must document clearly

`inline: true` vs the default (non-inline) is the most likely point of confusion:

- **inline** (`inline: true`): each item is a _direct sibling_ of the root element.
  `<fleet><car .../><car .../><motorcycle .../></fleet>` — items mix freely in document order.
- **non-inline** (default): items are _nested inside a single wrapper element_ whose tag
  name comes from the field name (kebab-cased).
  `<showroom><models><model>Corolla</model></models></showroom>`

Document when to use each (inline = heterogeneous siblings, non-inline = homogeneous list
with a clear container).

### Known codec limitation to document (or fix first)

Non-inline serialization (`toXMLString`) currently uses the _field_ tag name for each item
element (e.g., items in `models` are written as `<models>…</models>` instead of `<model>…
</model>`). Round-tripping via `fromXML(toXMLString(x))` works because the parser ignores
item tag names, but the output is not idiomatic XML. Fix in `codec.ts` before writing the
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
