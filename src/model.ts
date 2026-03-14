import { z } from "zod";
import type { XMLRoot } from "./types";
import { xmlCodec } from "./codec";
import { xml, type XMLRootMeta } from "./schema-meta";
import XML from "./xml";
import type { Options } from "xml-js";

/**
 * Constructor type for xmlModel classes.
 *
 * `S`    — the ZodObject schema (drives field types and codec)
 * `Inst` — the actual instance type produced by `new`. Defaults to `z.infer<S>` for base
 *           classes; `extend()` widens it to `InstanceType<Self> & z.infer<ExtendedSchema>`
 *           so that parent class methods survive into child instances.
 */
export type XmlModelConstructor<
  S extends z.ZodObject<any>,
  Inst extends z.infer<S> = z.infer<S>,
> = {
  new (data: z.infer<S>): Inst;
  /** Returns a new instance parsed from XML. Return type is the concrete subclass. */
  fromXML<T extends abstract new (...args: any[]) => any>(
    this: T,
    xmlInput: string | XMLRoot,
  ): InstanceType<T>;
  toXML(instance: z.infer<S>): XMLRoot;
  toXMLString(instance: z.infer<S>, options?: Options.JS2XML): string;
  /** The ZodObject schema (without transform). Use this for codec internals, merging, etc. */
  readonly dataSchema: S;
  /**
   * Returns a ZodPipe that parses XML data and instantiates this class.
   * Use in xml.prop() or z.array(...).
   */
  schema<T extends abstract new (...args: any[]) => any>(
    this: T,
  ): z.ZodPipe<S, z.ZodTransform<InstanceType<T>, z.infer<S>>>;
  /**
   * Creates a new xmlModel class that truly extends this one — inheriting its prototype
   * chain and methods — while adding new schema fields.
   *
   * `InstanceType<Self>` carries the parent's instance type (including class-body methods
   * like `label()`) into the child's `Inst`, so nested arrays of child instances expose
   * those methods through schema inference.
   *
   * Contrast with `xmlModel(ThisClass.dataSchema.extend(extension), meta)`, which produces
   * a fresh unrelated class (no shared prototype, no inherited methods).
   */
  extend<Self extends XmlModelConstructor<S, Inst>, U extends z.core.$ZodLooseShape>(
    this: Self,
    extension: U,
    meta?: XMLRootMeta,
  ): XmlModelConstructor<
    z.ZodObject<z.util.Extend<S["shape"], U>>,
    InstanceType<Self> & z.infer<z.ZodObject<z.util.Extend<S["shape"], U>>>
  >;
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
  // xml.model() clones the schema and registers the clone in z.globalRegistry.
  // The clone (rootSchema) is used as dataSchema; xmlRoot metadata does not propagate
  // through .extend(), so child schemas start clean without inheriting the parent tagname.
  const rootSchema = meta ? xml.model(schema, meta) : schema;
  type Data = z.infer<S>;

  return class {
    static readonly dataSchema: S = rootSchema;

    static schema() {
      // Cache per-class so each subclass gets its own ZodPipe with the right constructor
      if (!Object.prototype.hasOwnProperty.call(this, "_schema")) {
        const ctor = this as unknown as new (data: Data) => any;
        (this as any)._schema = this.dataSchema.transform((data) => new ctor(data));
      }
      return (this as any)._schema;
    }

    static xmlCodec() {
      return xmlCodec(this.dataSchema);
    }

    static extend<U extends z.core.$ZodLooseShape>(extension: U, meta?: XMLRootMeta) {
      const rawExtended = this.dataSchema.extend(extension);
      const extendedSchema = meta ? xml.model(rawExtended, meta) : rawExtended;
      // FIXME: should not need ts-ignore
      // @ts-ignore
      return class XmlModelExtendedBase extends this {
        static readonly dataSchema = extendedSchema;
      };
    }

    static fromXML(xmlInput: string | XMLRoot) {
      const data = this.xmlCodec().fromXML(xmlInput);
      return new this(data);
    }

    static toXML(instance: Data): XMLRoot {
      return this.xmlCodec().toXML(instance);
    }

    static toXMLString(instance: Data, options?: Options.JS2XML): string {
      return XML.stringify(this.xmlCodec().toXML(instance), options);
    }

    constructor(data: Data) {
      Object.assign(this, data);
    }
  } as unknown as XmlModelConstructor<S>;
}
