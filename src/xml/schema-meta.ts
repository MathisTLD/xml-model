import type { XMLElement } from "./types";
import { kebabCase } from "../util/kebab-case";
import { z } from "zod";

const metaKey = "@@xml-model" as const;

// Augment Zod v4's GlobalMeta with a single namespaced key for all XML metadata.
declare module "zod" {
  interface GlobalMeta {
    [metaKey]?: XMLMeta;
  }
}

/**
 * All XML metadata for a schema, used by both field-level and root-level helpers.
 * - `attr` present → field is an XML attribute with that name
 * - `attr` absent  → field is a child element
 * - `tagname`      → explicit XML tag name (root element or field element)
 */
export interface XMLMeta {
  attr?: string;
  tagname?: string;
  inline?: boolean;
  ignore?: boolean;
  match?: string | RegExp | ((el: XMLElement) => boolean);
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
 * Attaches XMLMeta to a field schema (marks it as a child element field).
 * Also accepts an xmlModel class directly → calls Class.schema() to extract the ZodPipe.
 */
function prop<C extends AnyXmlModelClass>(
  cls: C,
  meta?: XMLMeta,
): z.ZodPipe<
  C["dataSchema"],
  z.ZodTransform<
    z.infer<C["dataSchema"]>,
    C extends abstract new (...args: any) => infer I ? I : never
  >
>;
function prop<S extends z.ZodType>(schema: S, meta?: XMLMeta): S;
function prop(schemaOrClass: z.ZodType | AnyXmlModelClass, meta: XMLMeta = {}): z.ZodType {
  if (isXmlModelClass(schemaOrClass)) {
    return schemaOrClass.schema().meta({ [metaKey]: meta });
  }
  return schemaOrClass.meta({ [metaKey]: meta });
}

/**
 * Attaches attribute metadata to a field schema (marks it as an XML attribute field).
 */
function attr<S extends z.ZodType>(schema: S, meta: { name: string; ignore?: boolean }): S {
  return schema.meta({ [metaKey]: { attr: meta.name, ignore: meta.ignore } });
}

/**
 * Two forms:
 * - `xml.model(schema, meta?)` — attaches XMLMeta to a schema (used in xmlModel() internals)
 * - `xml.model(meta)` — returns a GlobalMeta partial for use as the second arg to `.extend()`
 *
 * @example
 * class Car extends Vehicle.extend({ doors: xml.prop(z.number()) }, xml.model({ tagname: "car" })) {}
 */
function model(meta: XMLMeta): { [metaKey]?: XMLMeta };
function model<S extends z.ZodObject<any>>(schema: S, meta?: XMLMeta): S;
function model(
  schemaOrMeta: z.ZodObject<any> | XMLMeta,
  meta: XMLMeta = {},
): z.ZodObject<any> | { [metaKey]?: XMLMeta } {
  if (schemaOrMeta instanceof z.ZodObject) {
    return schemaOrMeta.meta({ [metaKey]: meta });
  }
  return { [metaKey]: schemaOrMeta };
}

/** Namespace object for XML metadata helpers. */
export const xml = { prop, attr, model };

/**
 * Returns the XMLMeta for a schema, or an empty object if none is set.
 */
export function getXMLMeta(schema: z.core.$ZodType): XMLMeta {
  // FIXME: why do we need as `as` ?
  return (z.globalRegistry.get(schema)?.[metaKey] as XMLMeta | undefined) ?? {};
}

/**
 * Returns the attribute metadata for a schema, or undefined if it is not an attribute field.
 */
export function getXMLAttrMeta(
  schema: z.core.$ZodType,
): { name: string; ignore?: boolean } | undefined {
  const m = getXMLMeta(schema);
  return m.attr !== undefined ? { name: m.attr, ignore: m.ignore } : undefined;
}

/**
 * Derives the XML tag name for a property.
 * Uses the explicit tagname from meta if provided, otherwise:
 * - For inline arrays, falls back to the element schema's root tagname (if any)
 * - Otherwise converts fieldName to kebab-case.
 */
export function getPropTagname(fieldName: string, schema: z.core.$ZodType): string {
  const meta = getXMLMeta(schema);
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
export function getRootTagname(schema: z.core.$ZodType): string {
  if (schema instanceof z.ZodPipe) return getRootTagname(schema.def.in);
  return getXMLMeta(schema).tagname ?? "";
}

/**
 * Resolves the `match` option to a predicate function.
 * Falls back to exact tag name equality using `defaultTagname`.
 */
export function resolveMatchFn(
  match: XMLMeta["match"],
  defaultTagname: string,
): (el: XMLElement) => boolean {
  if (!match) return (el) => el.name === defaultTagname;
  if (typeof match === "string") return (el) => el.name === match;
  if (match instanceof RegExp) return (el) => match.test(el.name ?? "");
  return match;
}
