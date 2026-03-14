import { describe, it, expect } from "vitest";
import { z } from "zod";
import { xmlCodec } from "./codec";
import { xml } from "./schema-meta";
import { xmlModel } from "./model";
import XML from "./xml";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function roundtrip<S extends z.ZodObject<any>>(schema: S, xmlStr: string) {
  const codec = xmlCodec(schema);
  const parsed = codec.fromXML(xmlStr);
  return codec.toXMLString(parsed);
}

// -----------------------------------------------------------------------
// Primitive types
// -----------------------------------------------------------------------

describe("primitives", () => {
  const Schema = xml.model(
    z.object({
      title: xml.prop(z.string()),
      count: xml.prop(z.number()),
      active: xml.prop(z.boolean()),
    }),
    { tagname: "item" },
  );

  it("parses string field", () => {
    const result = xmlCodec(Schema).fromXML(
      "<item><title>Hello</title><count>1</count><active>true</active></item>",
    );
    expect(result.title).toBe("Hello");
  });

  it("parses number field", () => {
    const result = xmlCodec(Schema).fromXML(
      "<item><title>x</title><count>42</count><active>true</active></item>",
    );
    expect(result.count).toBe(42);
  });

  it("parses boolean field", () => {
    const trueResult = xmlCodec(Schema).fromXML(
      "<item><title>x</title><count>1</count><active>true</active></item>",
    );
    expect(trueResult.active).toBe(true);
    const falseResult = xmlCodec(Schema).fromXML(
      "<item><title>x</title><count>1</count><active>false</active></item>",
    );
    expect(falseResult.active).toBe(false);
  });

  it("roundtrips all primitives", () => {
    const xmlStr = "<item><title>Hello</title><count>42</count><active>true</active></item>";
    const out = roundtrip(Schema, xmlStr);
    const reparsed = xmlCodec(Schema).fromXML(out);
    expect(reparsed.title).toBe("Hello");
    expect(reparsed.count).toBe(42);
    expect(reparsed.active).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Optional fields
// -----------------------------------------------------------------------

describe("optional fields", () => {
  const Schema = xml.model(
    z.object({
      required: xml.prop(z.string()),
      optional: xml.prop(z.optional(z.string())),
    }),
    { tagname: "doc" },
  );

  it("parses when optional field is present", () => {
    const result = xmlCodec(Schema).fromXML(
      "<doc><required>a</required><optional>b</optional></doc>",
    );
    expect(result.required).toBe("a");
    expect(result.optional).toBe("b");
  });

  it("parses when optional field is absent", () => {
    const result = xmlCodec(Schema).fromXML("<doc><required>a</required></doc>");
    expect(result.required).toBe("a");
    expect(result.optional).toBeUndefined();
  });

  it("toXML omits undefined optional field", () => {
    const codec = xmlCodec(Schema);
    const value = codec.fromXML("<doc><required>a</required></doc>");
    const out = codec.toXMLString(value);
    expect(out).not.toContain("optional");
  });
});

// -----------------------------------------------------------------------
// Nested objects
// -----------------------------------------------------------------------

describe("nested objects", () => {
  const AddressSchema = xml.model(
    z.object({
      street: xml.prop(z.string()),
      city: xml.prop(z.string()),
    }),
    { tagname: "address" },
  );

  const PersonSchema = xml.model(
    z.object({
      name: xml.prop(z.string()),
      address: xml.prop(AddressSchema),
    }),
    { tagname: "person" },
  );

  it("parses nested object", () => {
    const result = xmlCodec(PersonSchema).fromXML(
      "<person><name>Alice</name><address><street>Main St</street><city>Springfield</city></address></person>",
    );
    expect(result.name).toBe("Alice");
    expect(result.address.street).toBe("Main St");
    expect(result.address.city).toBe("Springfield");
  });

  it("roundtrips nested object", () => {
    const xmlStr =
      "<person><name>Alice</name><address><street>Main St</street><city>Springfield</city></address></person>";
    const out = roundtrip(PersonSchema, xmlStr);
    const reparsed = xmlCodec(PersonSchema).fromXML(out);
    expect(reparsed.address.street).toBe("Main St");
    expect(reparsed.address.city).toBe("Springfield");
  });
});

// -----------------------------------------------------------------------
// Arrays (non-inline)
// -----------------------------------------------------------------------

describe("arrays (non-inline)", () => {
  const Schema = xml.model(
    z.object({
      items: xml.prop(z.array(z.string())),
    }),
    { tagname: "list" },
  );

  it("parses array", () => {
    const result = xmlCodec(Schema).fromXML(
      "<list><items><item>a</item><item>b</item></items></list>",
    );
    expect(result.items).toEqual(["a", "b"]);
  });

  it("roundtrips array", () => {
    const xmlStr = "<list><items><item>a</item><item>b</item></items></list>";
    const out = roundtrip(Schema, xmlStr);
    expect(xmlCodec(Schema).fromXML(out).items).toEqual(["a", "b"]);
  });
});

// -----------------------------------------------------------------------
// Arrays (inline)
// -----------------------------------------------------------------------

describe("arrays (inline)", () => {
  const Schema = xml.model(
    z.object({
      chapters: xml.prop(z.array(z.string()), { inline: true, tagname: "chapter" }),
    }),
    { tagname: "book" },
  );

  it("parses inline array", () => {
    const result = xmlCodec(Schema).fromXML(
      "<book><chapter>One</chapter><chapter>Two</chapter><chapter>Three</chapter></book>",
    );
    expect(result.chapters).toEqual(["One", "Two", "Three"]);
  });

  it("roundtrips inline array", () => {
    const xmlStr =
      "<book><chapter>One</chapter><chapter>Two</chapter><chapter>Three</chapter></book>";
    const out = roundtrip(Schema, xmlStr);
    const reparsed = xmlCodec(Schema).fromXML(out);
    expect(reparsed.chapters).toEqual(["One", "Two", "Three"]);
  });
});

// -----------------------------------------------------------------------
// Order preservation
// -----------------------------------------------------------------------

describe("order preservation", () => {
  const Schema = xml.model(
    z.object({
      // schema order: a, b, c
      a: xml.prop(z.string()),
      b: xml.prop(z.string()),
      c: xml.prop(z.string()),
    }),
    { tagname: "root" },
  );

  it("preserves document order (c, a, b) not schema order (a, b, c)", () => {
    const xmlStr = "<root><c>C</c><a>A</a><b>B</b></root>";
    const codec = xmlCodec(Schema);
    const parsed = codec.fromXML(xmlStr);
    const out = codec.toXMLString(parsed);
    // Verify c appears before a, and a before b in output
    const cPos = out.indexOf("<c>");
    const aPos = out.indexOf("<a>");
    const bPos = out.indexOf("<b>");
    expect(cPos).toBeLessThan(aPos);
    expect(aPos).toBeLessThan(bPos);
  });
});

// -----------------------------------------------------------------------
// Unknown element passthrough
// -----------------------------------------------------------------------

describe("unknown element passthrough", () => {
  const Schema = xml.model(
    z.object({
      title: xml.prop(z.string()),
      body: xml.prop(z.string()),
    }),
    { tagname: "doc" },
  );

  it("preserves unknown elements at correct position", () => {
    const xmlStr =
      '<doc><title>T</title><unknown-tag foo="bar">content</unknown-tag><body>B</body></doc>';
    const codec = xmlCodec(Schema);
    const parsed = codec.fromXML(xmlStr);
    const out = codec.toXMLString(parsed);
    // unknown-tag should be present and between title and body
    expect(out).toContain("unknown-tag");
    const titlePos = out.indexOf("<title>");
    const unknownPos = out.indexOf("<unknown-tag");
    const bodyPos = out.indexOf("<body>");
    expect(titlePos).toBeLessThan(unknownPos);
    expect(unknownPos).toBeLessThan(bodyPos);
  });
});

// -----------------------------------------------------------------------
// XML attributes
// -----------------------------------------------------------------------

describe("xml.attr attributes", () => {
  const Schema = xml.model(
    z.object({
      lang: xml.attr(z.string(), { name: "lang" }),
      title: xml.prop(z.string()),
    }),
    { tagname: "book" },
  );

  it("reads attribute from root element", () => {
    const result = xmlCodec(Schema).fromXML('<book lang="en"><title>Dune</title></book>');
    expect(result.lang).toBe("en");
    expect(result.title).toBe("Dune");
  });

  it("writes attribute to root element", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.fromXML('<book lang="en"><title>Dune</title></book>');
    const out = codec.toXMLString(parsed);
    expect(out).toContain('lang="en"');
    expect(out).toContain("<title>Dune</title>");
  });

  it("roundtrips attribute", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.fromXML('<book lang="fr"><title>Le Monde</title></book>');
    expect(parsed.lang).toBe("fr");
    const out = codec.toXMLString(parsed);
    expect(out).toContain('lang="fr"');
  });
});

// -----------------------------------------------------------------------
// xml.model tagname override
// -----------------------------------------------------------------------

describe("xml.model tagname override", () => {
  const Schema = xml.model(
    z.object({
      title: xml.prop(z.string()),
    }),
    { tagname: "my-book" },
  );

  it("parses with custom tagname", () => {
    const result = xmlCodec(Schema).fromXML("<my-book><title>T</title></my-book>");
    expect(result.title).toBe("T");
  });

  it("serializes with custom tagname", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.fromXML("<my-book><title>T</title></my-book>");
    expect(codec.toXMLString(parsed)).toContain("<my-book>");
  });
});

// -----------------------------------------------------------------------
// Multi-tag grouping via match
// -----------------------------------------------------------------------

describe("multi-tag grouping via match", () => {
  const Schema = xml.model(
    z.object({
      animals: xml.prop(z.array(z.string()), {
        inline: true,
        tagname: "animal",
        match: /^(cat|dog)$/,
      }),
    }),
    { tagname: "zoo" },
  );

  it("collects elements matching regex into one array", () => {
    const result = xmlCodec(Schema).fromXML(
      "<zoo><cat>Felix</cat><dog>Rex</dog><cat>Whiskers</cat></zoo>",
    );
    expect(result.animals).toEqual(["Felix", "Rex", "Whiskers"]);
  });

  it("serializes using the field tagname", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.fromXML("<zoo><cat>Felix</cat><dog>Rex</dog></zoo>");
    const out = codec.toXMLString(parsed);
    // Should use the tagname "animal" for serialization
    expect(out).toContain("<animal>");
  });
});

