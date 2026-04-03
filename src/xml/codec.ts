import { z } from "zod";
import { XML, type XMLElement, type XMLRoot, type StringifyOptions } from "./xml-js";
import { getOwnUserOptions, prop, root } from "./schema-meta";
import { kebabCase } from "@/util/kebab-case";
import { getParentSchema, isZodType } from "@/util/zod";

export class XMLCodecError extends Error {
  readonly path: readonly (string | number)[];
  readonly rawMessage: string;

  constructor(rawMessage: string, path: readonly (string | number)[] = [], options?: ErrorOptions) {
    super(path.length ? `[${path.join(".")}] ${rawMessage}` : rawMessage, options);
    this.name = "XMLCodecError";
    this.path = path;
    this.rawMessage = rawMessage;
  }
}

function rethrow(e: unknown, segment: string | number): never {
  const cause = e instanceof XMLCodecError ? e.cause : e;
  const path: readonly (string | number)[] =
    e instanceof XMLCodecError ? [segment, ...e.path] : [segment];
  const rawMessage =
    e instanceof XMLCodecError ? e.rawMessage : e instanceof Error ? e.message : String(e);
  throw new XMLCodecError(rawMessage, path, { cause });
}

// FIXME: these two assertion should be in ./xml-js
export function assertSingleElement(xml: XMLElement[]): asserts xml is [XMLElement] {
  if (xml.length !== 1) throw new Error(`Expected single XML element, got ${xml.length}`);
}

export function assertSingleRoot(
  xml: XMLElement[],
): asserts xml is [XMLElement & { elements: XMLElement[] }] {
  assertSingleElement(xml);
  if (!Array.isArray(xml[0].elements)) throw new Error(`Expected element with children list`);
}

// a key in the input (inSchema) side of a ZodObject
type PropKey<S extends z.ZodObject> = keyof z.input<S> & string;

export interface CodecOptions<S extends z.ZodType> {
  schema: S;
  /** Resolved options of the wrapped inner schema, if any (e.g. the inner type of ZodOptional). */
  parent: CodecOptions<z.ZodType> | undefined;
  tagname(ctx: RootEncodingContext<S>): string;
  decode(ctx: RootDecodingContext<S>): z.input<S>;
  encode(ctx: RootEncodingContext<S>): XMLElement;
  // property options
  propertyTagname: (ctx: { name: string; options: CodecOptions<z.ZodType> }) => string;
  /** if true, XML representation is not contained in a single XML tag */
  inlineProperty: boolean;
  propertyMatch: (
    el: XMLElement,
    ctx: { name: string; tagname: string; options: CodecOptions<z.ZodType> },
  ) => boolean;
  decodeAsProperty(ctx: PropertyDecodingContext): void;
  encodeAsProperty(ctx: PropertyEncodingContext): void;
}

/**
 * Stored in schema meta under the single `@@xml-model` key.
 * All fields are optional; `normalizeCodecOptions` fills in defaults.
 * `tagname`/`propertyTagname` accept a string (normalized to a function).
 * `propertyMatch` accepts a RegExp (normalized to an element-name test).
 */
export type UserCodecOptions<S extends z.ZodType = z.ZodType> = {
  tagname?: string | CodecOptions<S>["tagname"];
  decode?: (ctx: RootDecodingContext<S>, next: () => z.input<S>) => z.input<S>;
  encode?: (ctx: RootEncodingContext<S>, next: () => XMLElement) => XMLElement;
  propertyTagname?: string | CodecOptions<S>["propertyTagname"];
  inlineProperty?: boolean;
  propertyMatch?: RegExp | CodecOptions<S>["propertyMatch"];
  decodeAsProperty?: CodecOptions<S>["decodeAsProperty"];
  encodeAsProperty?: CodecOptions<S>["encodeAsProperty"];
};

export interface RootDecodingContext<S extends z.ZodType> {
  options: CodecOptions<S>;
  xml: XMLElement | null;
}
export interface RootEncodingContext<S extends z.ZodType> {
  options: CodecOptions<S>;
  data: z.input<S>;
}

export interface PropertyDecodingContext<
  S extends z.ZodObject = z.ZodObject,
  K extends PropKey<S> = PropKey<S>,
> extends RootDecodingContext<S> {
  property: {
    name: K;
    options: CodecOptions<z.ZodType>;
    tagname: string;
    xml: XMLElement | null;
  };
  /** an object to be filled with input data */
  result: Partial<z.input<S>>;
}

