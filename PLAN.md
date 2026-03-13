# Next version — Zod-based rewrite

## Motivation

The current `@Model`/`@Prop` decorator approach depends on `typescript-rtti`, which requires a
TypeScript compiler transformer injected at build time. This causes:

- Class name mangling — `@Prop` decorates the wrong class after bundler renames it
- `import type` erasure — silently skips properties whose type was erased
- Fragile Vite plugin — `FixClassNames` is a regex hack that will keep breaking
- Hard to test — requires a full isolated build to exercise the plugin chain
- Monorepo friction — the transformer must run in the exact right Vitest/Vite instance

**New approach:** replace runtime type reflection with explicit Zod v4 schemas. Zod schemas are
plain JavaScript objects that carry full structural information at runtime — no transformer, no
decorator, no class name dependency.

---

## High-level design

```ts
// Define schema with XML metadata
const BookSchema = z
  .object({
    title: xml.prop(z.string()),
    year: xml.prop(z.number()),
    chapters: xml.prop(z.array(ChapterSchema), { inline: true }),
  })
  .meta({ xml: { tagname: "book" } });

// Option A — pure codec (no class)
const codec = xmlCodec(BookSchema);
const book = codec.fromXML("<book>...</book>");
codec.toXMLString(book); // "<book>...</book>"

// Option B — class with methods
class Book extends xmlModel(BookSchema) {
  wordCount() {
    return this.chapters.length;
  }
}
const book = Book.fromXML("<book>...</book>"); // Book instance
book.title; // typed from schema
book.wordCount(); // from class
```

No Vite plugin required. No build-time transformation. Works in any environment.

---

## Branch strategy

Work on a `next` branch. Keep `main` stable (v1). Merge when feature-complete.

---

## Phase 1 — XML metadata system (`src/schema-meta.ts`)

Goal: attach and read XML configuration on Zod v4 schemas.

### 1.1 Define metadata types

```ts
interface XMLPropMeta {
  tagname?: string; // overrides kebab-case derivation from property name
  inline?: boolean; // flatten array items into parent element (no wrapper tag)
  ignore?: boolean; // exclude this property from XML conversion
  /**
   * Custom element matcher for this field.
   * Allows multiple different tag names to map to a single field (e.g. inline
   * heterogeneous arrays, aliased tags, wildcard captures).
   * When set, `tagname` is only used for serialization (toXML); matching during
   * parsing uses this predicate instead.
   *
   * Examples:
   *   match: "alt-title"                         — exact tag name
   *   match: /^(cat|dog)$/                       — regex on tag name
   *   match: (el) => el.attributes?.type === "x" — arbitrary predicate
   */
  match?: string | RegExp | ((el: XMLElement) => boolean);
  // toXML / fromXML overrides are handled at the codec level (see Phase 2)
}

interface XMLAttrMeta {
  name: string; // XML attribute name (required)
  ignore?: boolean;
}

interface XMLRootMeta {
  tagname?: string; // optional — if absent, schema maps to unwrapped content
}
```

### 1.2 Metadata registry

Use a Zod v4 custom registry (not `z.globalRegistry` to avoid polluting global):

```ts
const xmlRegistry = new z.ZodRegistry<XMLPropMeta | XMLRootMeta>();
```

### 1.3 Helper: `xml.prop(schema, meta?)`

```ts
// Attaches XMLPropMeta to a field schema
xml.prop(z.string(), { tagname: "pub-year" });
xml.prop(z.array(ChapterSchema), { inline: true });
xml.prop(z.number()); // meta optional — uses defaults
```

### 1.4 Helper: `xml.model(schema, meta?)`

```ts
// Attaches XMLRootMeta to an object schema
xml.model(z.object({ ... }), { tagname: "my-book" })
// equivalent to schema.meta({ xml: { tagname: "my-book" } }) but typed
```

### 1.5 Reading metadata (internal)