// -----------------------------------------------------------------------
// Schema without root tagname (no wrapper)
// -----------------------------------------------------------------------

describe("schema without root tagname", () => {
  const Schema = z.object({
    name: xml.prop(z.string()),
  });

  it("parses from root elements directly", () => {
    const root = XML.parse("<name>Alice</name>");
    const result = xmlCodec(Schema).fromXML(root);
    expect(result.name).toBe("Alice");
  });
});

// -----------------------------------------------------------------------
// Codec caching
// -----------------------------------------------------------------------

describe("codec caching", () => {
  it("returns the same codec instance for the same schema", () => {
    const Schema = xml.model(z.object({ x: xml.prop(z.string()) }), { tagname: "t" });
    const c1 = xmlCodec(Schema);
    const c2 = xmlCodec(Schema);
    expect(c1).toBe(c2);
  });
});

// -----------------------------------------------------------------------
// toXMLString options
// -----------------------------------------------------------------------

describe("toXMLString options", () => {
  const Schema = xml.model(
    z.object({
      title: xml.prop(z.string()),
      body: xml.prop(z.string()),
    }),
    { tagname: "doc" },
  );

  it("produces compact output by default", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.fromXML("<doc><title>T</title><body>B</body></doc>");
    const out = codec.toXMLString(parsed);
    expect(out).not.toContain("\n");
  });

  it("indents output when spaces option is provided", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.fromXML("<doc><title>T</title><body>B</body></doc>");
    const out = codec.toXMLString(parsed, { spaces: 2 });
    expect(out).toContain("\n");
    expect(out).toContain("  <title>");
  });

  it("toXMLString on xmlModel class accepts options", () => {
    const DocSchema = xml.model(z.object({ title: xml.prop(z.string()) }), { tagname: "doc" });
    class Doc extends xmlModel(DocSchema) {}
    const doc = Doc.fromXML("<doc><title>Hello</title></doc>");
    const out = Doc.toXMLString(doc, { spaces: 4 });
    expect(out).toContain("\n");
    expect(out).toContain("    <title>");
  });
});