export interface PropertyEncodingContext<
  S extends z.ZodObject = z.ZodObject,
  K extends PropKey<S> = PropKey<S>,
> extends RootEncodingContext<S> {
  property: {
    name: K;
    options: CodecOptions<z.ZodType>;
    tagname: string;
    value: z.input<S>[K];
  };
  result: XMLElement;
}

export function normalizeCodecOptions<S extends z.ZodType>(
  schema: S,
  options: UserCodecOptions<S> = {},
  parent: CodecOptions<z.ZodType> | undefined = undefined,
): CodecOptions<S> {
  let _defaultOptions: CodecOptions<S>;
  const defaultOptions = () => {
    // FIXME: this could cause infinite recursion
    if (!_defaultOptions) {
      const resolved = resolveDefault(schema);
      if (!resolved) {
        // TODO: dedicated exception
        throw new Error(
          `Failed to resolve default codec options for schema of type ${schema.type}`,
        );
      }
      _defaultOptions = resolved;
    }
    return _defaultOptions;
  };

  const userTagname = options.tagname;
  const tagname: CodecOptions<S>["tagname"] =
    typeof userTagname === "string"
      ? () => userTagname
      : typeof userTagname === "function"
        ? userTagname
        : parent
          ? parent.tagname // inherit same function reference — lets ZodCodec encode detect real overrides
          : () => {
              // TODO: allow customizable default behavior
              throw new Error("tagname is not defined");
            };

  const userPropTagname = options.propertyTagname;
  const propertyTagname: CodecOptions<S>["propertyTagname"] =
    typeof userPropTagname === "string"
      ? () => userPropTagname
      : typeof userPropTagname === "function"
        ? userPropTagname
        : parent
          ? (ctx) => parent.propertyTagname(ctx)
          : (ctx) => kebabCase(ctx.name);

  const inlineProperty = options.inlineProperty ?? parent?.inlineProperty ?? false;

  const userMatch = options.propertyMatch;
  const propertyMatch: CodecOptions<S>["propertyMatch"] =
    userMatch instanceof RegExp
      ? (el) => (userMatch as RegExp).test(el.name)
      : typeof userMatch === "function"
        ? userMatch
        : parent
          ? (el, ctx) => parent.propertyMatch(el, ctx)
          : (el, ctx) => el.name === ctx.tagname;

  const decode: CodecOptions<S>["decode"] = options.decode
    ? (ctx) => options.decode!(ctx, () => defaultOptions().decode(ctx))
    : defaultOptions().decode;
  const encode: CodecOptions<S>["encode"] = options.encode
    ? (ctx) => options.encode!(ctx, () => defaultOptions().encode(ctx))
    : defaultOptions().encode;

  // Self-referential — closures capture `result` so the built-in
  // decodeAsProperty/encodeAsProperty can call the schema's own decode/encode.
  const result: CodecOptions<S> = {
    schema,
    parent,
    tagname,
    decode,
    encode,
    propertyTagname,
    inlineProperty,
    propertyMatch,
    decodeAsProperty:
      options.decodeAsProperty ??
      parent?.decodeAsProperty ??
      function (ctx) {
        // Use ctx.property.options (the field's resolved codec options) rather than closing over
        // `result`, so that when this fallback is inherited by a wrapper (ZodOptional, ZodDefault)
        // via parent?.decodeAsProperty, it still routes through the wrapper's own decode —
        // which handles null xml correctly (undefined for optional, default value for ZodDefault).
        const res = ctx.property.options.decode({
          options: ctx.property.options,
          xml: ctx.property.xml,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctx.result as any)[ctx.property.name as string] = res;
      },
    encodeAsProperty:
      options.encodeAsProperty ??
      function (ctx) {
        const { property } = ctx;
        // Inject the property tagname so result.encode doesn't throw on schemas
        // that have no root tagname configured (field schemas don't need one).
        const optsWithTagname: CodecOptions<S> = { ...result, tagname: () => property.tagname };
        const res = result.encode({
          options: optsWithTagname,
          // FIXME: we should not rely on type casting
          data: property.value as z.input<S>,
        });
        if (XML.isEmpty(res)) {
          // Any {} anywhere in the elements array causes js2xml to drop ALL children when it appears at the end.
          // then we need to avoid ctx.result.elements to contain any {}
          return;
        }
        if (property.options.inlineProperty) {
          // Unwrap and re-tag: the property tagname overrides any root tagname on the element schema.
          ctx.result.elements.push(
            ...res.elements.map((el) =>
              el.type === "element" ? { ...el, name: property.tagname } : el,
            ),
          );
        } else {
          ctx.result.elements.push(res);
        }
      },
  };
  return result;
}

const cache = new Map<z.ZodType, CodecOptions<z.ZodType>>();

function resolveCodecOptions<S extends z.ZodType>(schema: S): CodecOptions<S> {
  const cached = cache.get(schema);
  if (cached) return cached as CodecOptions<S>;

  // FIXME: skipping parent for ZodLazy is a coarse workaround for infinite recursion on
  // self-referential schemas (the getter returns the same schema being resolved). A proper
  // solution should detect cycles via an in-progress set rather than special-casing ZodLazy,
  // and should also handle recursive schemas built with plain getters or other constructs.
  const parentSchema = schema instanceof z.ZodLazy ? undefined : getParentSchema(schema);
  const parent = parentSchema ? resolveCodecOptions(parentSchema) : undefined;

  const userOpts = getOwnUserOptions(schema);
  const options = normalizeCodecOptions(schema, userOpts, parent);
  cache.set(schema, options);
  return options;
}

type OrderEntry = string | XMLElement;

export interface XMLState {
  /** Preserves element ordering and unknown elements across a decode → encode round-trip. */
  sequence: OrderEntry[];
  /** Present when xmlStateSchema({ source: true }) is used: the original XMLElement. */
  source?: XMLElement;
}

/** Tracks all schemas created by `xmlStateSchema()` for fast detection at setup time. */
const xmlStateSchemas = new WeakSet<z.ZodType>();

/**
 * Schema for the XML round-trip state field.
 *
 * Add a field with this schema to any `xmlModel` ZodObject to opt in to:
 * - **Element ordering** — elements are re-emitted in source order, not schema order.
 * - **Unknown elements** — unrecognised elements are passed through verbatim on re-encode.
 *
 * The field can be named anything; the codec detects it automatically.
 * Pass `{ source: true }` to additionally store the original `XMLElement` on the instance.
 *
 * @example
 * class Device extends xmlModel(z.object({
 *   _xmlState: xmlStateSchema(),
 *   name: z.string(),
 * }), { tagname: "device" }) {}
 *
 * // With source recording:
 * class Device extends xmlModel(z.object({
 *   _xmlState: xmlStateSchema({ source: true }),
 *   name: z.string(),
 * }), { tagname: "device" }) {}
 */
export function xmlStateSchema(): z.ZodOptional<z.ZodCustom<XMLState>>;
export function xmlStateSchema(options: {
  source: true;
}): z.ZodOptional<z.ZodCustom<XMLState & { source: XMLElement }>>;
export function xmlStateSchema(options?: {
  source?: boolean;
}): z.ZodOptional<z.ZodCustom<XMLState>> {
  // xmlStateSchema is only used as a ZodObject property — its root-level decode/encode
  // are never called. The dummy implementations exist solely because normalizeCodecOptions
  // requires every schema to resolve a default handler via registerDefault, and ZodCustom
  // has no registered one.
  const inner = root(z.custom<XMLState>(), {
    decode: () => ({}) as XMLState,
    encode: () => ({}) as XMLElement,
  });
  const result = prop(inner.optional(), {
    decode: options?.source
      ? (ctx, _next) => {
          ((ctx.result as any)[ctx.property.name] ??= {}).source = ctx.xml;
        }
      : () => {},
    encode: () => {},
  }) as z.ZodOptional<z.ZodCustom<XMLState>>;
  xmlStateSchemas.add(result);
  return result;
}

/** Returns true if any schema in the wrapper chain has a user-defined tagname. */
function hasUserTagname(schema: z.ZodType): boolean {
  let s: z.ZodType | undefined = schema;
  while (s) {
    if (getOwnUserOptions(s).tagname) return true;
    s = getParentSchema(s);
  }
  return false;
}

function resolvePropertiesCodecOptions<S extends z.ZodObject<any>>(
  schema: S,
): { [K in PropKey<S>]: CodecOptions<z.ZodType> } {
  const shape = schema.def.shape as Record<string, z.ZodType>;
  const options = {};
  for (const [prop, fieldSchema] of Object.entries(shape)) {
    options[prop] = resolveCodecOptions(fieldSchema);
  }
  // FIXME: don't use any
  return options as any;
}

/**
 * Scans a ZodObject shape for a field created with `xmlStateSchema()`.
 * Returns the field key if found, `undefined` if absent.
 * Throws if more than one such field is present (not supported).
 */
function findXmlStateKey(shape: Record<string, z.ZodType>): string | undefined {
  const keys = Object.keys(shape).filter((k) => xmlStateSchemas.has(shape[k]));
  if (keys.length > 1)
    throw new Error(
      `Only one xmlStateSchema field is allowed per object schema, found: ${keys.join(", ")}`,
    );
  return keys[0];
}

/**
 * Converts an `XMLElement` into the **input type** of `schema` (`z.input<S>`).
 *
 * This is a pure XML-to-data adapter: it does not run Zod's parse pipeline, so
 * `z.codec` transforms and default values are **not** applied. The result is the
 * raw decoded value suitable for passing to `schema.parse()`.
 */
export function decode<S extends z.ZodType>(schema: S, xml: XMLElement): z.input<S> {
  const options = resolveCodecOptions(schema);
  return options.decode({ options, xml });
}

/**
 * Converts the **input type** of `schema` (`z.input<S>`) into an `XMLElement`.
 *
 * This is a pure data-to-XML adapter: it expects values at `z.input<S>` level,
 * meaning `z.codec` transforms must already have been reversed (via `schema.encode()`)
 * before calling this function.
 */
export function encode<S extends z.ZodType>(schema: S, data: z.input<S>): XMLElement {
  const options = resolveCodecOptions(schema);
  return options.encode({ options, data });
}

/**
 * Parses an XML string, `XMLRoot`, or `XMLElement` into the **output type** of
 * `schema` (`z.output<S>`), running the full pipeline:
 * XML → `decode` → `schema.parse()`.
 *
 * `z.codec` transforms (e.g. string → Date) and default values are applied.
 * Use the lower-level {@link decode} if you need the raw input-type value without
 * running the Zod parse pipeline.
 */
export function parseXML<S extends z.ZodType>(
  schema: S,
  input: string | XMLRoot | XMLElement,
): z.output<S> {
  if (typeof input === "string") input = XML.parse(input);
  if (XML.isRoot(input)) input = XML.elementFromRoot(input);
  return schema.parse(decode(schema, input));
}

/**
 * Converts a value at the **output type** of `schema` (`z.output<S>`) into an
 * `XMLElement`, running the full pipeline: `schema.encode()` → `encode`.
 *
 * `z.codec` transforms are reversed before the XML adapter runs.
 * Use the lower-level {@link encode} if you already have an input-type value and
 * do not need to run the Zod encode pipeline.
 *
 * Does not accept nullable values — check for `null`/`undefined` before calling.
 */
export function toXML<S extends z.ZodType>(schema: S, data: z.output<S>): XMLElement {
  return encode(schema, schema.encode(data));
}

/**
 * Converts a value at the **output type** of `schema` (`z.output<S>`) into an
 * XML string, running the full pipeline: `schema.encode()` → `encode` → `XML.stringify`.
 *
 * Equivalent to `XML.stringify({ elements: [toXML(schema, data)] }, options)`.
 */
export function stringifyXML<S extends z.ZodType>(
  schema: S,
  data: z.output<S>,
  options?: StringifyOptions,
): string {
  return XML.stringify({ elements: [toXML(schema, data)] }, options);
}

type DefaultResolver<S extends z.ZodType = z.ZodType> = (schema: S) => CodecOptions<S> | void;

// FIXME:  calls to `normalizeCodecOptions` inside a default resolver could
// cause an infinite recursion (as resolveDefault can be lazily called if some options are missing)
// this should be prevented and/or detected
export function registerDefault(resolve: DefaultResolver) {
  defaults.push(resolve);
}

const defaults: DefaultResolver[] = [];

function resolveDefault<S extends z.ZodType>(schema: S) {
  for (let index = defaults.length - 1; index >= 0; index--) {
    const resolver = defaults[index];
    const res = resolver(schema);
    if (res) return res as CodecOptions<S>;
  }
}

registerDefault((schema) => {
  // array
  if (schema instanceof z.ZodArray) {
    const elSchema = schema.def.element;
    if (!isZodType(elSchema)) throw new Error(`Expected a ZodType, got ${elSchema}`);
    const elOptions = resolveCodecOptions(elSchema);
    const elHasOwnTagname = hasUserTagname(elSchema);
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        const { xml } = ctx;
        // FIXME: typescript should warn that xml is possibly null (it doesn't)
        if (!xml) return [];
        // expects elements to be wrapped in the children of `xml`
        return (xml.elements ?? [])
          .filter((el) => el.type === "element")
          .map((el) => elOptions.decode({ options: elOptions, xml: el }));
      },
      // FIXME: when encode method was missing typescript didn't complain
      encode(ctx) {
        const values = ctx.data;
        // FIXME: should not need this assertion, typescript should know we ctx.data is an array
        if (!Array.isArray(values)) throw new Error("expected array");
        // When elements have no explicit tagname, fall back to the array's own tagname.
        // This is needed for inline arrays where the property tagname must be applied
        // to each individual element (e.g. xml.prop(z.array(z.string()), { inline: true, tagname: "chapter" })).
        const elOptsForEncode = elHasOwnTagname
          ? elOptions
          : { ...elOptions, tagname: ctx.options.tagname };
        return {
          type: "element",
          name: ctx.options.tagname(ctx),
          attributes: {},
          elements: values.map((v) =>
            elOptsForEncode.encode({ options: elOptsForEncode, data: v }),
          ),
        };
      },
    });
  }
  // wrapped
  if (schema instanceof z.ZodOptional) {
    const inner = schema.def.innerType;
    if (!isZodType(inner)) throw new Error(`Expected a ZodType, got ${inner}`);
    const innerOptions = resolveCodecOptions(inner);
    return normalizeCodecOptions(
      schema,
      {
        decode(ctx) {
          if (ctx.xml === null) return undefined;
          else return innerOptions.decode(ctx);
        },
        encode(ctx) {
          if (typeof ctx.data === "undefined")
            return {} as XMLElement; // equivalent of empty XML
          else return innerOptions.encode(ctx);
        },
        decodeAsProperty(ctx) {
          if (ctx.property.xml !== null) innerOptions.decodeAsProperty(ctx);
        },
        encodeAsProperty(ctx) {
          if (typeof ctx.property.value !== "undefined") innerOptions.encodeAsProperty(ctx);
        },
      },
      innerOptions,
    );
  }
  if (schema instanceof z.ZodDefault) {
    const { innerType: inner, defaultValue } = schema.def;
    if (!isZodType(inner)) throw new Error(`Expected a ZodType, got ${inner}`);
    const innerOptions = resolveCodecOptions(inner);
    const getDefault =
      typeof schema.def.defaultValue === "function" ? schema.def.defaultValue : () => defaultValue;
    return normalizeCodecOptions(
      schema,
      {
        decode(ctx) {
          if (!ctx.xml) return getDefault();
          else return innerOptions.decode(ctx);
        },
        encode(ctx) {
          return innerOptions.encode(ctx);
        },
      },
      innerOptions,
    );
  }
  if (schema instanceof z.ZodLazy) {
    const inner = schema.def.getter();
    if (!isZodType(inner)) throw new Error(`Expected a ZodType, got ${inner}`);
    // TODO: check that user options are not lost
    return resolveDefault(inner) as any;
  }
  if (schema instanceof z.ZodCodec) {
    const inSchema = schema.def.in;
    if (!isZodType(inSchema))
      throw new Error(`Expected schema.def.in to be a ZodType, got ${inSchema}`);
    // TODO: check that user options are not lost
    const inputCodecOptions = resolveCodecOptions(inSchema);
    return normalizeCodecOptions(
      schema,
      {
        decode({ xml }) {
          // Operate at the inSchema level only — return the raw decoded value without
          // applying the forward transform. The caller (fromXML via dataSchema.parse)
          // applies transforms as a separate layer after decode() completes.
          return inputCodecOptions.decode({ options: inputCodecOptions, xml });
        },
        encode(ctx) {
          // ctx.data is already at the inSchema level — the caller (toXML via dataSchema.encode)
          // has already applied all reverse transforms before calling encode().
          // Propagate the caller's tagname override so that a property-level tagname
          // (e.g. `xml.prop(Schema, { tagname: "audio-in" })`) is not silently replaced
          // by the schema's own root tagname (e.g. `xml.root({ tagname: "audio" })`).
          const innerOpts =
            ctx.options.tagname !== inputCodecOptions.tagname
              ? { ...inputCodecOptions, tagname: ctx.options.tagname }
              : inputCodecOptions;
          return innerOpts.encode({ options: innerOpts, data: ctx.data });
        },
      },
      inputCodecOptions,
    );
  }
  if (schema instanceof z.ZodLiteral) {
    // TODO: test with mixed types
    const values = schema.def.values;
    const valuesFromString = Object.fromEntries(values.map((v) => [v.toString(), v]));
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        const raw = XML.getContent(ctx.xml);
        if (!(raw in valuesFromString))
          throw new Error(`Could not retrieve literal value from string "${raw}"`);
        // FIXME: handle coercion for other types of literals
        return valuesFromString[raw];
      },
      encode(ctx) {
        return XML.fromContent(String(ctx.data), ctx.options.tagname(ctx));
      },
    });
  }
  // builtins
  // TODO: determine wether coercion should be built-in or handled by zod directly (see https://zod.dev/api?id=coercion)
  if (schema instanceof z.ZodString) {
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        return XML.getContent(ctx.xml);
      },
      encode(ctx) {
        return XML.fromContent(ctx.data, ctx.options.tagname(ctx));
      },
    });
  }
  if (schema instanceof z.ZodNumber) {
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        return Number(XML.getContent(ctx.xml));
      },
      encode(ctx) {
        return XML.fromContent(ctx.data.toString(), ctx.options.tagname(ctx));
      },
    });
  }
  if (schema instanceof z.ZodBoolean) {
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        return XML.getContent(ctx.xml) === "true";
      },
      encode(ctx) {
        return XML.fromContent(ctx.data.toString(), ctx.options.tagname(ctx));
      },
    });
  }
});