```ts
function getXMLPropMeta(schema: z.ZodType): XMLPropMeta { ... }
function getXMLRootMeta(schema: z.ZodType): XMLRootMeta { ... }
function getPropTagname(fieldName: string, schema: z.ZodType): string {
  return getXMLPropMeta(schema).tagname ?? kebabCase(fieldName);
}
function getRootTagname(schema: z.ZodType): string {
  return getXMLRootMeta(schema).tagname ?? /* inferred or required */ "";
}
```

---

## Phase 2 — Core codec engine (`src/codec.ts`)

Goal: `xmlCodec(schema)` → `{ fromXML, toXML, toXMLString }`.

### 2.1 Codec interface

```ts
interface XMLCodec<T> {
  fromXML(xml: string | XMLRoot): T;
  toXML(value: T): XMLRoot;
  toXMLString(value: T): string;
}
```

### 2.2 `xmlCodec(schema)` implementation

Walks the Zod schema shape and builds `fromXML`/`toXML` by type-switching on the schema kind.

#### Type handling matrix

| Zod type                              | fromXML                                                                              | toXML                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `z.string()`                          | `String(getContent(el))`                                                             | `fromContent(value)`                                        |
| `z.number()`                          | `Number(getContent(el))`                                                             | `fromContent(String(value))`                                |
| `z.boolean()`                         | `getContent(el) === "true"`                                                          | `fromContent(String(value))`                                |
| `z.object(shape)`                     | recurse into shape, collect child elements                                           | wrap properties in root tag                                 |
| `z.array(item)`                       | inline: take all matching elements; not inline: unwrap wrapper tag, iterate children | inline: flatten elements; not inline: wrap in container tag |
| `z.optional(inner)`                   | return `undefined` when no matching element                                          | skip field when value is `undefined`                        |
| `z.union([...literals])`              | delegate to primitive codec                                                          | delegate to primitive codec                                 |
| `z.discriminatedUnion(key, variants)` | match XML tag name to variant tagname                                                | dispatch on variant schema                                  |
| `z.lazy(() => schema)`                | defer codec creation (for recursive schemas)                                         | defer codec creation                                        |
| `xml.attr(z.string(), ...)`           | `element.attributes[name]`                                                           | `setAttribute(el, name, value)`                             |

#### Codec caching

Use a `WeakMap<ZodType, XMLCodec<any>>` to avoid recreating codecs for the same schema.

```ts
const codecCache = new WeakMap<z.ZodType, XMLCodec<any>>();

export function xmlCodec<S extends z.ZodObject<any>>(schema: S): XMLCodec<z.infer<S>> {
  if (codecCache.has(schema)) return codecCache.get(schema)!;
  const codec = buildCodec(schema);
  codecCache.set(schema, codec);
  return codec;
}
```

### 2.3 `fromXML` implementation sketch

Order preservation is a hard requirement: round-tripping XML must produce the same tag order.

**Strategy**: iterate XML elements in document order (not schema field order) to build the
result object with keys inserted in document order. JS preserves string key insertion order, but
`schema.parse()` rebuilds the object in schema field order — so we store the original document
sequence as a non-enumerable Symbol property on the parsed output and use it in `toXML`.

**Unknown elements** must be preserved and re-emitted at their original position. The sequence
stores both field names (known) and raw `XMLElement` objects (unknown), interleaved exactly as
they appeared in the source document.

