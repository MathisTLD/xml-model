import { z } from "zod";
import type { GlobalMeta } from "zod";
import { CodecId, CodecInput, CodecOutput, CodecOptions, getCodec } from "./codec";

/**
 * Constructor type for model classes.
 *
 * `S`    — the ZodObject schema (drives field types)
 * `Inst` — the actual instance type produced by `new`. Defaults to `z.infer<S>`.
 *           `extend()` widens it to `InstanceType<Self> & z.infer<ExtendedSchema>`
 *           so that parent class methods survive into child instances.
 */
export type ModelConstructor<S extends z.ZodObject<any>, Inst extends z.infer<S> = z.infer<S>> = {
  new (data: z.infer<S>): Inst;
  readonly dataSchema: S;

  /**
   * Returns a ZodPipe that transforms parsed data into a class instance.
   * Use inside xml.prop() or z.array(...).
   */
  schema<T extends abstract new (...args: any[]) => any>(
    this: T,
  ): z.ZodPipe<S, z.ZodTransform<InstanceType<T>, z.infer<S>>>;

  /**
   * Override to customise instantiation — e.g. to inject extra constructor arguments.
   * Called by from() instead of `new this(data)` directly.
   */
  fromData<T extends new (...args: any[]) => any>(this: T, data: z.infer<S>): InstanceType<T>;

  /** Decode input using a registered codec and return a class instance. */
  from<T extends abstract new (...args: any[]) => any, K extends CodecId>(
    this: T,
    codecId: K,
    input: CodecInput<K>,
  ): InstanceType<T>;

  /** Encode an instance using a registered codec. */
  to<K extends CodecId>(
    codecId: K,
    instance: z.infer<S>,
    options?: CodecOptions<K>,
  ): CodecOutput<K>;

  /**
   * Creates a new model class that truly extends this one — inheriting its prototype
   * chain and methods — while adding new schema fields.
   *
   * Pass an optional `meta` object (e.g. `xml.model({ tagname: "car" })`) to attach
   * Zod schema metadata to the extended schema. Multiple codec metas compose with spread:
   * `{ ...xml.model({ tagname: "car" }), ...otherCodec.meta({...}) }`
   */
  extend<Self extends ModelConstructor<S, Inst>, U extends z.core.$ZodLooseShape>(
    this: Self,
    extension: U,
    meta?: GlobalMeta,
  ): Omit<Self, keyof ModelConstructor<S, Inst>> &
    ModelConstructor<
      z.ZodObject<z.util.Extend<S["shape"], U>>,
      InstanceType<Self> & z.infer<z.ZodObject<z.util.Extend<S["shape"], U>>>
    >;
};

const schemaSymbol = Symbol("model:schema");

/** Marker placed on every class returned by `model()`. Used by `isModel()`. */
const MODEL_MARKER = Symbol("model:marker");

/** Returns true if `cls` is a class produced by `model()` (or a subclass of one). */
export function isModel(cls: unknown): cls is ModelConstructor<z.ZodObject<any>> {
  return typeof cls === "function" && MODEL_MARKER in cls;
}

/**
 * Generic class factory. Creates a class with typed instance properties
 * and codec-agnostic from()/to() methods.
 *
 * Codec-specific factories (e.g. xmlModel) wrap this and inject named helpers.
 *
 * @example
 * class Book extends model(z.object({ title: z.string() })) {}
 * const book = Book.from("myCodec", input);
 */
export function model<S extends z.ZodObject<any>>(schema: S): ModelConstructor<S> {
  type Data = z.infer<S>;

  return class {
    static readonly dataSchema: S = schema;
    static readonly [MODEL_MARKER] = true;
    static schema() {
      // Cache per-class so each subclass gets its own ZodPipe with the right constructor
      if (!Object.prototype.hasOwnProperty.call(this, schemaSymbol)) {
        const ctor = this as unknown as new (data: Data) => any;
        this[schemaSymbol] = this.dataSchema.transform((data) => new ctor(data));
      }
      return this[schemaSymbol]!;
    }

    static extend(extension: z.core.$ZodLooseShape, meta?: GlobalMeta) {
      let extended = (this as any).dataSchema.extend(extension);
      if (meta) extended = extended.meta(meta);
      // @ts-ignore
      return class extends this {
        static readonly dataSchema = extended;
      };
    }

    static fromData(data: Data) {
      return new this(data);
    }

    static from(codecId: CodecId, input: unknown) {
      const factory = getCodec(codecId);
      const codec = factory(this.dataSchema);
      const data = codec.decode(input) as Data;
      return this.fromData(data);
    }

    static to(codecId: CodecId, instance: Data, options?: unknown) {
      const factory = getCodec(codecId);
      const codec = factory(this.dataSchema);
      return codec.encode(instance, options);
    }

    constructor(data: Data) {
      Object.assign(this, data);
    }
  } as unknown as ModelConstructor<S>;
}
