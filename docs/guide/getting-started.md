# Getting Started

## Installation

xml-model requires [Zod v4](https://zod.dev) as a peer dependency.

```bash
npm install xml-model zod
```

No special TypeScript compiler plugins or `tsconfig.json` changes are required.

## First model

Define a class by extending the result of `xmlModel()`. Pass a Zod schema where fields are plain Zod types by default (child elements), `xml.attr()` for XML attributes, or `xml.prop()` when you need to customise a field's tagname, inline mode, or matching. Supply a `{ tagname }` option for the root element name.

<<< @/../src/xml/examples.ts#engine

```ts
// XML → instance
const engine = Engine.fromXML(`<engine type="petrol"><horsepower>150</horsepower></engine>`);
engine.type; // "petrol"
engine.horsepower; // 150
engine instanceof Engine; // true

// instance → XML string
Engine.toXMLString(engine);
// <engine type="petrol"><horsepower>150</horsepower></engine>
```

## Class methods

Any methods you define on the class are available on parsed instances:

<<< @/../src/xml/examples.ts#vehicle

```ts
const vehicle = Vehicle.fromXML(
  `<vehicle vin="V001"><make>Toyota</make><year>2020</year></vehicle>`,
);
vehicle.label(); // "2020 Toyota"
```

## Next steps

- [Models](/guide/models) — class extension, nested models, `dataSchema`, `schema()`
- [Properties](/guide/properties) — `xml.prop()`, `xml.attr()`, arrays, optional fields
