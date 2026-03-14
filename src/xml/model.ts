import { z } from "zod";
import type { XMLRoot } from "./types";
import type { Options } from "xml-js";
import { xml, type XMLMeta } from "./schema-meta";
import { xmlCodec } from "./codec";
import { model, type ModelConstructor } from "../model";
import { registerCodec } from "../codec";

// Register XML codecs — runs once when this module is first imported.

registerCodec("xmljs", (schema) => {
  const codec = xmlCodec(schema);
  return {
    decode: (input: XMLRoot) => codec.fromXML(input),
    encode: (data: unknown) => codec.toXML(data as any),
  };
});

registerCodec("xml", (schema) => {
  const codec = xmlCodec(schema);
  return {
    decode: (input: string | XMLRoot) => codec.fromXML(input as any),
    encode: (data: unknown, options?: Options.JS2XML) => codec.toXMLString(data as any, options),
  };
});

// Augment CodecMap with XML codec types.
declare module "../codec" {
  interface CodecMap {
    /** Full XML string codec: input is string or XMLRoot, output is string. */
    xml: { input: string | XMLRoot; output: string; options?: Options.JS2XML };
    /** Low-level xml-js tree codec: input/output is XMLRoot. */
    xmljs: { input: XMLRoot; output: XMLRoot };
  }
}

/**
 * Constructor type for xmlModel classes.
 * Extends ModelConstructor with XML-specific helpers and a typed extend().
 */
export type XmlModelConstructor<
  S extends z.ZodObject<any>,
  Inst extends z.infer<S> = z.infer<S>,
> = ModelConstructor<S, Inst> & {
  /** Returns a new instance parsed from an XML string or XMLRoot. */
  fromXML<T extends abstract new (...args: any[]) => any>(
    this: T,
    xmlInput: string | XMLRoot,
  ): InstanceType<T>;

  /** Converts an instance to an XMLRoot document tree. */
  toXML(instance: z.infer<S>): XMLRoot;

  /** Converts an instance to an XML string. */
  toXMLString(instance: z.infer<S>, options?: Options.JS2XML): string;
};

/**
 * Class factory that bridges the xmlCodec engine to a class with typed instance properties.
 * Wraps the generic model() factory and injects XML-specific helpers.
 *
 * `Class.fromXML()`    — parse XML string or XMLRoot into a class instance
 * `Class.toXML()`      — convert instance to XMLRoot
 * `Class.toXMLString()` — convert instance to XML string
 * `Class.schema()`     — ZodPipe with a transform that produces class instances. Use in xml.prop().
 * `Class.dataSchema`   — raw ZodObject. Use for codec internals, merging, or .extend().
 * `Class.from()`       — generic codec-based decode (e.g. from("xml", input))
 * `Class.to()`         — generic codec-based encode
 *
 * @example
 * class Book extends xmlModel(z.object({ title: xml.prop(z.string()) }), { tagname: "book" }) {}
 * const book = Book.fromXML("<book>...</book>");
 * book instanceof Book; // true
 */
export function xmlModel<S extends z.ZodObject<any>>(
  schema: S,
  meta?: XMLMeta,
): XmlModelConstructor<S> {
  // xml.model() clones the schema and registers the clone in z.globalRegistry.
  // The clone (rootSchema) is used as dataSchema; xmlRoot metadata does not propagate
  // through .extend(), so child schemas start clean without inheriting the parent tagname.
  const rootSchema = meta ? xml.model(schema, meta) : schema;
  const Base = model(rootSchema);

  // @ts-ignore — TypeScript cannot statically verify the prototype chain of a dynamically
  // constructed class, but the runtime behaviour is correct.
  return class extends Base {
    static fromXML(xmlInput: string | XMLRoot) {
      return this.from("xml", xmlInput);
    }

    static toXML(instance: z.infer<S>) {
      return this.to("xmljs", instance);
    }

    static toXMLString(instance: z.infer<S>, options?: Options.JS2XML) {
      return this.to("xml", instance, options);
    }
  } as unknown as XmlModelConstructor<S>;
}
