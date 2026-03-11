# Models

A **model** describes how a TypeScript class maps to XML. You create one with the `@Model()` decorator or the `createModel` function.

## @Model() decorator

```ts
import { Model, getModel } from "xml-model";

@Model({
  fromXML({ properties }) {
    const p = new Person();
    p.name = properties.name as string;
    return p;
  },
})
class Person {
  name: string = "";
}

const model = getModel(Person);
```

### Options

| Option    | Type                | Description                                                                   |
| --------- | ------------------- | ----------------------------------------------------------------------------- |
| `fromXML` | middleware function | Converts XML into an instance. Required for root models (no default).         |
| `toXML`   | middleware function | Converts an instance to XML. Optional — a default implementation is provided. |
| `tagname` | `string`            | Override the root XML tag name. Defaults to the class name in kebab-case.     |
| `parent`  | `XMLModel`          | Explicitly set the parent model. Usually inferred from the prototype chain.   |

:::warning fromXML is required
The default `fromXML` always throws. Every model that is not a child class of another decorated model **must** provide a `fromXML` implementation.
:::

## fromXML context

The `fromXML` middleware receives a context object:

```ts
interface fromXMLContext<T> {
  xml: XMLRoot; // the full parsed XML document
  properties: PropertiesRecord<T>; // lazily-resolved property values
  model: XMLModel<T>;
}
```

`context.properties` is a lazy getter — the property conversion pipeline runs the first time you access it.

```ts
@Model({
  fromXML({ properties }) {
    const obj = new Config();
    const props = properties; // triggers property resolution
    obj.host = props.host as string;
    obj.port = props.port as number;
    return obj;
  },
})
class Config {
  host: string = "";
  port: number = 0;
}
```

## toXML context

The `toXML` middleware receives:

```ts
interface toXMLContext<T> {
  object: T; // the instance being serialised
  properties: XMLPropertiesRecord<T>; // lazily-resolved per-property XMLRoot fragments
  model: XMLModel<T>;
}
```

The default `toXML` implementation assembles all property fragments into a root element — you only need to override it for non-standard serialisation.

## Inheritance

Child classes automatically inherit all properties and conversion logic from their parent. The parent model is detected via the prototype chain; you do not need to repeat `@Prop()` on inherited properties.

```ts
@Model({
  fromXML({ properties }) {
    const a = new Animal();
    a.name = properties.name as string;
    return a;
  },
})
class Animal {
  name: string = "";
}

@Model({
  fromXML({ properties }) {
    const d = new Dog();
    d.name = properties.name as string;
    d.breed = properties.breed as string;
    return d;
  },
})
class Dog extends Animal {
  breed: string = "";
}
```

`Dog` inherits the `name` property mapping from `Animal`. You can call `model.resolveAllProperties()` to inspect the merged property map.

## createModel

`createModel` is the programmatic equivalent of `@Model()`:

```ts
import { createModel } from "xml-model";

const model = createModel(Person, {
  fromXML({ properties }) {
    const p = new Person();
    p.name = properties.name as string;
    return p;
  },
});
```

It throws if a model for that type already exists.

## getModel

`getModel` retrieves a registered model by constructor:

```ts
import { getModel } from "xml-model";

const model = getModel(Person);
const person = model.fromXML("<person><name>Alice</name></person>");
```
