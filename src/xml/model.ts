import { z } from "zod";
import { XML, type XMLElement, type StringifyOptions } from "./xml-js";
import type { XMLRoot } from "./xml-js";
import { model } from "../model";
import type { ModelConstructor } from "../model";
import { decode, encode, XML_STATE_KEY, xmlStateSchema } from "./codec";
import type { UserCodecOptions } from "./codec";
import { root } from "./schema-meta";

/**
 * Constructor type for xmlModel classes.
 * Extends ModelConstructor with XML-specific helpers and a typed extend().
 */
export type XmlModelConstructor<
  S extends z.ZodObject<any> = z.ZodObject<any>,
  Inst extends z.infer<S> = z.infer<S>,
> = ModelConstructor<S, Inst> & {
  /** Returns a new instance parsed from an XML string or XMLRoot. */
  fromXML<T extends abstract new (...args: any[]) => any>(
    this: T,
    xmlInput: string | XMLRoot | XMLElement,
  ): InstanceType<T>;

  /** Converts an instance to an XMLRoot document tree. */
  toXML(instance: z.infer<S>): XMLRoot;

  /** Converts an instance to an XML string. */
  toXMLString(instance: z.infer<S>, options?: StringifyOptions): string;
};

/**
 * Base class for xmlModel classes. Preserves element ordering and unknown elements
 * through `schema.parse()` for nested model instances.
 *
 * @example
 * class Device extends XMLBase.extend(
 *   { name: z.string() },
 *   xml.root({ tagname: "device" }),
 * ) {}
 */
export const XMLBase = xmlModel(z.object({ [XML_STATE_KEY]: xmlStateSchema() }));

/**
 * Like {@link XMLBase}, but also records the original `XMLElement` as `.source`
 * on each instance's XML state.
 *
 * @example
 * const device = Device.fromXML(`<device>…</device>`);
 * device[XML_STATE_KEY]?.source; // XMLElement
 */
export const XMLBaseWithSource = xmlModel(
  z.object({ [XML_STATE_KEY]: xmlStateSchema({ source: true }) }),
);

export function xmlModel<S extends z.ZodObject<any>>(
  schema: S,
  options?: UserCodecOptions<S>,
): XmlModelConstructor<S> {
  const _schema = options ? root(schema, options) : schema;

  // FIXME: no ts-ignore
  // @ts-ignore
  return class extends model(_schema) {
    static fromXML<T extends ModelConstructor>(
      this: T,
      input: string | XMLRoot | XMLElement,
    ): InstanceType<T> {
      if (typeof input === "string") {
        input = XML.parse(input);
      }
      if (XML.isRoot(input)) {
        input = XML.elementFromRoot(input);
      }
      const schema = this.dataSchema;
      const inputData = decode(this.dataSchema, input);
      const xmlState = (inputData as any)[XML_STATE_KEY];
      const parsed = schema.parse(inputData);
      // Re-attach in case the schema doesn't include XML_STATE_KEY (Zod strips unknown keys).
      // For schemas that DO include it via xmlStateSchema(), this is a harmless overwrite.
      (parsed as any)[XML_STATE_KEY] = xmlState;
      return this.fromData(parsed);
    }

    static toXML<T extends ModelConstructor>(this: T, instance: InstanceType<T>): XMLRoot {
      const data = this.toData(instance);
      const element = encode(this.dataSchema, data);
      return { elements: [element] };
    }

    static toXMLString<T extends XmlModelConstructor>(
      this: T,
      instance: InstanceType<T>,
      options: StringifyOptions = {},
    ): string {
      const xml = this.toXML(instance);
      return XML.stringify(xml, options);
    }
  };
}
