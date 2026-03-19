import { z } from "zod";
import type { GlobalMeta } from "zod";

/**
 * Constructor type for model classes.
 *
 * `S`    — the ZodObject schema (drives field types)
 * `Inst` — the actual instance type produced by `new`. Defaults to `z.infer<S>`.
 *           `extend()` widens it to `InstanceType<Self> & z.infer<ExtendedSchema>`
 *           so that parent class methods survive into child instances.
 */
export type ModelConstructor<
  S extends z.ZodObject<any> = z.ZodObject<any>,
  Inst extends z.infer<S> = z.infer<S>,
> = {
  new (data: z.infer<S>): Inst;
  readonly dataSchema: S;

  /**
   * Returns a ZodCodec that transforms parsed data into a class instance (and can go the other way around).
   * Use inside xml.prop() or z.array(...).
   */
  schema<T extends abstract new (...args: any[]) => any>(
    this: T,
  ): z.ZodCodec<S, z.ZodCustom<InstanceType<T>, InstanceType<T>>>;

  /**
   * Override to customise instantiation — e.g. to inject extra constructor arguments.
   * Called by from() instead of `new this(data)` directly.
   */
  fromData<T extends new (...args: any[]) => any>(this: T, data: z.output<S>): InstanceType<T>;

  /**
   * Returns the raw decoded data object stored on the instance — the same
   * object that was passed to the constructor, including any non-enumerable
   * symbol metadata (e.g. `XML_STATE`) that survived construction.
   */
  toData<T extends abstract new (...args: any[]) => any>(
    this: T,
    instance: InstanceType<T>,
  ): z.output<S>;

  /**
   * Creates a new model class that truly extends this one — inheriting its prototype
   * chain and methods — while adding new schema fields.
   *
   * Pass an optional `meta` object (e.g. `xml.root({ tagname: "car" })`) to attach
   * Zod schema metadata to the extended schema. Multiple codec metas compose with spread:
   * `{ ...xml.root({ tagname: "car" }), ...otherCodec.meta({...}) }`
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

/** Stores the raw data object on model instances. */
export const DATA = Symbol("model:data");

/** Returns true if `cls` is a class produced by `model()` (or a subclass of one). */
export function isModel(cls: unknown): cls is ModelConstructor {
  return typeof cls === "function" && MODEL_MARKER in cls;
}

function defineFieldAccessors(proto: object, keys: string[]) {
  for (const key of keys) {
    Object.defineProperty(proto, key, {
      get() {
        return (this as any)[DATA][key];
      },
      set(v) {
        (this as any)[DATA][key] = v;
      },
      enumerable: true,
      configurable: true,
    });
  }
}

/**
 * Generic class factory. Creates a class with typed instance properties
 * and codec-agnostic from()/to() methods.
 *
 * Codec-specific factories (e.g. xmlModel) wrap this and inject named helpers.
 *
 * @example
 * class Book extends model(z.object({ title: z.string() })) {}
 */
export function model<S extends z.ZodObject<any>>(schema: S): ModelConstructor<S> {
  type Data = z.infer<S>;

  class Base {
    static readonly dataSchema: S = schema;
    static readonly [MODEL_MARKER] = true;

    static schema() {
      // Cache per-class so each subclass gets its own ZodPipe with the right constructor
      if (!Object.prototype.hasOwnProperty.call(this, schemaSymbol)) {
        const codec = z.codec(this.dataSchema, z.instanceof(this), {
          decode: (data) => {
            return this.fromData(data);
          },
          encode: (instance) => {
            return instance[DATA];
          },
        });
        this[schemaSymbol] = codec;
      }
      return this[schemaSymbol]!;
    }

    static extend(extension: z.core.$ZodLooseShape, meta?: GlobalMeta) {
      let extended = (this as any).dataSchema.extend(extension);
      if (meta) extended = extended.meta(meta);
      // @ts-ignore
      const Child = class extends this {
        static readonly dataSchema = extended;
      };
      defineFieldAccessors(Child.prototype, Object.keys(extension));
      return Child;
    }

    static fromData<T extends new (...args: any[]) => any>(this: T, data: Data) {
      return new this(data);
    }

    static toData<T extends abstract new (...args: any[]) => any>(
      this: T,
      instance: InstanceType<T>,
    ) {
      const data = instance[DATA];
      // FIXME data should always be present
      if (!data) throw new Error("failed to retrieve instance data");
      return data;
    }

    constructor(data: Data) {
      this[DATA] = data;
    }
  }

  defineFieldAccessors(Base.prototype, Object.keys(schema.def.shape));

  // TODO: should not need type cast
  return Base as unknown as ModelConstructor<S>;
}