```ts
/**
 * Non-enumerable Symbol attached to parsed objects.
 * Stores the original document sequence as (string | XMLElement)[]:
 *   - string  → field name (known field, first occurrence sets position)
 *   - XMLElement → unknown element, stored verbatim for passthrough
 */
export const FIELD_ORDER = Symbol("xml-model.fieldOrder");

type OrderEntry = string | XMLElement;

function buildFromXML<S extends z.ZodObject<any>>(schema: S) {
  const shape = schema.shape;

  return function fromXML(xml: string | XMLRoot): z.infer<S> {
    const root = typeof xml === "string" ? XML.parse(xml) : xml;
    const rootTagname = getRootTagname(schema);
    const rootEl = rootTagname ? root.elements[0] : null;
    const innerEls = rootEl?.elements ?? (rootTagname ? [] : root.elements);

    // Build a matcher list — each field has a predicate derived from its meta.
    // Fields with `match` use it; others fall back to tagname equality.
    // Order matters: first matching field wins.
    const matchers: Array<{ fieldName: string; test: (el: XMLElement) => boolean }> = [];
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const meta = getXMLPropMeta(fieldSchema as z.ZodType);
      if (meta.ignore) continue;
      const tagname = getPropTagname(fieldName, fieldSchema as z.ZodType);
      const test = resolveMatchFn(meta.match, tagname);
      matchers.push({ fieldName, test });
    }

    const raw: Record<string, XMLElement[]> = {}; // field → collected elements
    const sequence: OrderEntry[] = []; // document order, including unknowns
    const seenFields = new Set<string>();

    for (const el of innerEls) {
      const match = matchers.find((m) => m.test(el));
      if (!match) {
        // Unknown element — store verbatim for passthrough
        sequence.push(el);
        continue;
      }
      const { fieldName } = match;
      if (!raw[fieldName]) raw[fieldName] = [];
      raw[fieldName].push(el);
      if (!seenFields.has(fieldName)) {
        seenFields.add(fieldName);
        sequence.push(fieldName); // first occurrence establishes position
      }
    }

    // Convert each matched field
    const result: Record<string, unknown> = {};
    for (const fieldName of seenFields) {
      const fieldSchema = shape[fieldName] as z.ZodType;
      result[fieldName] = convertFromXML(fieldSchema, raw[fieldName], getXMLPropMeta(fieldSchema));
    }

    // Zod validates, fills defaults, checks optionality
    const validated = schema.parse(result);

    // Re-attach sequence (invisible to spread, JSON.stringify, Object.keys, etc.)
    Object.defineProperty(validated, FIELD_ORDER, { value: sequence, enumerable: false });

    // Preserve root element attributes on the object too
    if (rootEl?.attributes) {
      Object.defineProperty(validated, ROOT_ATTRS, {
        value: rootEl.attributes,
        enumerable: false,
      });
    }

    return validated;
  };
}

/** Resolves the `match` option to a predicate function. */
function resolveMatchFn(
  match: XMLPropMeta["match"],
  defaultTagname: string,
): (el: XMLElement) => boolean {
  if (!match) return (el) => el.name === defaultTagname;
  if (typeof match === "string") return (el) => el.name === match;
  if (match instanceof RegExp) return (el) => match.test(el.name ?? "");
  return match;
}
```

Key points:

- **Multi-tag grouping**: `match` predicate on a field captures any element that satisfies it,
  regardless of tag name. Multiple different tags can accumulate into one array field.
- **Unknown passthrough**: unmatched elements are stored as `XMLElement` entries in `sequence`.
  They carry their full subtree and will be re-emitted verbatim at the correct position.
- Attributes read from the root element are stored separately under `ROOT_ATTRS` symbol.
- `schema.parse()` validates; `FIELD_ORDER` is attached after to survive the rebuild.

### 2.4 `toXML` implementation sketch

