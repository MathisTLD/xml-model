# XML Model

**[📖 Documentation](https://mathistld.github.io/xml-model/)**

**[🧑‍💻 Source on GitHub](https://github.com/MathisTLD/xml-model)**

## Installation

xml-model requires [Zod v4](https://zod.dev) as a peer dependency.

```bash
npm install xml-model zod
```

<!-- #region what-is -->

## What is xml-model?

xml-model lets you define TypeScript classes that map directly to XML documents using [Zod](https://zod.dev) schemas. Annotate fields with `xml.prop()` or `xml.attr()`, then parse or serialise with a single method call.

```ts
import { z } from "zod";
import { xmlModel, xml } from "xml-model";

class Book extends xmlModel(
  z.object({
    isbn: xml.attr(z.string(), { name: "isbn" }),
    title: xml.prop(z.string()),
    year: xml.prop(z.number()),
  }),
  { tagname: "book" },
) {
  label() {
    return `${this.title} (${this.year})`;
  }
}

// XML → class instance
const book = Book.fromXML(`
  <book isbn="978-0-7432-7356-5">
    <title>Dune</title>
    <year>1965</year>
  </book>
`);

book.label(); // "Dune (1965)"
book instanceof Book; // true

// class instance → XML string
Book.toXMLString(book);
// <book isbn="978-0-7432-7356-5"><title>Dune</title><year>1965</year></book>
```

Field names are automatically converted to kebab-case XML tags (`publishedAt` → `<published-at>`). Extend classes with `.extend()` to build inheritance hierarchies — child instances remain `instanceof` the parent and inherit all methods.

<!-- #endregion what-is -->
