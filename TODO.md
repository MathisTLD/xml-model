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