```ts
/**
 * Non-enumerable Symbol storing the original root element's attributes,
 * so they survive a fromXML → toXML round-trip even if no schema field maps to them.
 */
export const ROOT_ATTRS = Symbol("xml-model.rootAttrs");

function buildToXML<S extends z.ZodObject<any>>(schema: S) {
  const shape = schema.shape;

  return function toXML(value: z.infer<S>): XMLRoot {
    const rootTagname = getRootTagname(schema);
    const children: XMLElement[] = [];
    const attrs: XMLAttributes = {
      // Restore original root attributes (unknown ones preserved verbatim)
      ...((value as any)[ROOT_ATTRS] ?? {}),
    };

    // Collect attribute-mapped fields (overwrite any stored attrs with current values)
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const attrMeta = getXMLAttrMeta(fieldSchema as z.ZodType);
      if (!attrMeta || attrMeta.ignore) continue;
      const fieldValue = (value as any)[fieldName];
      if (fieldValue !== undefined) attrs[attrMeta.name] = String(fieldValue);
    }

    // Use FIELD_ORDER sequence when available (preserves document order + unknown elements).
    // Fall back to schema field order for hand-crafted objects.
    const sequence: OrderEntry[] =
      (value as any)[FIELD_ORDER] ??
      Object.keys(shape).filter((k) => !getXMLPropMeta(shape[k] as z.ZodType).ignore);

    // Track which fields have been emitted to avoid duplicates
    // (all array elements are emitted on the first occurrence in the sequence)
    const emitted = new Set<string>();

    for (const entry of sequence) {
      if (typeof entry !== "string") {
        // Unknown XMLElement — re-emit verbatim, preserving full subtree
        children.push(entry);
        continue;
      }

      const fieldName = entry;
      if (emitted.has(fieldName)) continue;
      emitted.add(fieldName);

      const fieldSchema = shape[fieldName] as z.ZodType | undefined;
      if (!fieldSchema) continue;
      const propMeta = getXMLPropMeta(fieldSchema);
      if (propMeta.ignore) continue;

      const tagname = getPropTagname(fieldName, fieldSchema);
      const fieldValue = (value as any)[fieldName];
      const elements = convertToXML(fieldSchema, fieldValue, tagname, propMeta);
      children.push(...elements);
    }

    // Append any schema fields that weren't in the sequence
    // (new fields added after original parse — go at the end)
    for (const fieldName of Object.keys(shape)) {
      if (emitted.has(fieldName)) continue;
      const fieldSchema = shape[fieldName] as z.ZodType;
      const propMeta = getXMLPropMeta(fieldSchema);
      if (propMeta.ignore) continue;
      const attrMeta = getXMLAttrMeta(fieldSchema);
      if (attrMeta) continue; // already handled above
      const tagname = getPropTagname(fieldName, fieldSchema);
      const fieldValue = (value as any)[fieldName];
      children.push(...convertToXML(fieldSchema, fieldValue, tagname, propMeta));
    }

    const rootEl: XMLElement = { type: "element", elements: children };
    if (rootTagname) rootEl.name = rootTagname;
    if (Object.keys(attrs).length) rootEl.attributes = attrs;

    return rootTagname ? { elements: [rootEl] } : { elements: children };
  };
}
```

### 2.5 Error handling

```ts
class XMLParseError extends Error {
  name = "XMLParseError";
  constructor(public readonly cause: unknown, public readonly xml: XMLRoot | string) { ... }
}

class XMLValidationError extends Error {
  name = "XMLValidationError";
  // wraps z.ZodError with the parsed (but invalid) data for debugging
  constructor(public readonly zodError: z.ZodError, public readonly raw: unknown) { ... }
}
```

Do NOT swallow Zod validation errors — surface them as `XMLValidationError` with full Zod issue
details.

---

## Phase 3 — `xmlModel` class factory (`src/model.ts`)

Goal: bridge the codec to class instances for users who want methods/inheritance.

### 3.1 API

```ts
class Book extends xmlModel(BookSchema) {
  // BookSchema properties (title, year, chapters) are present as own properties
  // because the constructor does Object.assign(this, data)
  wordCount() {
    return this.chapters.length;
  }
}

const book = Book.fromXML("<book>...</book>");
book instanceof Book; // true
book.title; // typed
book.wordCount(); // works
```

### 3.2 Implementation

```ts
export function xmlModel<S extends z.ZodObject<any>>(schema: S) {
  type Data = z.infer<S>;

  class XmlModelBase {
    static readonly schema: S = schema;

    static fromXML(this: new (data: Data) => any, xml: string | XMLRoot) {
      const data = xmlCodec(schema).fromXML(xml);
      return new this(data);
    }

    static toXML(instance: Data): XMLRoot {
      return xmlCodec(schema).toXML(instance);
    }

    static toXMLString(instance: Data): string {
      return XML.stringify(xmlCodec(schema).toXML(instance));
    }

    constructor(data: Data) {
      Object.assign(this, data);
    }
  }

  // Cast to expose schema properties as typed instance properties
  return XmlModelBase as unknown as XmlModelBaseConstructor<S>;
}
```

