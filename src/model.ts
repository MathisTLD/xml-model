import { z } from "zod";
import type { XMLRoot } from "./types";
import { xmlCodec } from "./codec";
import XML from "./xml";

type XmlModelConstructor<S extends z.ZodObject<any>> = {
  new (data: z.infer<S>): z.infer<S>;
  fromXML<T extends XmlModelConstructor<S>>(this: T, xml: string | XMLRoot): InstanceType<T>;
  toXML(instance: z.infer<S>): XMLRoot;
  toXMLString(instance: z.infer<S>): string;
  readonly schema: S;
};

/**
 * Class factory that bridges the xmlCodec engine to a class with typed instance properties.
 *
 * @example
 * class Book extends xmlModel(BookSchema) {
 *   wordCount() { return this.chapters.length; }
 * }
 * const book = Book.fromXML("<book>...</book>");
 * book instanceof Book; // true
 * book.wordCount();     // works
 */
export function xmlModel<S extends z.ZodObject<any>>(schema: S): XmlModelConstructor<S> {
  type Data = z.infer<S>;

  class XmlModelBase {
    static readonly schema: S = schema;

    static fromXML(this: new (data: Data) => any, xml: string | XMLRoot) {
      const data = xmlCodec(schema).fromXML(xml);
      return new this(data);
    }

    static toXML(instance: Data): XMLRoot {
      return xmlCodec(schema).toXML(instance);
    }

    static toXMLString(instance: Data): string {
      return XML.stringify(xmlCodec(schema).toXML(instance));
    }

    constructor(data: Data) {
      Object.assign(this, data);
    }
  }

  return XmlModelBase as unknown as XmlModelConstructor<S>;
}
