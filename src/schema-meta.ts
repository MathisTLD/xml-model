import type { XMLElement } from "./types";
import { kebabCase } from "./util/kebab-case";
import { z } from "zod";

export interface XMLPropMeta {
  tagname?: string;
  inline?: boolean;
  ignore?: boolean;
  match?: string | RegExp | ((el: XMLElement) => boolean);
}

export interface XMLAttrMeta {
  name: string;
  ignore?: boolean;
}

export interface XMLRootMeta {
  tagname?: string;
}

// WeakMaps for metadata storage — avoids Zod version coupling
const propMetaMap = new WeakMap<z.ZodType, XMLPropMeta>();
const attrMetaMap = new WeakMap<z.ZodType, XMLAttrMeta>();
const rootMetaMap = new WeakMap<z.ZodType, XMLRootMeta>();

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
 * Attaches XMLPropMeta to a field schema (marks it as a child element field).
 * Also accepts an xmlModel class directly → calls Class.schema() to extract the ZodPipe.
 */
function prop<C extends AnyXmlModelClass>(
  cls: C,
  meta?: XMLPropMeta,
): z.ZodPipe<
  C["dataSchema"],
  z.ZodTransform<
    z.infer<C["dataSchema"]>,
    C extends abstract new (...args: any) => infer I ? I : never
  >
>;
function prop<S extends z.ZodType>(schema: S, meta?: XMLPropMeta): S;
function prop(schemaOrClass: z.ZodType | AnyXmlModelClass, meta: XMLPropMeta = {}): z.ZodType {
  if (isXmlModelClass(schemaOrClass)) {
    const pipeSchema = schemaOrClass.schema();
    propMetaMap.set(pipeSchema, meta);
    return pipeSchema;
  }
  propMetaMap.set(schemaOrClass as z.ZodType, meta);
  return schemaOrClass as z.ZodType;
}

/**
 * Attaches XMLAttrMeta to a field schema (marks it as an XML attribute field).
 */
function attr<S extends z.ZodType>(schema: S, meta: XMLAttrMeta): S {
  attrMetaMap.set(schema, meta);
  return schema;
}

/**
 * Attaches XMLRootMeta to an object schema (marks it as a root/wrapper element).
 */
function model<S extends z.ZodObject<any>>(schema: S, meta: XMLRootMeta = {}): S {
  rootMetaMap.set(schema, meta);
  return schema;
}

/** Namespace object for XML metadata helpers. */
export const xml = { prop, attr, model };

/**
 * Returns the XMLPropMeta for a schema, or an empty object if none is set.
 */
export function getXMLPropMeta(schema: z.ZodType): XMLPropMeta {
  return propMetaMap.get(schema) ?? {};
}

/**
 * Returns the XMLAttrMeta for a schema, or undefined if none is set.
 */
export function getXMLAttrMeta(schema: z.ZodType): XMLAttrMeta | undefined {
  return attrMetaMap.get(schema);
}

/**
 * Returns the XMLRootMeta for a schema, or an empty object if none is set.
 */
export function getXMLRootMeta(schema: z.ZodType): XMLRootMeta {
  return rootMetaMap.get(schema) ?? {};
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
  match: XMLPropMeta["match"],
  defaultTagname: string,
): (el: XMLElement) => boolean {
  if (!match) return (el) => el.name === defaultTagname;
  if (typeof match === "string") return (el) => el.name === match;
  if (match instanceof RegExp) return (el) => match.test(el.name ?? "");
  return match;
}