Typing `XmlModelBaseConstructor<S>` is the tricky part — needs to produce a class where
instances have both `z.infer<S>` properties and the base class methods. Approach:

```ts
type XmlModelBaseConstructor<S extends z.ZodObject<any>> = {
  new(data: z.infer<S>): z.infer<S> & { constructor: typeof XmlModelBase };
  fromXML(xml: string | XMLRoot): z.infer<S> & InstanceType<...>;
  toXML(instance: z.infer<S>): XMLRoot;
  toXMLString(instance: z.infer<S>): string;
  schema: S;
};
```

### 3.3 Inheritance

When `class Dog extends xmlModel(DogSchema)` and `DogSchema` has an `animal` field that is
itself an object schema — inheritance is implicit in the schema composition, not in the prototype
chain. If class-level method inheritance is needed, it works naturally since `Dog extends Base`.

---

## Phase 4 — Lazy / recursive schemas

Support for self-referential XML (e.g. a tree node containing child nodes):

```ts
const NodeSchema: z.ZodObject<...> = z.object({
  label: xml.prop(z.string()),
  children: xml.prop(z.array(z.lazy(() => NodeSchema)), { inline: true }),
}).meta({ xml: { tagname: "node" } });
```

`xmlCodec` must detect `z.ZodLazy` and defer codec creation to avoid infinite recursion.
Use the cache: check the cache before recursing, insert a placeholder entry if needed.

---

## Phase 5 — Custom fromXML / toXML overrides

For fields that can't be handled automatically, allow codec-level overrides (not via decorators):

```ts
const schema = z
  .object({
    code: z.string(),
  })
  .meta({ xml: { tagname: "item" } });

const codec = xmlCodec(schema, {
  fields: {
    code: {
      fromXML(elements) {
        return elements[0]?.attributes?.value ?? "";
      },
      toXML(value) {
        return [{ type: "element", name: "code", attributes: { value } }];
      },
    },
  },
});
```

The overrides are passed as the second argument to `xmlCodec`, not attached to the schema, so
the schema stays pure.

---

## Phase 6 — Vite plugin cleanup (`src/vite/`)

With no RTTI transformer needed, the Vite plugin shrinks dramatically.

### Remove entirely

- `TypescriptRTTI()` — no longer needed
- `FixClassNames()` / `fixClassNames()` — no longer needed
- `fix-class-names.ts`, `fix-class-names.test.ts`

### Keep / rename

- The `xml-model/dist/*` resolver can stay but may no longer be needed if there's no RTTI.
  Remove it if no consumer reports needing it.
- `XMLModelVitePlugin` export can be removed or left as an empty no-op for compatibility.

### Peer deps cleanup in `package.json`

- Remove `@rollup/plugin-typescript`, `tslib` from peer dependencies
- Remove `typescript-rtti` from dependencies

---

## Phase 7 — Public API surface (`src/index.ts`)

```ts
// Core
export { xmlCodec } from "./codec";
export { xmlModel } from "./model";
export { xml } from "./schema-meta"; // xml.prop(), xml.model()

// XML utilities (unchanged)
export { XML } from "./xml";
export type { XMLElement, XMLRoot } from "./types";

// Errors
export { XMLParseError, XMLValidationError } from "./errors";

// Re-export zod for convenience (so consumers don't need to install separately)
export { z } from "zod/v4"; // or: export type { z } if peer dep
```

---

## Phase 8 — Tests

All existing tests become obsolete (they test the decorator API). New test suite:

### Unit tests (no build needed)

- `src/codec.test.ts` — test `xmlCodec` for each type: string, number, boolean, object,
  array (inline + non-inline), optional, union of literals, nested objects
