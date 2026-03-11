---
layout: home

hero:
  name: "xml-model"
  text: "XML ↔ TypeScript"
  tagline: Bidirectional XML and object conversion using decorators and runtime type information.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
---

## What is xml-model?

xml-model lets you define TypeScript classes that map directly to XML documents. Annotate your class with `@Model()` and its properties with `@Prop()`, then convert in either direction with a single method call.

```ts
import { Model, Prop } from "xml-model";

@Model({
  fromXML({ xml, properties }) {
    const obj = new Book();
    obj.title = properties.title as string;
    obj.year = properties.year as number;
    return obj;
  },
})
class Book {
  @Prop() title: string = "";
  @Prop() year: number = 0;
}

const model = getModel(Book);

// XML → object
const book = model.fromXML(`<book><title>Dune</title><year>1965</year></book>`);

// object → XML
const xml = model.toXML(book);
```

Class and property names are automatically converted to kebab-case XML tags (`BookChapter` → `book-chapter`, `publishedAt` → `published-at`). Runtime type information is provided by [typescript-rtti](https://typescript-rtti.org), so no manual type annotations are needed in most cases.
