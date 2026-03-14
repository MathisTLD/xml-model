# XML Utilities

The `XML` namespace object provides utility functions for working with the internal xml-js element tree. Import it from the dedicated entry point:

```ts
import XML from "xml-model/xml";
```

## XML.parse

Parses an XML string into an `XMLRoot` document tree.

```ts
const root = XML.parse("<book><title>Dune</title></book>");
// { elements: [{ type: "element", name: "book", elements: [...] }] }
```

## XML.stringify

Serialises an `XMLRoot` or `XMLElement` back into an XML string. Accepts the same options as [xml-js `js2xml`](https://www.npmjs.com/package/xml-js).

```ts
const xmlString = XML.stringify(root);
// "<book><title>Dune</title></book>"

// Pretty-print with indentation
const pretty = XML.stringify(root, { spaces: 2 });
```

## XML.getContent

Extracts the text content from an element that contains a single text node.

```ts
const el = { type: "element", name: "title", elements: [{ type: "text", text: "Dune" }] };
XML.getContent(el); // "Dune"

// Returns "" for elements with no children
XML.getContent({ type: "element", name: "empty" }); // ""
```

Throws a `TypeError` when the element has multiple children or a non-text child.

## XML.fromContent

Creates an element structure wrapping text content.

```ts
// Fragment (no tag name)
XML.fromContent("hello");
// { elements: [{ type: "text", text: "hello" }] }

// Full element
XML.fromContent("hello", "greeting");
// { type: "element", name: "greeting", elements: [{ type: "text", text: "hello" }] }

// With attributes
XML.fromContent("hello", "greeting", { lang: "en" });
// { type: "element", name: "greeting", attributes: { lang: "en" }, elements: [...] }
```

## XML.addElement

Appends a child element to a parent, initialising the `elements` array if needed.

```ts
const parent = { type: "element", name: "book" };
XML.addElement(parent, { type: "element", name: "chapter" });
// parent.elements === [{ type: "element", name: "chapter" }]
```

## XML.setAttribute

Sets an attribute on an element, initialising the `attributes` map if needed.

```ts
const el = { type: "element", name: "book" };
XML.setAttribute(el, "lang", "en");
// el.attributes === { lang: "en" }
```

## XML.deleteAttribute

Removes an attribute from an element. Does nothing when the element has no attributes.

```ts
XML.deleteAttribute(el, "lang");
// el.attributes === {}
```