- `src/model.test.ts` — test `xmlModel` class factory: instanceof, static methods, methods
- `src/schema-meta.test.ts` — test `xml.prop`, `xml.model`, tagname derivation

### Integration tests

- `src/integration.test.ts` — roundtrip XML → object → XML with complex nested schemas
- **Order preservation**: parse XML with fields in non-schema order, serialize back, assert
  output tag order matches input exactly
- **Unknown element passthrough**: parse XML with unknown tags, serialize back, assert unknown
  tags are present at their original positions with their full content intact
- **Multi-tag grouping**: field with `match: /^(cat|dog)$/` collects elements of both tag names
  into one array; serialization uses the field's `tagname` for each item
- No isolated build test needed (no Vite plugin to validate)

---

## Phase 9 — Documentation update

Update all VitePress docs:

- `docs/guide/getting-started.md` — new installation (drop Vite plugin step), new first example
- `docs/guide/models.md` — replace `@Model` with `xmlCodec` / `xmlModel`
- `docs/guide/properties.md` — replace `@Prop` with `xml.prop`
- `docs/vite-plugin.md` — mark as removed/deprecated or remove the page
- New page: `docs/guide/schemas.md` — guide to writing Zod schemas with XML metadata

---

## File structure after rewrite

```
src/
  index.ts          public API
  codec.ts          xmlCodec() — core fromXML/toXML engine
  schema-meta.ts    xml.prop(), xml.model(), metadata registry
  model.ts          xmlModel() class factory
  errors.ts         XMLParseError, XMLValidationError
  types.ts          XMLElement, XMLRoot (unchanged)
  xml/              XML utilities (unchanged)
  vite/             removed or minimal stub
```

---

## Decisions

### Zod as direct dependency ✓

Start as a direct dep. Moving to peer dep later is a one-line `package.json` change.

The one real risk: **dual Zod instances**. If a consumer uses a different Zod version, npm may
not deduplicate and two copies coexist. This breaks:

- The WeakMap codec cache (schemas from one copy are different objects than schemas from the other)
- Any `instanceof` checks against Zod types across the boundary

Low risk in practice given Zod v4 stable semver. Revisit when/if consumers hit it.

### Root tagname is optional

Tagname serves two distinct roles that should be separated:

- **Top-level** (`codec.fromXML(xmlString)`): tagname identifies the wrapper element to unwrap
  on parse and wraps on serialize.
- **Nested field**: the _parent_ schema provides the tagname via
  `xml.prop(ChildSchema, { tagname: "chapter" })`. The child schema doesn't need one.

**Rule:** tagname is optional on the schema.

- If present: `fromXML` unwraps the named root element; `toXML` wraps output in it.
- If absent: `fromXML` treats input as already-unwrapped content (raw list of child elements);
  `toXML` returns a fragment with no wrapper.

This naturally handles XML that has no single root, and allows the same schema to be reused
under different tag names depending on context.

When used top-level without a tagname, the caller is responsible for passing already-unwrapped
`XMLRoot`. Document this clearly.

### Attributes: `xml.attr()` as a separate helper

The element vs attribute distinction is fundamental in XML — keep it explicit in the API:

```ts
// Child element  →  <book><title>Dune</title></book>
xml.prop(z.string(), { tagname: "title" });

// XML attribute  →  <book lang="en">...</book>
xml.attr(z.string(), { name: "lang" });
```

`XMLAttrMeta` interface:

```ts
interface XMLAttrMeta {
  name: string; // attribute name (required — no kebab-case fallback for attributes)
  ignore?: boolean;
}
```

`fromXML`: reads `element.attributes[name]`.
`toXML`: calls `setAttribute(el, name, value)` on the root element.

Add `xml.attr` to Phase 1 and the type handling matrix in Phase 2.

### `z.discriminatedUnion` — defer to v2.1

First version targets flat objects + arrays. Discriminated unions add meaningful complexity
(need to match XML tag names to schema variants) and can be added incrementally.

### Streaming / partial parsing — out of scope
