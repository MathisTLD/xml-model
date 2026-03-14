import { z } from "zod";
import type { XMLRoot } from "./types";
import { xmlCodec } from "./codec";
import { xml, type XMLRootMeta } from "./schema-meta";
import XML from "./xml";
import type { Options } from "xml-js";

type XmlModelConstructor<S extends z.ZodObject<any>> = {
  new (data: z.infer<S>): z.infer<S>;
  /** Returns a new instance parsed from XML. Return type is the concrete subclass. */
  fromXML<T extends abstract new (...args: any[]) => any>(
    this: T,
    xml: string | XMLRoot,
  ): InstanceType<T>;
  toXML(instance: z.infer<S>): XMLRoot;
  toXMLString(instance: z.infer<S>, options?: Options.JS2XML): string;
  /** The ZodObject schema (without transform). Use this for codec internals, merging, etc. */
  readonly dataSchema: S;
  /**
   * Returns a ZodPipe that parses XML data and instantiates this class.
   * The output type is polymorphic: `z.infer<ReturnType<typeof MyClass.schema>>` resolves to `MyClass`.
   * Use in xml.prop() or z.array(...).
   */
  schema<T extends abstract new (...args: any[]) => any>(
    this: T,
  ): z.ZodPipe<S, z.ZodTransform<z.infer<S>, InstanceType<T>>>;
};

/**
 * Class factory that bridges the xmlCodec engine to a class with typed instance properties.
 * Accepts either a pre-annotated schema or a raw ZodObject plus root metadata.
 *
 * `Class.schema()`    — ZodPipe with a transform that produces class instances. Use in xml.prop().
 * `Class.dataSchema`  — raw ZodObject. Use for xmlCodec(), merging, or when you don't want instances.
 *
 * @example
 * class Book extends xmlModel(z.object({ title: xml.prop(z.string()) }), { tagname: "book" }) {}
 * const book = Book.fromXML("<book>...</book>");
 * book instanceof Book; // true
 */
export function xmlModel<S extends z.ZodObject<any>>(
  schema: S,
  meta?: XMLRootMeta,
): XmlModelConstructor<S> {
  if (meta) xml.model(schema, meta);
  type Data = z.infer<S>;

  class XmlModelBase {
    static readonly dataSchema: S = schema;

    static schema() {
      // Cache per-class so each subclass gets its own ZodPipe with the right constructor
      if (!Object.prototype.hasOwnProperty.call(this, "_schema")) {
        const ctor = this as unknown as new (data: Data) => any;
        (this as any)._schema = schema.transform((data) => new ctor(data));
      }
      return (this as any)._schema;
    }

    static fromXML(this: new (data: Data) => any, xml: string | XMLRoot) {
      const data = xmlCodec(schema).fromXML(xml);
      return new this(data);
    }

    static toXML(instance: Data): XMLRoot {
      return xmlCodec(schema).toXML(instance);
    }

    static toXMLString(instance: Data, options?: Options.JS2XML): string {
      return XML.stringify(xmlCodec(schema).toXML(instance), options);
    }

    constructor(data: Data) {
      Object.assign(this, data);
    }
  }

  return XmlModelBase as unknown as XmlModelConstructor<S>;
}
