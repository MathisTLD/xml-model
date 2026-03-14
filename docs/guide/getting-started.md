# Getting Started

## Installation

```bash
npm install xml-model
```

No special TypeScript compiler plugins or `tsconfig.json` changes are required. xml-model is powered entirely by [Zod](https://zod.dev) schemas at runtime.

## First model

Define a class by extending the result of `xmlModel()`. Pass a Zod schema with fields annotated using `xml.prop()` (child elements) and `xml.attr()` (XML attributes), and a `{ tagname }` option for the root element name.

<<< @/../src/examples.ts#engine

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

<<< @/../src/examples.ts#vehicle

```ts
const vehicle = Vehicle.fromXML(
  `<vehicle vin="V001"><make>Toyota</make><year>2020</year></vehicle>`,
);
vehicle.label(); // "2020 Toyota"
```

## Next steps

- [Models](/guide/models) — class extension, nested models, `dataSchema`, `schema()`
- [Properties](/guide/properties) — `xml.prop()`, `xml.attr()`, arrays, optional fields
