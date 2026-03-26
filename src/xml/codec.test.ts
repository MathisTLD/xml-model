import { describe, it, expect } from "vite-plus/test";
import { z } from "zod";
import { xmlCodec, xmlStateSchema, XML_STATE_KEY, XMLCodecError } from "./codec";
import { xml } from "./schema-meta";
import { xmlModel, XMLBase, XMLBaseWithSource } from "./model";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function roundtrip<S extends z.ZodObject<any>>(schema: S, xmlStr: string) {
  const codec = xmlCodec(schema);
  const parsed = codec.decode(xmlStr);
  return codec.encode(parsed);
}

// -----------------------------------------------------------------------
// Primitive types
// -----------------------------------------------------------------------

describe("primitives", () => {
  const Schema = xml.root(
    z.object({
      title: z.string(),
      count: z.number(),
      active: z.boolean(),
    }),
    { tagname: "item" },
  );

  it("parses string field", () => {
    const result = xmlCodec(Schema).decode(
      "<item><title>Hello</title><count>1</count><active>true</active></item>",
    );
    expect(result.title).toBe("Hello");
  });

  it("parses number field", () => {
    const result = xmlCodec(Schema).decode(
      "<item><title>x</title><count>42</count><active>true</active></item>",
    );
    expect(result.count).toBe(42);
  });

  it("parses boolean field", () => {
    const trueResult = xmlCodec(Schema).decode(
      "<item><title>x</title><count>1</count><active>true</active></item>",
    );
    expect(trueResult.active).toBe(true);
    const falseResult = xmlCodec(Schema).decode(
      "<item><title>x</title><count>1</count><active>false</active></item>",
    );
    expect(falseResult.active).toBe(false);
  });

  it("roundtrips all primitives", () => {
    const xmlStr = "<item><title>Hello</title><count>42</count><active>true</active></item>";
    const out = roundtrip(Schema, xmlStr);
    const reparsed = xmlCodec(Schema).decode(out);
    expect(reparsed.title).toBe("Hello");
    expect(reparsed.count).toBe(42);
    expect(reparsed.active).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Optional fields
// -----------------------------------------------------------------------

describe("optional fields", () => {
  const Schema = xml.root(
    z.object({
      required: z.string(),
      optional: z.string().optional(),
    }),
    { tagname: "doc" },
  );

  it("parses when optional field is present", () => {
    const result = xmlCodec(Schema).decode(
      "<doc><required>a</required><optional>b</optional></doc>",
    );
    expect(result.required).toBe("a");
    expect(result.optional).toBe("b");
  });

  it("parses when optional field is absent", () => {
    const result = xmlCodec(Schema).decode("<doc><required>a</required></doc>");
    expect(result.required).toBe("a");
    expect(result.optional).toBeUndefined();
  });

  it("toXML omits undefined optional field", () => {
    const codec = xmlCodec(Schema);
    const value = codec.decode("<doc><required>a</required></doc>");
    const out = codec.encode(value);
    expect(out).not.toContain("optional");
  });
});

// -----------------------------------------------------------------------
// Nested objects
// -----------------------------------------------------------------------

describe("nested objects", () => {
  const AddressSchema = xml.root(
    z.object({
      street: z.string(),
      city: z.string(),
    }),
    { tagname: "address" },
  );

  const PersonSchema = xml.root(
    z.object({
      name: z.string(),
      address: AddressSchema,
    }),
    { tagname: "person" },
  );

  it("parses nested object", () => {
    const result = xmlCodec(PersonSchema).decode(
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
    const reparsed = xmlCodec(PersonSchema).decode(out);
    expect(reparsed.address.street).toBe("Main St");
    expect(reparsed.address.city).toBe("Springfield");
  });
});

// -----------------------------------------------------------------------
// Arrays (non-inline)
// -----------------------------------------------------------------------

describe("arrays (non-inline)", () => {
  const Schema = xml.root(
    z.object({
      items: z.array(z.string().meta(xml.root({ tagname: "item" }))),
    }),
    { tagname: "list" },
  );

  it("parses array", () => {
    const result = xmlCodec(Schema).decode(
      "<list><items><item>a</item><item>b</item></items></list>",
    );
    expect(result.items).toEqual(["a", "b"]);
  });

  it("roundtrips array", () => {
    const xmlStr = "<list><items><item>a</item><item>b</item></items></list>";
    const out = roundtrip(Schema, xmlStr);
    expect(xmlCodec(Schema).decode(out).items).toEqual(["a", "b"]);
  });
});

// -----------------------------------------------------------------------
// Arrays (inline)
// -----------------------------------------------------------------------

describe("arrays (inline)", () => {
  const Schema = xml.root(
    z.object({
      chapters: xml.prop(z.array(z.string()), { inline: true, tagname: "chapter" }),
    }),
    { tagname: "book" },
  );

  it("parses inline array", () => {
    const result = xmlCodec(Schema).decode(
      "<book><chapter>One</chapter><chapter>Two</chapter><chapter>Three</chapter></book>",
    );
    expect(result.chapters).toEqual(["One", "Two", "Three"]);
  });

  it("encodes inline array using property tagname", () => {
    const out = xmlCodec(Schema).encode({ chapters: ["One", "Two", "Three"] });
    expect(out).toBe(
      "<book><chapter>One</chapter><chapter>Two</chapter><chapter>Three</chapter></book>",
    );
  });

  it("roundtrips inline array", () => {
    const xmlStr =
      "<book><chapter>One</chapter><chapter>Two</chapter><chapter>Three</chapter></book>";
    const out = roundtrip(Schema, xmlStr);
    const reparsed = xmlCodec(Schema).decode(out);
    expect(reparsed.chapters).toEqual(["One", "Two", "Three"]);
  });

  it("overrides element root tagname with inline array property tagname", () => {
    const SchemaWithRoot = xml.root(
      z.object({
        chapters: xml.prop(z.array(xml.root(z.string(), { tagname: "section" })), {
          inline: true,
          tagname: "chapter",
        }),
      }),
      { tagname: "book" },
    );
    const out = xmlCodec(SchemaWithRoot).encode({ chapters: ["One", "Two"] });
    expect(out).toBe("<book><chapter>One</chapter><chapter>Two</chapter></book>");
  });
});

// -----------------------------------------------------------------------
// Order preservation
// -----------------------------------------------------------------------

describe("order preservation", () => {
  class Root extends xmlModel(
    z.object({
      [XML_STATE_KEY]: xmlStateSchema(),
      // schema order: a, b, c
      a: z.string(),
      b: z.string(),
      c: z.string(),
    }),
    { tagname: "root" },
  ) {}

  it("preserves document order (c, a, b) not schema order (a, b, c)", () => {
    const xmlStr = "<root><c>C</c><a>A</a><b>B</b></root>";
    const instance = Root.fromXML(xmlStr);
    const out = Root.toXMLString(instance);
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
  class Doc extends xmlModel(
    z.object({
      [XML_STATE_KEY]: xmlStateSchema(),
      title: z.string(),
      body: z.string(),
    }),
    { tagname: "doc" },
  ) {}

  it("preserves unknown elements at correct position", () => {
    const xmlStr =
      '<doc><title>T</title><unknown-tag foo="bar">content</unknown-tag><body>B</body></doc>';
    const instance = Doc.fromXML(xmlStr);
    const out = Doc.toXMLString(instance);
    // unknown-tag should be present and between title and body
    expect(out).toEqual(xmlStr);
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
  const Schema = xml.root(
    z.object({
      lang: xml.attr(z.string(), { name: "lang" }),
      title: z.string(),
    }),
    { tagname: "book" },
  );

  it("reads attribute from root element", () => {
    const result = xmlCodec(Schema).decode('<book lang="en"><title>Dune</title></book>');
    expect(result.lang).toBe("en");
    expect(result.title).toBe("Dune");
  });

  it("writes attribute to root element", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.decode('<book lang="en"><title>Dune</title></book>');
    const out = codec.encode(parsed);
    expect(out).toContain('lang="en"');
    expect(out).toContain("<title>Dune</title>");
  });

  it("roundtrips attribute", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.decode('<book lang="fr"><title>Le Monde</title></book>');
    expect(parsed.lang).toBe("fr");
    const out = codec.encode(parsed);
    expect(out).toContain('lang="fr"');
  });
});

// -----------------------------------------------------------------------
// xml.root tagname override
// -----------------------------------------------------------------------

describe("xml.root tagname override", () => {
  const Schema = xml.root(
    z.object({
      title: z.string(),
    }),
    { tagname: "my-book" },
  );

  it("parses with custom tagname", () => {
    const result = xmlCodec(Schema).decode("<my-book><title>T</title></my-book>");
    expect(result.title).toBe("T");
  });

  it("serializes with custom tagname", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.decode("<my-book><title>T</title></my-book>");
    expect(codec.encode(parsed)).toContain("<my-book>");
  });
});

// -----------------------------------------------------------------------
// Multi-tag grouping via match
// -----------------------------------------------------------------------

describe("multi-tag grouping via match", () => {
  const Schema = xml.root(
    z.object({
      animals: xml.prop(z.array(z.string()), {
        inline: true,
        match: /^(cat|dog)$/,
      }),
    }),
    { tagname: "zoo" },
  );

  it("collects elements matching regex into one array", () => {
    const result = xmlCodec(Schema).decode(
      "<zoo><cat>Felix</cat><dog>Rex</dog><cat>Whiskers</cat></zoo>",
    );
    expect(result.animals).toEqual(["Felix", "Rex", "Whiskers"]);
  });

  // FIXME: is this test really expected to pass ? Shouldn't the user set root tagname to the z.string inside the z.array ?
  it.todo("serializes using the field tagname", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.decode("<zoo><cat>Felix</cat><dog>Rex</dog></zoo>");
    const out = codec.encode(parsed);
    // Should use the tagname "animal" for serialization
    expect(out).toEqual("<zoo><animal>Felix</animal><animal>Rex</animal></zoo>");
  });
});

// -----------------------------------------------------------------------
// toXMLString options
// -----------------------------------------------------------------------

describe("toXMLString options", () => {
  const Schema = xml.root(
    z.object({
      title: z.string(),
      body: z.string(),
    }),
    { tagname: "doc" },
  );

  it("xmlCodec encodes as single line XML", () => {
    const codec = xmlCodec(Schema);
    const parsed = codec.decode("<doc><title>T</title><body>B</body></doc>");
    const out = codec.encode(parsed);
    expect(out).not.toContain("\n");
  });

  it("toXMLString on xmlModel class accepts options", () => {
    const DocSchema = xml.root(z.object({ title: z.string() }), { tagname: "doc" });
    class Doc extends xmlModel(DocSchema) {}
    const doc = Doc.fromXML("<doc><title>Hello</title></doc>");
    const out = Doc.toXMLString(doc, { spaces: 4 });
    expect(out).toContain("\n");
    expect(out).toContain("    <title>");
  });
});

// -----------------------------------------------------------------------
// getUserOptions parent-schema inheritance
// -----------------------------------------------------------------------

describe("getUserOptions parent-schema inheritance", () => {
  const EngineSchema = xml.root(z.object({ horsepower: z.number() }), { tagname: "engine" });

  class Engine extends xmlModel(EngineSchema) {}
  // FIXME: xmlCodec() recursively converts instances to objects which breaks xml encoding
  it.skip("Engine.schema() used as field inherits tagname from dataSchema", () => {
    const FleetSchema = xml.root(z.object({ engine: Engine.schema() }), { tagname: "fleet" });
    const result = xmlCodec(FleetSchema).decode(
      "<fleet><engine><horsepower>150</horsepower></engine></fleet>",
    );
    expect(result.engine).toBeInstanceOf(Engine);
    expect(result.engine.horsepower).toBe(150);
    const out = xmlCodec(FleetSchema).encode(result);
    expect(out).toContain("<engine>");
    expect(out).toContain("<horsepower>150</horsepower>");
  });

  it.skip("Engine.schema().optional() inherits tagname through optional wrapper", () => {
    const FleetSchema = xml.root(z.object({ engine: Engine.schema().optional() }), {
      tagname: "fleet",
    });
    const result = xmlCodec(FleetSchema).decode(
      "<fleet><engine><horsepower>200</horsepower></engine></fleet>",
    );
    expect(result.engine?.horsepower).toBe(200);
    const out = xmlCodec(FleetSchema).encode(result);
    expect(out).toContain("<engine>");
  });
});

// -----------------------------------------------------------------------
// ZodCodec tagname propagation (property tagname overrides schema root tagname)
// -----------------------------------------------------------------------

describe("ZodCodec tagname propagation", () => {
  // A ZodCodec wrapping a plain-object schema with root tagname "inner".
  // We use z.codec with identity transforms so no class instances are involved,
  // keeping the test focused purely on tagname override behaviour.
  const innerDataSchema = xml.root(z.object({ value: z.string() }), { tagname: "inner" });
  const innerCodec = z.codec(innerDataSchema, innerDataSchema, {
    decode: (data) => data,
    encode: (data) => data,
  });

  // The outer schema references innerCodec but overrides the serialized tagname to "outer-inner"
  const OuterSchema = xml.root(
    z.object({
      child: xml.prop(innerCodec, { tagname: "outer-inner" }),
    }),
    { tagname: "outer" },
  );

  const xmlStr = "<outer><outer-inner><value>hello</value></outer-inner></outer>";

  it("decodes using property tagname (not schema root tagname)", () => {
    const result = xmlCodec(OuterSchema).decode(xmlStr);
    expect(result.child.value).toBe("hello");
  });

  it("encodes using property tagname (not schema root tagname)", () => {
    const result = xmlCodec(OuterSchema).decode(xmlStr);
    const out = xmlCodec(OuterSchema).encode(result);
    expect(out).toContain("<outer-inner>");
    expect(out).not.toContain("<inner>");
  });

  it("roundtrips with property tagname override", () => {
    const result = xmlCodec(OuterSchema).decode(xmlStr);
    const out = xmlCodec(OuterSchema).encode(result);
    const reparsed = xmlCodec(OuterSchema).decode(out);
    expect(reparsed.child.value).toBe("hello");
  });
});

// -----------------------------------------------------------------------
// ZodDefault tagname inheritance
// -----------------------------------------------------------------------

describe("ZodDefault tagname inheritance", () => {
  const Schema = xml.root(
    z.object({
      title: xml.prop(z.string(), { tagname: "title" }).default("untitled"),
    }),
    { tagname: "book" },
  );

  it("decodes element using inherited tagname through ZodDefault wrapper", () => {
    const result = xmlCodec(Schema).decode("<book><title>Dune</title></book>");
    expect(result.title).toBe("Dune");
  });

  it("uses default value when element is absent", () => {
    const result = xmlCodec(Schema).decode("<book></book>");
    expect(result.title).toBe("untitled");
  });

  it("encodes using inherited tagname through ZodDefault wrapper", () => {
    const out = xmlCodec(Schema).encode({ title: "Dune" });
    expect(out).toBe("<book><title>Dune</title></book>");
  });
});

// -----------------------------------------------------------------------
// next middleware
// -----------------------------------------------------------------------

describe("next middleware — root-level decode", () => {
  it("next() returns the default decoded value which the user can modify", () => {
    const Schema = xml.root(z.object({ x: z.string() }), {
      tagname: "root",
      decode: (ctx, next) => {
        const v = next();
        return { x: v.x + "!" };
      },
    });
    const result = xmlCodec(Schema).decode("<root><x>hello</x></root>");
    expect(result.x).toBe("hello!");
  });

  it("decode with optional wrapper: null check runs before custom decode", () => {
    const Inner = xml.root(z.object({ x: z.string() }), {
      tagname: "inner",
      decode: (ctx, next) => next(),
    });
    const Schema = xml.root(z.object({ inner: Inner.optional() }), { tagname: "root" });
    const withValue = xmlCodec(Schema).decode("<root><inner><x>hi</x></inner></root>");
    expect(withValue.inner?.x).toBe("hi");
    const withoutValue = xmlCodec(Schema).decode("<root></root>");
    expect(withoutValue.inner).toBeUndefined();
  });
});

describe("next middleware — root-level encode", () => {
  it("next() returns the default encoded element and user can add attributes", () => {
    const Schema = xml.root(z.object({ title: z.string() }), {
      tagname: "book",
      encode: (ctx, next) => {
        const el = next();
        el.attributes["v"] = "2";
        return el;
      },
    });
    const out = xmlCodec(Schema).encode({ title: "Dune" });
    expect(out).toContain('v="2"');
    expect(out).toContain("<title>Dune</title>");
  });
});

describe("next middleware — property-level decode", () => {
  it("next() applies default decode and user can modify ctx.result afterward", () => {
    const Schema = xml.root(
      z.object({
        title: xml.prop(z.string(), {
          decode: (ctx, next) => {
            next(); // decodes and sets ctx.result.title = "Hello"
            // append suffix to the decoded value
            (ctx.result as any).title = (ctx.result as any).title + "!";
          },
        }),
      }),
      { tagname: "doc" },
    );
    const result = xmlCodec(Schema).decode("<doc><title>Hello</title></doc>");
    expect(result.title).toBe("Hello!");
  });
});

describe("next middleware — property-level encode", () => {
  it("next() performs default encoding and user can mutate parent element afterward", () => {
    const Schema = xml.root(
      z.object({
        title: xml.prop(z.string(), {
          encode: (ctx, next) => {
            next();
            ctx.result.attributes["mark"] = "1";
          },
        }),
      }),
      { tagname: "doc" },
    );
    const out = xmlCodec(Schema).encode({ title: "Hello" });
    expect(out).toContain("<title>Hello</title>");
    expect(out).toContain('mark="1"');
  });
});

describe("regression — xml.attr with optional wrapper", () => {
  const Schema = xml.root(
    z.object({
      lang: xml.attr(z.string(), { name: "lang" }).optional(),
      title: z.string(),
    }),
    { tagname: "book" },
  );

  it("still reads attribute through optional wrapper", () => {
    const result = xmlCodec(Schema).decode('<book lang="en"><title>Dune</title></book>');
    expect(result.lang).toBe("en");
  });

  it("returns undefined for absent optional attribute", () => {
    const result = xmlCodec(Schema).decode("<book><title>Dune</title></book>");
    expect(result.lang).toBeUndefined();
  });
});

// -----------------------------------------------------------------------
// XML_STATE preserved for nested model instances
// -----------------------------------------------------------------------

describe("XML_STATE preserved for nested model instances", () => {
  class Inner extends XMLBase.extend({ value: z.string() }, xml.root({ tagname: "inner" })) {}
  class Outer extends XMLBase.extend({ inner: Inner.schema() }, xml.root({ tagname: "outer" })) {}

  it("preserves unknown elements inside a nested model across a round-trip", () => {
    const xmlStr = `<outer><inner><value>hello</value><unknown>data</unknown></inner></outer>`;
    const instance = Outer.fromXML(xmlStr);
    const out = Outer.toXMLString(instance);
    expect(out).toContain("<unknown>data</unknown>");
  });

  it("preserves unknown elements at both root and nested levels simultaneously", () => {
    const xmlStr = `<outer><root-unknown>foo</root-unknown><inner><value>hello</value><inner-unknown>bar</inner-unknown></inner></outer>`;
    const instance = Outer.fromXML(xmlStr);
    const out = Outer.toXMLString(instance);
    expect(out).toContain("<root-unknown>foo</root-unknown>");
    expect(out).toContain("<inner-unknown>bar</inner-unknown>");
  });

  it("records source XMLElement when source: true is passed to xmlStateSchema", () => {
    class WithSource extends xmlModel(
      z.object({ [XML_STATE_KEY]: xmlStateSchema({ source: true }), value: z.string() }),
      { tagname: "item" },
    ) {}
    const instance = WithSource.fromXML("<item><value>hello</value></item>");
    expect(instance[XML_STATE_KEY]?.source).toBeDefined();
    expect(instance[XML_STATE_KEY]?.source?.name).toBe("item");
  });

  it("records source on nested instances when source: true is used", () => {
    class InnerWithSource extends XMLBaseWithSource.extend(
      { value: z.string() },
      xml.root({ tagname: "inner" }),
    ) {}
    class OuterWithSource extends XMLBaseWithSource.extend(
      { inner: InnerWithSource.schema() },
      xml.root({ tagname: "outer" }),
    ) {}
    const instance = OuterWithSource.fromXML("<outer><inner><value>hello</value></inner></outer>");
    expect(instance.inner[XML_STATE_KEY]?.source?.name).toBe("inner");
  });

  it("preserves unknown elements in arrays of nested models", () => {
    class List extends XMLBase.extend(
      { items: xml.prop(z.array(Inner.schema()), { inline: true, tagname: "inner" }) },
      xml.root({ tagname: "list" }),
    ) {}
    const xmlStr = `<list><inner><value>a</value><extra>1</extra></inner><inner><value>b</value></inner></list>`;
    const instance = List.fromXML(xmlStr);
    const out = List.toXMLString(instance);
    expect(out).toContain("<extra>1</extra>");
  });
});

// -----------------------------------------------------------------------
// XMLCodecError path tracking
// -----------------------------------------------------------------------

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("Expected function to throw");
}

describe("XMLCodecError", () => {
  it("wraps a decode error with the field name as path", () => {
    const Schema = xml.root(
      z.object({
        value: xml.prop(z.string(), {
          decode() {
            throw new Error("boom");
          },
        }),
      }),
      { tagname: "doc" },
    );
    const err = catchError(() =>
      xmlCodec(Schema).decode("<doc><value>x</value></doc>"),
    ) as XMLCodecError;
    expect(err).toBeInstanceOf(XMLCodecError);
    expect(err.path).toEqual(["value"]);
  });

  it("wraps an encode error with the field name as path", () => {
    const Schema = xml.root(
      z.object({
        value: xml.prop(z.string(), {
          encode() {
            throw new Error("boom");
          },
        }),
      }),
      { tagname: "doc" },
    );
    const err = catchError(() => xmlCodec(Schema).encode({ value: "x" })) as XMLCodecError;
    expect(err).toBeInstanceOf(XMLCodecError);
    expect(err.path).toEqual(["value"]);
  });

  it("accumulates path across nested models", () => {
    class Inner extends XMLBase.extend(
      {
        value: xml.prop(z.string(), {
          decode() {
            throw new Error("boom");
          },
        }),
      },
      xml.root({ tagname: "inner" }),
    ) {}
    class Outer extends XMLBase.extend({ inner: Inner.schema() }, xml.root({ tagname: "outer" })) {}
    const err = catchError(() =>
      Outer.fromXML("<outer><inner><value>x</value></inner></outer>"),
    ) as XMLCodecError;
    expect(err).toBeInstanceOf(XMLCodecError);
    expect(err.path).toEqual(["inner", "value"]);
  });

  it("preserves the original error as cause", () => {
    const original = new Error("original");
    const Schema = xml.root(
      z.object({
        value: xml.prop(z.string(), {
          decode() {
            throw original;
          },
        }),
      }),
      { tagname: "doc" },
    );
    const err = catchError(() =>
      xmlCodec(Schema).decode("<doc><value>x</value></doc>"),
    ) as XMLCodecError;
    expect(err.cause).toBe(original);
  });

  it("cause is preserved through nested rethrows", () => {
    const original = new Error("original");
    class Inner extends XMLBase.extend(
      {
        value: xml.prop(z.string(), {
          decode() {
            throw original;
          },
        }),
      },
      xml.root({ tagname: "inner" }),
    ) {}
    class Outer extends XMLBase.extend({ inner: Inner.schema() }, xml.root({ tagname: "outer" })) {}
    const err = catchError(() =>
      Outer.fromXML("<outer><inner><value>x</value></inner></outer>"),
    ) as XMLCodecError;
    expect(err.cause).toBe(original);
  });

  it("message includes path prefix", () => {
    const Schema = xml.root(
      z.object({
        value: xml.prop(z.string(), {
          decode() {
            throw new Error("boom");
          },
        }),
      }),
      { tagname: "doc" },
    );
    const err = catchError(() =>
      xmlCodec(Schema).decode("<doc><value>x</value></doc>"),
    ) as XMLCodecError;
    expect(err.message).toBe("[value] boom");
  });
});
