import { z } from "zod";
import type {
  UserCodecOptions,
  CodecOptions,
  PropertyDecodingContext,
  PropertyEncodingContext,
} from "./codec";
import { XML, type XMLElement } from "./xml-js";
import { getParentSchema, isZodType } from "@/util/zod";
import { kebabCase } from "@/util/kebab-case";

const metaKey = "@@xml-model" as const;

// Augment Zod v4's GlobalMeta with a single namespaced key for all XML metadata.
// Use a loose stored type to avoid infinite type instantiation from recursive CodecOptions.
declare module "zod" {
  interface GlobalMeta {
    "@@xml-model"?: Record<string, unknown>;
  }
}

/** Merge `partial` into the schema's existing meta (shallow spread, no overwrite). */
function setMeta<S extends z.ZodType>(schema: S, partial: UserCodecOptions): S {
  const existing = schema.meta()?.[metaKey] ?? {};
  return schema.meta({ [metaKey]: { ...existing, ...partial } } as z.GlobalMeta) as S;
}

// ---------------------------------------------------------------------------
// Local parameter types (not exported — helpers map them to UserCodecOptions)
// ---------------------------------------------------------------------------

type UserRootOptions<S extends z.ZodType = z.ZodType> = {
  tagname?: string | UserCodecOptions<S>["tagname"];
  decode?: UserCodecOptions<S>["decode"];
  encode?: UserCodecOptions<S>["encode"];
};

type UserPropOptions = {
  tagname?: string | UserCodecOptions["propertyTagname"];
  inline?: boolean;
  match?: RegExp | ((el: XMLElement) => boolean);
  decode?: (ctx: PropertyDecodingContext, next: () => void) => void;
  encode?: (ctx: PropertyEncodingContext, next: () => void) => void;
};