registerDefault(<S extends z.ZodObject>(schema: S) => {
  if (schema instanceof z.ZodObject) {
    const options = resolvePropertiesCodecOptions(schema);
    const stateKey = findXmlStateKey(schema.def.shape as Record<string, z.ZodType>);
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        const sequence: OrderEntry[] | undefined = stateKey ? [] : undefined;
        const result = {} as any;
        if (stateKey) result[stateKey] = { sequence };

        // build the base property decoding contexts (with tagname)
        // FIXME: typescript error
        // @ts-ignore
        const propContexts: {
          [K in keyof typeof options]: {
            name: K;
            options: CodecOptions<z.ZodType>;
            tagname: string;
            xml: XMLElement | null;
          };
        } = Object.fromEntries(
          Object.entries(options).map(([name, propOpts]) => {
            const tagname = propOpts.propertyTagname({ name, options: propOpts });
            return [
              name,
              {
                name,
                options: propOpts,
                tagname,
                // starts as a collection container; replaced with actual element or null after matching
                xml: { elements: [] } as unknown as XMLElement,
              },
            ];
          }),
        );

        // matching and ordering sequence
        const seenProperties = new Set<string>();
        for (const el of ctx.xml.elements) {
          if (el.type !== "element") continue;
          const matches: string[] = [];
          for (const prop in options) {
            const propCtx = propContexts[prop];
            if (options[prop].propertyMatch(el, propCtx)) {
              matches.push(prop);
              // propCtx.xml starts as a container { elements: [] } cast to XMLElement
              propCtx.xml.elements.push(el);
            }
          }
          if (!matches.length) {
            // element never matched, mark as unsupported
            if (sequence) sequence.push(el);
            continue;
          } else if (matches.length === 1) {
            // element matched exactly one property
            const propName = matches[0];
            if (seenProperties.has(propName)) {
              // more than one element matches a single property
              // this should only happen for inline arrays
              const prop = options[propName];
              if (!prop.inlineProperty)
                throw new Error(
                  "Matching multiple elements for a single property is only supported when `inlineProperty` is true",
                );
            } else {
              if (sequence) sequence.push(propName);
              seenProperties.add(propName);
            }
          } else {
            // element matched by more than one property, not supported
            throw new Error(
              `Same element was matched by multiple properties: ${matches.join(", ")}`,
            );
          }
        }
        // some properties that don't have matching elements in input will be omitted on decoding
        // then we add unmatched properties to the sequence so that they are not omitted on encoding
        for (const propName in options) {
          // TODO: should we use special ordering ?
          if (!seenProperties.has(propName) && sequence) sequence.push(propName);
        }

        // Convert each matched field
        for (const prop in options) {
          const o = options[prop];
          const propCtx = propContexts[prop];

          // ctx.xml is currently an XML root containing all matches
          // so nothing to do in inline mode
          if (!o.inlineProperty) {
            // when not in inline mode we only care about the (at most) single matched element
            const matches = propCtx.xml.elements as XMLElement[];
            if (matches.length === 0) propCtx.xml = null;
            else {
              assertSingleElement(matches);
              propCtx.xml = matches[0];
            }
          }

          try {
            o.decodeAsProperty({
              // @ts-ignore
              options: ctx.options,
              xml: ctx.xml,
              // @ts-ignore
              property: propCtx,
              result,
            });
          } catch (e) {
            rethrow(e, prop);
          }
        }

        // TODO: check that all property exist (not Partial anymore)

        return result as z.input<S>;
      },
      encode(ctx) {
        const { data } = ctx;
        const result: XMLElement = {
          type: "element",
          name: ctx.options.tagname(ctx),
          // already create the attributes record so `attr(...)` encoding handlers don't have to
          attributes: {},
          elements: [],
        };
        const sequence = stateKey
          ? ((data as any)[stateKey] as XMLState | undefined)?.sequence
          : undefined;
        const iterOrder = sequence ?? Object.keys(options);
        for (const item of iterOrder) {
          if (typeof item === "string") {
            const o = options[item];
            if (!o) {
              // TODO: proper error with more context
              throw new Error(`Failed to resolve property options for sequence item ${item}`);
            }
            try {
              o.encodeAsProperty({
                // FIXME should not need type casts
                options: ctx.options as CodecOptions<S>,
                data,
                property: {
                  name: item,
                  options: o,
                  tagname: o.propertyTagname({ name: item, options: o }),
                  value: (data as any)[item],
                },
                result,
              });
            } catch (e) {
              rethrow(e, item);
            }
          } else {
            // item is an unsupported element
            // insert in sequence order
            result.elements.push(item);
          }
        }
        return result;
      },
    });
  }
});

