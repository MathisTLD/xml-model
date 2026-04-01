# Properties

Fields in a model schema are plain Zod types by default (child elements), `xml.attr()` for XML attributes, or `xml.prop()` when you need to customise a child element. All helpers attach XML metadata to the Zod schema via Zod v4's `.meta()` API.

## Child elements

Every field that is not annotated with `xml.attr()` is encoded as a child element. The field name is converted to kebab-case for the tag name by default — no annotation required.

```ts
z.object({
  title: z.string(), // <title>…</title>
  publishedAt: z.number(), // <published-at>…</published-at>
});
```

Use `xml.prop(schema, options)` only when you need to customise the element — see options below.

### `xml.prop()` options

| Option    | Type                                  | Description                                                                                                             |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `tagname` | `string`                              | Override the element tag name.                                                                                          |
| `inline`  | `boolean`                             | For arrays: place items as direct siblings instead of inside a wrapper element. See [Arrays](#arrays).                  |
| `match`   | `string \| RegExp \| (el) => boolean` | Custom predicate for matching source elements during parsing.                                                           |
| `decode`  | `(ctx, next) => void`                 | Custom decoding hook. Call `next()` to run the default decode logic. See [Custom decode/encode](#custom-decode-encode). |
| `encode`  | `(ctx, next) => void`                 | Custom encoding hook. Call `next()` to run the default encode logic. See [Custom decode/encode](#custom-decode-encode). |

When you call `xml.prop(options)` with no schema argument, it returns a Zod `GlobalMeta` object. This lets you attach the annotation with Zod's own `.meta()` — both forms are equivalent:

```ts
// these two are identical
xml.prop(z.string(), { tagname: "pub-date" });
z.string().meta(xml.prop({ tagname: "pub-date" }));
```

The same applies to `xml.attr()` and `xml.root()`.

## XML attributes — `xml.attr()`

`xml.attr(schema, options?)` marks a field as an XML attribute on the root element.

The attribute name defaults to the field key in kebab-case — the same conversion applied to child element tag names. Pass `{ name }` only when the desired attribute name differs from that default.

```ts
z.object({
  vin: xml.attr(z.string()), // attribute "vin"   (field key already kebab-case)
  vehicleId: xml.attr(z.string()), // attribute "vehicle-id"  (auto kebab-case)
  id: xml.attr(z.string(), { name: "ID" }), // attribute "ID"   (custom name required)
});
```

<<< @/../src/xml/examples.ts#vehicle

```xml
<vehicle vin="V001"><make>Toyota</make><year>2020</year></vehicle>
```

`vin` is an attribute; `make` and `year` are child elements.

## Nested models

Pass an xmlModel class directly to `xml.prop()` to embed it as a child element. The codec parses it into a class instance automatically.

<<< @/../src/xml/examples.ts#engine

<<< @/../src/xml/examples.ts#car

```ts
const car = Car.fromXML(`
  <car vin="V001">
    <make>Toyota</make><year>2020</year><doors>4</doors>
    <engine type="petrol"><horsepower>150</horsepower></engine>
  </car>
`);

car.engine instanceof Engine; // true
car.engine.horsepower; // 150
```

When using a class as a field value inside `z.array()`, use `MyClass.schema()` instead — it returns a `ZodPipe` that also instantiates the class:

```ts
cars: xml.prop(z.array(Car.schema()), { inline: true }),
```

## Optional fields

Wrap the schema in `z.optional()` to make a field optional. When the element is absent from the XML the field is `undefined`; `toXMLString` omits it entirely.

<<< @/../src/xml/examples.ts#motorcycle

```ts
const moto = Motorcycle.fromXML(
  `<motorcycle vin="V003"><make>Kawasaki</make><year>2019</year></motorcycle>`,
);
moto.sidecar; // undefined

const motoWithSidecar = Motorcycle.fromXML(`
  <motorcycle vin="V005"><make>Ural</make><year>2018</year><sidecar>true</sidecar></motorcycle>
`);
motoWithSidecar.sidecar; // true
```

## Arrays

### Inline arrays (`inline: true`)

Each item is a **direct child** of the root element. Items of different types can be interleaved freely in document order.

<<< @/../src/xml/examples.ts#fleet

```xml
<fleet name="Acme Fleet">
  <car vin="V001">…</car>
  <car vin="V002">…</car>
  <motorcycle vin="V003">…</motorcycle>
</fleet>
```

Each `<car>` and `<motorcycle>` is a direct child of `<fleet>`. The codec matches them by their root tag name.

### Non-inline arrays (default)

Items are nested inside a **single wrapper element** whose tag name comes from the field name (kebab-cased).

<<< @/../src/xml/examples.ts#showroom

```xml
<showroom name="Acme Dealers">
  <models>
    <model>Corolla</model>
    <model>Civic</model>
    <model>Mustang</model>
  </models>
</showroom>
```

All `<model>` items live inside the `<models>` container. The tag name of individual items is not significant during parsing.

### When to use each

|                | Inline (`inline: true`)         | Non-inline (default)                    |
| -------------- | ------------------------------- | --------------------------------------- |
| Item placement | Direct children of root element | Nested inside a wrapper element         |
| Multiple types | Yes — mix freely by tag name    | No — single homogeneous list            |
| Typical use    | Heterogeneous sibling elements  | Homogeneous list with a named container |

## Discriminated unions

Use `z.discriminatedUnion` when a field (or inline array) can hold one of several model variants, each identified by a shared discriminator attribute or element.

<<< @/../src/xml/examples.ts#discriminated-engines

```ts
const petrol = AnyEngine.decode({ type: "petrol", horsepower: 150 });
petrol instanceof PetrolEngine; // true

const hybrid = AnyEngine.decode({ type: "hybrid", horsepower: 100 });
hybrid instanceof UnknownEngine; // true — fallback variant
```

The outer `z.union` wraps the discriminated union with a fallback variant (`UnknownEngine`) that catches any unrecognised type value. Omit the outer union if all variants are known and unknown values should be an error.

`z.discriminatedUnion` dispatches in O(1) by reading the discriminator attribute before decoding the full element, so it is more efficient than a plain `z.union` when the variant count is large.

### When to use each

|                        | `z.discriminatedUnion`                              | `z.union`                          |
| ---------------------- | --------------------------------------------------- | ---------------------------------- |
| Dispatch               | O(1) — reads discriminator first                    | O(n) — tries each variant in order |
| Requires shared key    | Yes — all variants must share a discriminator field | No                                 |
| Unknown-value fallback | Wrap in an outer `z.union`                          | Add a catch-all variant last       |

## Type transforms — `z.codec`

Use `z.codec(inputSchema, outputSchema, { decode, encode })` when a field should be stored as one type in XML but exposed as a different type in your model.

A common use-case is ISO 8601 dates: the XML element contains a plain string, but the parsed instance holds a native `Date`.

<<< @/../src/xml/examples.ts#event

```ts
const event = Event.fromXML(`
  <event>
    <title>Launch</title>
    <published-at>2024-01-15T00:00:00.000Z</published-at>
  </event>
`);

event.publishedAt; // Date instance — 2024-01-15T00:00:00.000Z
Event.toXMLString(event);
// <event><title>Launch</title><published-at>2024-01-15T00:00:00.000Z</published-at></event>
```

`decode` receives the raw XML-decoded value (a `string` here) and returns the transformed value. `encode` receives the transformed value and returns the raw form that goes back into XML. The two are inverses of each other.

> **Note:** `z.codec` transforms are applied by Zod's parse pipeline inside `fromXML`/`toXMLString` — you do not need to call `schema.parse()` yourself. See [Parsing pipeline](/guide/models#parsing-pipeline) for details.

## Custom decode/encode

`xml.prop()` and `xml.root()` accept `decode` and `encode` hooks that let you intercept and augment the default codec behavior without replacing it entirely.

### Property-level (`xml.prop`)

**`decode`** is a void side-effect — mutate `ctx.result` directly:

```ts
xml.prop(z.string(), {
  decode(ctx, next) {
    next(); // assigns the default-decoded value to ctx.result[fieldName]
    (ctx.result as any).title = (ctx.result as any).title?.toUpperCase();
  },
});
```

`ctx` for `decode` is a `PropertyDecodingContext` with:

- `ctx.result` — the partially-built parent object (mutate to add/override fields)
- `ctx.property` — metadata about the field (name, tagname, options, source XML element)
- `ctx.xml` — the source XML element for the parent

**`encode`** is a void side-effect — mutate `ctx.result` directly:

```ts
xml.prop(z.string(), {
  encode(ctx, next) {
    next(); // pushes the default-encoded element to ctx.result.elements
    ctx.result.attributes["data-custom"] = "1";
  },
});
```

`ctx` for `encode` is a `PropertyEncodingContext` with:

- `ctx.result` — the partially-built parent `XMLElement` (mutate `ctx.result.elements` or `ctx.result.attributes`)
- `ctx.property` — metadata about the field (name, tagname, options, value)

### Root-level (`xml.root`)

Root-level hooks **return** the decoded/encoded value, so `next()` is a factory:

```ts
xml.root(MySchema, {
  decode(ctx, next) {
    const obj = next(); // returns the default-decoded object
    return { ...obj, _source: "xml" };
  },
  encode(ctx, next) {
    const el = next(); // returns the default-encoded XMLElement
    el.attributes ??= {};
    el.attributes["version"] = "1";
    return el;
  },
});
```

### Ordering with optional/default wrappers

When you combine `xml.prop(...).optional()` (or `.default(...)`), the wrapper applies **before** your custom hooks:

- `ZodOptional`: the absent-element null check runs first; if the element is absent the field is set to `undefined` without calling your hooks.
- `ZodDefault`: the default value is applied first; your hooks only run when the element is present.

This means `next()` inside a `decode` hook always receives a fully resolved value, never `undefined`.

```ts
// safe: next() is only called when <slug> is present
slug: xml.prop(z.string(), {
  decode(ctx, next) {
    next();
    (ctx.result as any).slug = (ctx.result as any).slug?.toLowerCase();
  },
}).optional(),
```
