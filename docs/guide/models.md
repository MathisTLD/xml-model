# Models

A **model** is a class produced by `xmlModel()`. It carries a Zod schema that drives both parsing and serialisation, and exposes static helpers for converting to and from XML.

## Creating a model

Pass a Zod schema annotated with `xml.prop()` / `xml.attr()` and an optional `{ tagname }` for the root element:

```ts
import { z } from "zod";
import { xmlModel, xml } from "xml-model";

class Article extends xmlModel(
  z.object({
    slug: xml.attr(z.string(), { name: "slug" }),
    title: xml.prop(z.string()),
  }),
  { tagname: "article" },
) {}
```

When `tagname` is omitted the class name is converted to kebab-case automatically (`ArticleSection` → `<article-section>`).

## Static API

| Method / property                         | Description                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MyClass.fromXML(xml)`                    | Parses an XML string or `XMLRoot` and returns a `MyClass` instance.                                            |
| `MyClass.toXML(instance)`                 | Converts an instance to an `XMLRoot` document tree.                                                            |
| `MyClass.toXMLString(instance, options?)` | Converts an instance to an XML string.                                                                         |
| `MyClass.dataSchema`                      | The raw `ZodObject` schema. Use for codec internals, `z.array()`, or `.extend()`.                              |
| `MyClass.schema()`                        | Returns a `ZodPipe` that transforms parsed data into a class instance. Use inside `xml.prop()` or `z.array()`. |

## Class extension via `.extend()`

`.extend()` creates a **true subclass** — child instances are `instanceof` the parent and inherit all its methods.

<<< @/../src/examples.ts#vehicle

<<< @/../src/examples.ts#car

```ts
const car = Car.fromXML(`
  <car vin="V001">
    <make>Toyota</make><year>2020</year><doors>4</doors>
    <engine type="petrol"><horsepower>150</horsepower></engine>
  </car>
`);

car.doors; // 4         — Car field
car.label(); // "2020 Toyota" — Vehicle method, inherited
car instanceof Car; // true
car instanceof Vehicle; // true
```

### Chained extension

`.extend()` chains across multiple levels:

<<< @/../src/examples.ts#sport-car

```ts
const sc = SportCar.fromXML(`...`);
sc instanceof SportCar; // true
sc instanceof Car; // true
sc instanceof Vehicle; // true
```

### Inline extend (no explicit class)

You can use `.extend()` inline without naming the intermediate class:

```ts
class Truck extends Vehicle.extend({ payload: xml.prop(z.number()) }, { tagname: "truck" }) {}
```

## Fresh class pattern

When you want a standalone class that reuses a schema shape **without** a prototype link to the parent, pass an extended schema to `xmlModel()` directly:

<<< @/../src/examples.ts#car-no-proto

```ts
const car = CarStandalone.fromXML(`...`);
car instanceof Vehicle; // false — no shared prototype
// car.label is undefined — Vehicle methods not available
```

Use this when the class hierarchy doesn't matter and you just want to share field definitions.

## Direct JS class inheritance

Extend a model class with a regular `class … extends` to add methods without changing the schema:

```ts
class ElectricCar extends Car {
  isElectric() {
    return this.engine.type === "electric";
  }
}

const car = ElectricCar.fromXML(`...`);
car instanceof ElectricCar; // true
car instanceof Car; // true
car.isElectric(); // true
car.label(); // "2021 Honda" — inherited from Vehicle
```

## Two-step pattern (`xml.model` + `xmlModel`)

Annotate a schema separately with `xml.model()` and then pass it to `xmlModel()`. Useful when you want to share the schema across multiple contexts:

```ts
import { xml, xmlModel } from "xml-model";
import { z } from "zod";

const VehicleSchema = xml.model(z.object({ make: xml.prop(z.string()) }), { tagname: "vehicle" });

class SimpleVehicle extends xmlModel(VehicleSchema) {}
SimpleVehicle.dataSchema === VehicleSchema; // true
```

## `dataSchema` and `schema()`

`dataSchema` is the raw `ZodObject`. Use it to extend schemas or pass to `xmlCodec()`:

```ts
// Extend the schema without inheriting the prototype chain
const ExtendedSchema = Vehicle.dataSchema.extend({
  payload: xml.prop(z.number()),
});
```

`schema()` returns a `ZodPipe` that transforms parsed data into a class instance. Use it inside `z.array()` or `xml.prop()` when embedding a model as a field of another model:

```ts
cars: xml.prop(z.array(Car.schema()), { inline: true }),
```

See [Properties — Arrays](/guide/properties#arrays) for full examples.
