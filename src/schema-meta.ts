import type { XMLElement } from "./types";
import { kebabCase } from "./util/kebab-case";
import { z } from "zod";

// Augment Zod v4's GlobalMeta to include our XML metadata keys
declare module "zod" {
  interface GlobalMeta {
    xml?: XMLFieldMeta;
    xmlRoot?: XMLRootMeta;
  }
}

/**
 * Unified field-level XML metadata.
 * - `attr` present → field is an XML attribute with that name
 * - `attr` absent  → field is a child element
 */
export interface XMLFieldMeta {
  attr?: string;
  tagname?: string;
  inline?: boolean;
  ignore?: boolean;
  match?: string | RegExp | ((el: XMLElement) => boolean);
}

export interface XMLRootMeta {
  tagname?: string;
}

type AnyXmlModelClass = {
  dataSchema: z.ZodObject<any>;
  schema(): z.ZodPipe<any, any>;
  new (data: any): any;
};

function isXmlModelClass(v: unknown): v is AnyXmlModelClass {
  return (
    typeof v === "function" &&
    v !== null &&
    "dataSchema" in v &&
    (v as any).dataSchema instanceof z.ZodObject
  );
}

/**
 * Attaches XMLFieldMeta to a field schema (marks it as a child element field).
 * Also accepts an xmlModel class directly → calls Class.schema() to extract the ZodPipe.
 */
function prop<C extends AnyXmlModelClass>(
  cls: C,
  meta?: XMLFieldMeta,
): z.ZodPipe<
  C["dataSchema"],
  z.ZodTransform<
    z.infer<C["dataSchema"]>,
    C extends abstract new (...args: any) => infer I ? I : never
  >
>;
function prop<S extends z.ZodType>(schema: S, meta?: XMLFieldMeta): S;
function prop(schemaOrClass: z.ZodType | AnyXmlModelClass, meta: XMLFieldMeta = {}): z.ZodType {
  if (isXmlModelClass(schemaOrClass)) {
    return schemaOrClass.schema().meta({ xml: meta });
  }
  return (schemaOrClass as z.ZodType).meta({ xml: meta });
}

/**
 * Attaches attribute metadata to a field schema (marks it as an XML attribute field).
 */
function attr<S extends z.ZodType>(schema: S, meta: { name: string; ignore?: boolean }): S {
  return schema.meta({ xml: { attr: meta.name, ignore: meta.ignore } });
}

/**
 * Attaches XMLRootMeta to an object schema (marks it as a root/wrapper element).
 */
function model<S extends z.ZodObject<any>>(schema: S, meta: XMLRootMeta = {}): S {
  return schema.meta({ xmlRoot: meta });
}

/** Namespace object for XML metadata helpers. */
export const xml = { prop, attr, model };

/**
 * Returns the XMLFieldMeta for a schema (element fields only), or an empty object if none is set.
 */
export function getXMLPropMeta(schema: z.ZodType): XMLFieldMeta {
  return z.globalRegistry.get(schema)?.xml ?? {};
}

/**
 * Returns the attribute metadata for a schema, or undefined if it is not an attribute field.
 * Maps internal `attr` key → external `name` for backward-compat with codec.ts.
 */
export function getXMLAttrMeta(schema: z.ZodType): { name: string; ignore?: boolean } | undefined {
  const m = z.globalRegistry.get(schema)?.xml;
  return m?.attr !== undefined ? { name: m.attr, ignore: m.ignore } : undefined;
}

/**
 * Returns the XMLRootMeta for a schema, or an empty object if none is set.
 */
export function getXMLRootMeta(schema: z.ZodType): XMLRootMeta {
  return z.globalRegistry.get(schema)?.xmlRoot ?? {};
}

/**
 * Derives the XML tag name for a property.
 * Uses the explicit tagname from meta if provided, otherwise:
 * - For inline arrays, falls back to the element schema's root tagname (if any)
 * - Otherwise converts fieldName to kebab-case.
 */
export function getPropTagname(fieldName: string, schema: z.ZodType): string {
  const meta = getXMLPropMeta(schema);
  if (meta.tagname) return meta.tagname;
  if (meta.inline && schema instanceof z.ZodArray) {
    const elementTagname = getRootTagname(schema.def.element);
    if (elementTagname) return elementTagname;
  }
  return kebabCase(fieldName);
}

/**
 * Derives the XML tag name for a root element.
 * Returns the tagname from meta, or empty string if not set.
 * Unwraps ZodPipe to find the inner ZodObject's metadata.
 */
export function getRootTagname(schema: z.ZodType): string {
  if (schema instanceof z.ZodPipe) return getRootTagname(schema.def.in);
  return getXMLRootMeta(schema).tagname ?? "";
}

/**
 * Resolves the `match` option to a predicate function.
 * Falls back to exact tag name equality using `defaultTagname`.
 */
export function resolveMatchFn(
  match: XMLFieldMeta["match"],
  defaultTagname: string,
): (el: XMLElement) => boolean {
  if (!match) return (el) => el.name === defaultTagname;
  if (typeof match === "string") return (el) => el.name === match;
  if (match instanceof RegExp) return (el) => match.test(el.name ?? "");
  return match;
}