// ── helpers for union handlers ─────────────────────────────────────────────

/**
 * Recursively extracts the set of literal values from a schema,
 * unwrapping ZodCodec, ZodOptional, etc. as needed.
 */
function getLiteralValues(schema: z.ZodType): unknown[] {
  if (schema instanceof z.ZodLiteral) return schema.def.values;
  if (schema instanceof z.ZodCodec) return getLiteralValues(schema.def.in as z.ZodType);
  if (schema instanceof z.ZodOptional) return getLiteralValues(schema.def.innerType as z.ZodType);
  return [];
}

function formatReason(errors: any[]) {
  return errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
}

/**
 * Reads the discriminator field value from an XML element without a full decode.
 * Handles both XML-attribute discriminators (xml.attr) and child-element discriminators.
 */
function peekDiscriminatorValue(
  discriminator: string,
  propertyOptions: CodecOptions<z.ZodType>[],
  ctx: RootDecodingContext<any>,
): unknown {
  const errors: any[] = [];
  for (const options of propertyOptions) {
    try {
      const tagname = options.propertyTagname({ name: discriminator, options });
      const propCtx = {
        name: discriminator,
        options,
        tagname,
        // starts as a collection container; replaced with actual element or null after matching
        xml: { elements: [] } as XMLElement,
      };

      ctx.xml.elements.forEach((el) => {
        if (el.type !== "element") return;
        if (options.propertyMatch(el, propCtx)) {
          propCtx.xml.elements.push(el);
        }
      });
      // FIXME: this mostly duplicates code from above
      if (propCtx.xml.elements.length === 0) {
        // FIXME: this might be an error itself
        propCtx.xml = null;
      } else if (propCtx.xml.elements.length !== 1) {
        throw new Error("Matched multiple elements for a single property");
      } else {
        propCtx.xml = propCtx.xml.elements[0] as XMLElement;
      }

      const result = {};
      options.decodeAsProperty({
        options: ctx.options,
        xml: ctx.xml,
        // @ts-ignore
        property: propCtx,
        result,
      });
      return result[discriminator];
    } catch (e) {
      // FIXME: shouldn't we only catch ZodError and XMLCodecError ?
      errors.push(e);
    }
  }
  throw new XMLCodecError(`union: no option matched for decoding (${formatReason(errors)})`);
}