function normalizePropOptions(options?: UserPropOptions): UserCodecOptions {
  if (!options) return {};
  const partial: UserCodecOptions = {};
  if (options.tagname !== undefined)
    partial.propertyTagname = options.tagname as UserCodecOptions["propertyTagname"];
  if (options.inline !== undefined) partial.inlineProperty = options.inline;
  if (options.match !== undefined)
    partial.propertyMatch = options.match as UserCodecOptions["propertyMatch"];
  if (options.decode !== undefined) {
    const userDecode = options.decode;
    partial.decodeAsProperty = function (ctx) {
      const next = () => {
        const val = ctx.property.options.decode({
          options: ctx.property.options,
          xml: ctx.property.xml,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctx.result as any)[ctx.property.name as string] = val;
      };
      userDecode(ctx, next);
    };
  }
  if (options.encode !== undefined) {
    const userEncode = options.encode;
    partial.encodeAsProperty = function (ctx) {
      const { property } = ctx;
      const next = () => {
        const optsWithTagname = {
          ...property.options,
          tagname: () => property.tagname,
        } as CodecOptions<z.ZodType>;
        const res = property.options.encode({
          options: optsWithTagname,
          data: property.value as z.output<z.ZodType>,
        });
        if (XML.isEmpty(res)) return;
        if (property.options.inlineProperty) {
          ctx.result.elements.push(
            ...res.elements.map((el) =>
              el.type === "element" ? { ...el, name: property.tagname } : el,
            ),
          );
        } else {
          ctx.result.elements.push({ ...res, name: property.tagname });
        }
      };
      userEncode(ctx, next);
    };
  }
  return partial;
}

// ---------------------------------------------------------------------------
// xml.root
// ---------------------------------------------------------------------------

export function root<S extends z.ZodType>(schema: S, options: UserRootOptions<S>): S;
export function root(options: UserRootOptions): z.GlobalMeta;
export function root<S extends z.ZodType>(
  optionsOrSchema: S | UserRootOptions,
  options?: UserRootOptions<S>,
) {
  if (isZodType(optionsOrSchema)) {
    return setMeta(optionsOrSchema, options ?? {});
  } else {
    return { [metaKey]: optionsOrSchema } as z.GlobalMeta;
  }
}

// ---------------------------------------------------------------------------
// xml.prop
// ---------------------------------------------------------------------------

/**
 * Annotate a field schema with XML child-element options.
 *
 * **`xml.prop()` with no options is a no-op.** The codec already iterates all
 * ZodObject fields and defaults the tag name to `kebabCase(fieldKey)`. Wrap a
 * schema in `xml.prop()` only when you need to customise at least one of:
 * `tagname`, `inline`, `match`, `decode`, or `encode`.
 *
 * @example
 * // ✅ Needed — custom tagname
 * xml.prop(z.string(), { tagname: "pub-date" })
 *
 * // ✅ Needed — inline (children promoted to parent)
 * xml.prop(z.array(ItemSchema), { inline: true })
 *
 * // ⚠️  Redundant — equivalent to plain z.string()
 * xml.prop(z.string())
 */
export function prop<PS extends z.ZodType>(schema: PS, options: UserPropOptions): PS;
export function prop(options: UserPropOptions): z.GlobalMeta;
export function prop<PS extends z.ZodType>(
  optionsOrSchema: PS | UserPropOptions,
  options?: UserPropOptions,
) {
  if (isZodType(optionsOrSchema)) {
    return setMeta(optionsOrSchema, normalizePropOptions(options));
  } else {
    return { [metaKey]: normalizePropOptions(optionsOrSchema) } as z.GlobalMeta;
  }
}

// ---------------------------------------------------------------------------
// xml.attr
// ---------------------------------------------------------------------------

type AttributePropOptions = {
  /**
   * XML attribute name. Defaults to the field key in kebab-case (the same
   * conversion applied to child element tag names). Omit `name` when the
   * attribute name is already the kebab-cased field key.
   *
   * @example
   * // field key "vin" → attribute "vin" — no name needed
   * vin: xml.attr(z.string())
   *
   * // field key "vehicleId" → attribute "vehicle-id" — no name needed (kebab-case default)
   * vehicleId: xml.attr(z.string())
   *
   * // field key "vehicleId" → attribute "vehicle" — name required to override
   * vehicleId: xml.attr(z.string(), { name: "vehicle" })
   */
  name?: string;
};

export function attr<PS extends z.ZodType>(schema: PS, options?: AttributePropOptions): PS;
export function attr(options?: AttributePropOptions): z.GlobalMeta;
export function attr<PS extends z.ZodType>(
  optionsOrSchema?: PS | AttributePropOptions,
  options?: AttributePropOptions,
) {
  const opts = isZodType(optionsOrSchema) ? (options ?? {}) : (optionsOrSchema ?? {});
  const partial: UserCodecOptions = {
    decodeAsProperty(ctx) {
      const { options: propOptions } = ctx.property;
      const attrName = opts.name ?? kebabCase(ctx.property.name);
      const attrValue = ctx.xml?.attributes?.[attrName];
      // TODO: document: the schema is responsible for coercion
      ctx.result[ctx.property.name] = propOptions.schema.parse(attrValue);
    },
    encodeAsProperty(ctx) {
      const { value } = ctx.property;
      const attrName = opts.name ?? kebabCase(ctx.property.name);
      // TODO: throw error if attribute already set?
      ctx.result.attributes[attrName] = value.toString();
    },
  };
  if (isZodType(optionsOrSchema)) {
    return setMeta(optionsOrSchema, partial);
  } else {
    return { [metaKey]: partial } as z.GlobalMeta;
  }
}

// ---------------------------------------------------------------------------
// Namespace export + getUserOptions
// ---------------------------------------------------------------------------

/** Namespace object for XML metadata helpers. */
export const xml = { root, prop, attr };

export function getOwnUserOptions<S extends z.ZodType>(schema: S): UserCodecOptions<S> {
  const meta = schema.meta();
  return (meta?.[metaKey] ?? {}) as UserCodecOptions<S>;
}

// Only these fields propagate upward through wrapper schemas (ZodOptional, ZodDefault, etc.).
// decode/encode intentionally excluded: they stay at the schema level where they were defined,
// letting wrapper types (optional null-check, default value) apply before delegating downward.
const INHERITABLE_KEYS = [
  "tagname",
  "propertyTagname",
  "inlineProperty",
  "propertyMatch",
  "decodeAsProperty",
  "encodeAsProperty",
] as const satisfies ReadonlyArray<keyof UserCodecOptions>;

export function getUserOptions<S extends z.ZodType>(schema: S): UserCodecOptions<S> {
  const own = getOwnUserOptions(schema);
  const parentSchema = getParentSchema(schema);
  if (!parentSchema) return own;
  const parentOptions = getUserOptions(parentSchema);
  const inherited: UserCodecOptions = {};
  for (const key of INHERITABLE_KEYS) {
    if (parentOptions[key] !== undefined && own[key] === undefined)
      (inherited as any)[key] = parentOptions[key];
  }
  return { ...inherited, ...own } as UserCodecOptions<S>;
}
