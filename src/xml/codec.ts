import { z } from "zod";
import { XML, type XMLElement } from "./xml-js";
import { getUserOptions, prop } from "./schema-meta";
import { kebabCase } from "@/util/kebab-case";
import { isZodType } from "@/util/zod";

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

// a key for both input and output of schema
// FIXME: this might not work depending on transforms (we should disallow transforms that remove properties)
type PropKey<S extends z.ZodObject> = keyof z.input<S> & keyof z.output<S> & string;

export interface CodecOptions<S extends z.ZodType> {
  schema: S;
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
  data: z.output<S>;
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
    value: z.output<S>[K];
  };
  result: XMLElement;
}

export function normalizeCodecOptions<S extends z.ZodType>(
  schema: S,
  options: UserCodecOptions<S> = {},
): CodecOptions<S> {
  let _defaultOptions: CodecOptions<S>;
  const defaultOptions = () => {
    // FIXME: this could cause infinite recursion
    if (!_defaultOptions) {
      _defaultOptions = resolveDefault(schema);
      if (!_defaultOptions) {
        // TODO: dedicated exception
        throw new Error(
          `Failed to resolve default codec options for schema of type ${schema.type}`,
        );
      }
    }
    return _defaultOptions;
  };

  const userTagname = options.tagname;
  const tagname: CodecOptions<S>["tagname"] =
    typeof userTagname === "string"
      ? () => userTagname
      : typeof userTagname === "function"
        ? userTagname
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
        : (ctx) => kebabCase(ctx.name);

  const inlineProperty = options.inlineProperty ?? false;

  const userMatch = options.propertyMatch;
  const propertyMatch: CodecOptions<S>["propertyMatch"] =
    userMatch instanceof RegExp
      ? (el) => (userMatch as RegExp).test(el.name)
      : typeof userMatch === "function"
        ? userMatch
        : (el, ctx) => el.name === ctx.tagname;

  const decode: CodecOptions<S>["decode"] = options.decode
    ? (ctx) => options.decode!(ctx, () => defaultOptions().decode(ctx))
    : (ctx) => defaultOptions().decode(ctx);
  const encode: CodecOptions<S>["encode"] = options.encode
    ? (ctx) => options.encode!(ctx, () => defaultOptions().encode(ctx))
    : (ctx) => defaultOptions().encode(ctx);

  // Self-referential — closures capture `result` so the default
  // decodeAsProperty/encodeAsProperty can call the schema's own decode/encode.
  const result: CodecOptions<S> = {
    schema,
    tagname,
    decode,
    encode,
    propertyTagname,
    inlineProperty,
    propertyMatch,
    decodeAsProperty:
      options.decodeAsProperty ??
      function (ctx) {
        const res = result.decode({ options: result, xml: ctx.property.xml });
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
          data: property.value as unknown as z.output<S>,
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

  const userOpts = getUserOptions(schema);
  const options = normalizeCodecOptions(schema, userOpts);
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

/**
 * String key used to store XML round-trip state on decoded data objects.
 * Using a string (rather than a Symbol) allows Zod's schema.parse() to
 * preserve it naturally when the key is included in the schema via xmlStateSchema().
 */
export const XML_STATE_KEY = "__xml_state" as const;

/**
 * Schema for the XML round-trip state field.
 *
 * Include in your base model schema under `XML_STATE_KEY` to preserve element ordering
 * and unknown elements through Zod's `schema.parse()` for nested model instances.
 *
 * Pass `{ source: true }` to also record the original `XMLElement` on each instance.
 *
 * @example
 * class XMLBase extends xmlModel(z.object({
 *   [XML_STATE_KEY]: xmlStateSchema(),
 * }), { tagname: "base" }) {}
 *
 * // With source recording:
 * class XMLBase extends xmlModel(z.object({
 *   [XML_STATE_KEY]: xmlStateSchema({ source: true }),
 * }), { tagname: "base" }) {}
 */
export function xmlStateSchema(): z.ZodOptional<z.ZodCustom<XMLState>>;
export function xmlStateSchema(options: {
  source: true;
}): z.ZodOptional<z.ZodCustom<XMLState & { source: XMLElement }>>;
export function xmlStateSchema(options?: {
  source?: boolean;
}): z.ZodOptional<z.ZodCustom<XMLState>> {
  return prop(z.custom<XMLState>().optional(), {
    decode: options?.source
      ? (ctx, _next) => {
          ((ctx.result as any)[XML_STATE_KEY] ??= {}).source = ctx.xml;
        }
      : () => {},
    encode: () => {},
  }) as z.ZodOptional<z.ZodCustom<XMLState>>;
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

export function decode<S extends z.ZodType>(schema: S, xml: XMLElement): z.input<S> {
  const options = resolveCodecOptions(schema);
  return options.decode({ options, xml });
}

export function encode<S extends z.ZodType>(schema: S, data: z.output<S>): XMLElement {
  const options = resolveCodecOptions(schema);
  return options.encode({ options, data });
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
    const elHasOwnTagname = Boolean(getUserOptions(elSchema).tagname);
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        const { xml } = ctx;
        // FIXME: typescript should warn that xml is possibly null (it doesn't)
        if (!xml) return [];
        // expects elements to be wrapped in the children of `xml`
        return xml.elements
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
    return normalizeCodecOptions(schema, {
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
    });
  }
  if (schema instanceof z.ZodDefault) {
    const { innerType: inner, defaultValue } = schema.def;
    if (!isZodType(inner)) throw new Error(`Expected a ZodType, got ${inner}`);
    const innerOptions = resolveCodecOptions(inner);
    const getDefault =
      typeof schema.def.defaultValue === "function" ? schema.def.defaultValue : () => defaultValue;
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        if (!ctx.xml) return getDefault();
        else return innerOptions.decode(ctx);
      },
      encode(ctx) {
        return innerOptions.encode(ctx);
      },
    });
  }
  if (schema instanceof z.ZodLazy) {
    const inner = schema.def.getter();
    if (!isZodType(inner)) throw new Error(`Expected a ZodType, got ${inner}`);
    // TODO: check that user options are not lost
    return resolveDefault(inner) as any;
  }
  if (schema instanceof z.ZodCodec) {
    const inSchema = schema.def.in;
    const outSchema = schema.def.out;
    if (!isZodType(inSchema))
      throw new Error(`Expected schema.def.in to be a ZodType, got ${inSchema}`);
    if (!isZodType(outSchema))
      throw new Error(`Expected schema.def.out to be a ZodType, got ${outSchema}`);
    // TODO: check that user options are not lost
    const inputCodecOptions = resolveCodecOptions(inSchema);
    return normalizeCodecOptions(schema, {
      decode({ xml }) {
        const input = inputCodecOptions.decode({ options: inputCodecOptions, xml });
        // FIXME: is this the correct behavior ?
        return schema.def.transform(input, { value: input, issues: [] });
      },
      encode(ctx) {
        // `schema.encode would recursively re-encode child classes`
        // as we only wanna re-encode the top level we should use `outSchema.encode` instead
        const data = outSchema.encode(ctx.data);
        // Propagate the caller's tagname override so that a property-level tagname
        // (e.g. `xml.prop(Schema, { tagname: "audio-in" })`) is not silently replaced
        // by the schema's own root tagname (e.g. `xml.root({ tagname: "audio" })`).
        const innerOpts =
          ctx.options.tagname !== inputCodecOptions.tagname
            ? { ...inputCodecOptions, tagname: ctx.options.tagname }
            : inputCodecOptions;
        return innerOpts.encode({ options: innerOpts, data });
      },
    });
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
    return normalizeCodecOptions(schema, {
      decode(ctx) {
        const sequence: OrderEntry[] = [];
        const result: Partial<z.input<S>> & { [XML_STATE_KEY]: XMLState } = {
          [XML_STATE_KEY]: { sequence },
        } as any;

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
            sequence.push(el);
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
              sequence.push(propName);
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
          if (!seenProperties.has(propName)) sequence.push(propName);
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

          o.decodeAsProperty({
            // @ts-ignore
            options: ctx.options,
            xml: ctx.xml,
            // @ts-ignore
            property: propCtx,
            result,
          });
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
        const sequence =
          ((data as any)[XML_STATE_KEY] as XMLState | undefined)?.sequence ?? Object.keys(options);
        for (const item of sequence) {
          if (typeof item === "string") {
            const o = options[item];
            if (!o) {
              // TODO: proper error with more context
              throw new Error(`Failed to resolve property options for sequence item ${item}`);
            }
            o.encodeAsProperty({
              // FIXME should not need type casts
              options: ctx.options as CodecOptions<S>,
              data: data as z.output<S>,
              property: {
                name: item,
                options: o,
                tagname: o.propertyTagname({ name: item, options: o }),
                value: (data as any)[item],
              },
              result,
            });
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

export function xmlCodec<S extends z.ZodType>(schema: S) {
  const codec = z.codec(z.string(), schema, {
    decode(xml) {
      const xmlRoot = XML.parse(xml);
      const xmlEl = XML.elementFromRoot(xmlRoot);
      return decode(schema, xmlEl);
    },
    encode(value) {
      // FIXME: here `value` has already been encoded into the input type of `schema`
      // in particular, classes have been recursively transformed into they input data
      // this prevents re-serialization to work correctly as the schemas currently expect instances
      // and not objects
      const xmlEl = encode(
        schema,
        // FIXME: value is expected to be of type input<S>
        // so `schema` should be able or re-encoding its output
        value as z.output<S>,
      );
      return XML.stringify({ elements: [xmlEl] });
    },
  });
  return codec;
}