registerDefault((schema) => {
  // ── ZodDiscriminatedUnion — must be checked before ZodUnion (it extends it) ──
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const discriminator = schema.def.discriminator as string;
    const options = schema.def.options as z.ZodType[];

    // Build: discriminator value → codec options for the matching inSchema (ZodObject)
    const optionCodecs = new Map<unknown, CodecOptions<z.ZodType>>();

    const discriminatorSchemas: z.ZodType[] = [];

    for (const option of options) {
      // Unwrap ZodCodec (from model.schema()) to get the underlying ZodObject
      const inSchema = option instanceof z.ZodCodec ? (option.def.in as z.ZodType) : option;
      if (!(inSchema instanceof z.ZodObject))
        throw new TypeError(
          `Discriminated union members are supposed to be objects, got ${inSchema.type}`,
        );
      // FIXME: overrides in the properties options are not supported yet
      // we could get these options with `const propOptions = resolvePropertiesCodecOptions(inSchema)`
      // but then `propOptions[discriminator]` matches only a literal so we can't use only the first
      // propOptions[discriminator] and hope to get the discriminator value as it will fail every time parsed object is not the first
      // element of the union.
      const discriminatorSchema = inSchema.shape[discriminator];
      if (!discriminatorSchema)
        throw new TypeError(`Missing discriminator field "${discriminator}" in schema`);
      discriminatorSchemas.push(discriminatorSchema);
      const optCodec = resolveCodecOptions(inSchema);
      for (const val of getLiteralValues(discriminatorSchema)) {
        optionCodecs.set(val, optCodec);
      }
    }

    const discriminatorOptions = discriminatorSchemas.map(resolveCodecOptions);

    return normalizeCodecOptions(schema, {
      decode(ctx) {
        const { xml } = ctx;
        if (!xml) throw new XMLCodecError(`discriminated union requires an XML element`);
        const discValue = peekDiscriminatorValue(discriminator, discriminatorOptions, ctx);
        const matched = optionCodecs.get(discValue);
        if (!matched)
          throw new XMLCodecError(
            `no variant matched discriminator "${discriminator}" = "${String(discValue)}"`,
          );
        return matched.decode({ options: matched, xml });
      },
      encode(ctx) {
        const discValue = (ctx.data as Record<string, unknown>)[discriminator];
        const matched = optionCodecs.get(discValue);
        if (!matched)
          throw new XMLCodecError(
            `no variant matched discriminator "${discriminator}" = "${String(discValue)}"`,
          );
        return matched.encode({ options: matched, data: ctx.data });
      },
    });
  }

  // ── ZodUnion — try each option in order, return first success ──
  if (schema instanceof z.ZodUnion) {
    const options = schema.def.options as z.ZodType[];
    const codecOptions = options.map((option) => {
      const inSchema = option instanceof z.ZodCodec ? (option.def.in as z.ZodType) : option;
      return resolveCodecOptions(inSchema instanceof z.ZodObject ? inSchema : option);
    });

    return normalizeCodecOptions(schema, {
      decode(ctx) {
        const errors: any[] = [];
        for (const options of codecOptions) {
          try {
            return options.decode({ options, xml: ctx.xml });
          } catch (e) {
            // FIXME: shouldn't we only catch ZodError and XMLCodecError ?
            errors.push(e);
          }
        }
        throw new XMLCodecError(`union: no option matched for decoding (${formatReason(errors)})`);
      },
      encode(ctx) {
        const errors: any[] = [];
        for (const options of codecOptions) {
          try {
            return options.encode({ options, data: ctx.data });
          } catch (e) {
            // FIXME: shouldn't we only catch ZodError and XMLCodecError ?
            errors.push(e);
          }
        }
        throw new XMLCodecError(`union: no option matched for encoding (${formatReason(errors)})`);
      },
    });
  }
});

/**
 * Creates a `z.codec` that converts between an XML string and the **input type**
 * of `schema` (`z.input<S>`).
 *
 * The codec sits at the XML ↔ `z.input<S>` boundary only — it does not run Zod's
 * parse pipeline. `z.codec` transforms (e.g. string → Date) and class instantiation
 * are left to `schema.parse()` / `schema.encode()`, which you call separately if needed.
 *
 * Typical use: `xmlCodec(MyClass.dataSchema)` for standalone encode/decode without
 * going through the full `fromXML` / `toXMLString` class API.
 */
export function xmlCodec<S extends z.ZodType>(schema: S) {
  const codec = z.codec(z.string(), schema, {
    decode(xml) {
      const xmlRoot = XML.parse(xml);
      const xmlEl = XML.elementFromRoot(xmlRoot);
      return decode(schema, xmlEl);
    },
    encode(value) {
      const xmlEl = encode(schema, value as z.input<S>);
      return XML.stringify({ elements: [xmlEl] });
    },
  });
  return codec;
}
