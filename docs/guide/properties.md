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

| Option    | Type                                  | Description                                                                                            |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `tagname` | `string`                              | Override the element tag name.                                                                         |
| `inline`  | `boolean`                             | For arrays: place items as direct siblings instead of inside a wrapper element. See [Arrays](#arrays). |
| `ignore`  | `boolean`                             | Exclude this field from XML conversion entirely.                                                       |
| `match`   | `string \| RegExp \| (el) => boolean` | Custom predicate for matching source elements during parsing.                                          |

## XML attributes — `xml.attr()`

`xml.attr(schema, { name })` marks a field as an XML attribute on the root element.

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

## Low-level `.meta()` API

`xml.prop()` and `xml.attr()` are convenience helpers that call Zod v4's `.meta()` under the hood. You can use `.meta()` directly for fine-grained control:

```ts
z.object({
  id: z.string().meta({ xml: { attr: "id" } }), // equivalent to xml.attr(z.string(), { name: "id" })
  name: z.string().meta({ xml: {} }), // same as bare z.string() — no-op annotation
  hidden: z.string().meta({ xml: { ignore: true } }), // equivalent to xml.prop(z.string(), { ignore: true })
});
```

The `xml` key inside `.meta()` accepts the full `XMLFieldMeta` interface:

```ts
interface XMLFieldMeta {
  attr?: string; // if present → XML attribute with this name; absent → child element
  tagname?: string; // override element tag name
  inline?: boolean; // inline array items
  ignore?: boolean; // exclude from XML
  match?: string | RegExp | ((el: XMLElement) => boolean); // custom element matcher
}
```
