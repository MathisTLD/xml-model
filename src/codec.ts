import { z } from "zod";
import type { XMLAttributes, XMLElement, XMLRoot } from "./types";
import XML from "./xml";
import { XMLValidationError } from "./errors";
import {
  getXMLAttrMeta,
  getXMLPropMeta,
  getPropTagname,
  getRootTagname,
  resolveMatchFn,
  type XMLFieldMeta,
} from "./schema-meta";
import type { Options } from "xml-js";

/**
 * Non-enumerable Symbol attached to parsed objects.
 * Stores the original document sequence as (string | XMLElement)[]:
 *   - string    → field name (known field, first occurrence sets position)
 *   - XMLElement → unknown element, stored verbatim for passthrough
 */
export const FIELD_ORDER = Symbol("xml-model.fieldOrder");

/**
 * Non-enumerable Symbol storing the original root element's attributes,
 * so they survive a fromXML → toXML round-trip even if no schema field maps to them.
 */
export const ROOT_ATTRS = Symbol("xml-model.rootAttrs");

type OrderEntry = string | XMLElement;

export interface XMLCodec<T> {
  fromXML(xml: string | XMLRoot): T;
  toXML(value: T): XMLRoot;
  toXMLString(value: T, options?: Options.JS2XML): string;
}

// Cache codecs by schema instance to avoid rebuilding
const codecCache = new WeakMap<z.ZodType, XMLCodec<any>>();

/**
 * Returns a cached codec for the given ZodObject schema.
 */
export function xmlCodec<S extends z.ZodObject<any>>(schema: S): XMLCodec<z.infer<S>> {
  if (codecCache.has(schema)) return codecCache.get(schema)!;
  const codec = buildCodec(schema);
  codecCache.set(schema, codec);
  return codec;
}

function buildCodec<S extends z.ZodObject<any>>(schema: S): XMLCodec<z.infer<S>> {
  return {
    fromXML: buildFromXML(schema),
    toXML: buildToXML(schema),
    toXMLString(value, options?: Options.JS2XML) {
      return XML.stringify(this.toXML(value), options);
    },
  };
}

function coerceAttrValue(raw: string, schema: z.ZodType): unknown {
  if (schema instanceof z.ZodNumber) return Number(raw);
  if (schema instanceof z.ZodBoolean) return raw === "true";
  if (schema instanceof z.ZodOptional) return coerceAttrValue(raw, schema.def.innerType);
  return raw;
}

// Internal fromXML that skips root unwrapping — used for nested object schemas
function _fromInner<S extends z.ZodObject<any>>(
  schema: S,
  innerEls: XMLElement[],
  rootAttributes?: XMLAttributes,
): z.infer<S> {
  const shape = schema.def.shape as Record<string, z.ZodType>;

  // Build matcher list for non-ignored, non-attr fields
  const matchers: Array<{ fieldName: string; test: (el: XMLElement) => boolean }> = [];
  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const meta = getXMLPropMeta(fieldSchema);
    if (meta.ignore) continue;
    const attrMeta = getXMLAttrMeta(fieldSchema);
    if (attrMeta) continue; // attribute fields don't match elements
    const tagname = getPropTagname(fieldName, fieldSchema);
    const test = resolveMatchFn(meta.match, tagname);
    matchers.push({ fieldName, test });
  }

  const raw: Record<string, XMLElement[]> = {};
  const sequence: OrderEntry[] = [];
  const seenFields = new Set<string>();

  for (const el of innerEls) {
    if (el.type !== "element") continue; // skip text nodes etc.
    const match = matchers.find((m) => m.test(el));
    if (!match) {
      sequence.push(el);
      continue;
    }
    const { fieldName } = match;
    if (!raw[fieldName]) raw[fieldName] = [];
    raw[fieldName].push(el);
    if (!seenFields.has(fieldName)) {
      seenFields.add(fieldName);
      sequence.push(fieldName);
    }
  }

  // Convert each matched field
  const result: Record<string, unknown> = {};
  for (const fieldName of seenFields) {
    const fieldSchema = shape[fieldName];
    result[fieldName] = convertFromXML(
      fieldSchema,
      raw[fieldName] ?? [],
      getXMLPropMeta(fieldSchema),
    );
  }

  // Read xml.attr fields from root element attributes
  if (rootAttributes) {
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const attrMeta = getXMLAttrMeta(fieldSchema);
      if (!attrMeta || attrMeta.ignore) continue;
      const attrValue = rootAttributes[attrMeta.name];
      if (attrValue !== undefined) {
        result[fieldName] = coerceAttrValue(String(attrValue), fieldSchema);
      }
    }
  }

  // Validate with Zod
  let validated: z.infer<S>;
  try {
    validated = schema.parse(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new XMLValidationError(err, result);
    }
    throw err;
  }

  // Attach non-enumerable sequence metadata
  Object.defineProperty(validated, FIELD_ORDER, {
    value: sequence,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return validated;
}

function buildFromXML<S extends z.ZodObject<any>>(schema: S) {
  return function fromXML(xml: string | XMLRoot): z.infer<S> {
    const root = typeof xml === "string" ? XML.parse(xml) : xml;
    const rootTagname = getRootTagname(schema);

    let innerEls: XMLElement[];
    let rootEl: XMLElement | undefined;

    if (rootTagname) {
      rootEl = root.elements[0];
      innerEls = rootEl?.elements ?? [];
    } else {
      innerEls = root.elements;
    }

    const validated = _fromInner(schema, innerEls, rootEl?.attributes);

    // Attach root element attributes for round-trip preservation
    if (rootEl?.attributes) {
      Object.defineProperty(validated, ROOT_ATTRS, {
        value: rootEl.attributes,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }

    return validated;
  };
}

/**
 * Converts a list of XML elements into a typed value using the given schema.
 */
function convertFromXML(schema: z.ZodType, elements: XMLElement[], meta: XMLFieldMeta): unknown {
  if (schema instanceof z.ZodOptional) {
    if (elements.length === 0) return undefined;
    return convertFromXML(schema.def.innerType, elements, meta);
  }

  if (schema instanceof z.ZodLazy) {
    return convertFromXML(schema.def.getter(), elements, meta);
  }

  if (schema instanceof z.ZodArray) {
    const elementSchema = schema.def.element;
    if (meta.inline) {
      // Each element in the list is one array item
      return elements.map((el) => convertSingleFromXML(elementSchema, el));
    } else {
      // elements[0] is a wrapper element; its children are the items
      const wrapper = elements[0];
      const children = wrapper?.elements ?? [];
      return children
        .filter((el) => el.type === "element")
        .map((el) => convertSingleFromXML(elementSchema, el));
    }
  }

  if (schema instanceof z.ZodPipe) {
    const inner = schema.def.in as z.ZodObject<any>;
    const el = elements[0];
    return _fromInner(inner, el?.elements ?? [], el?.attributes);
  }

  if (schema instanceof z.ZodObject) {
    return _fromInner(schema, elements[0]?.elements ?? [], elements[0]?.attributes);
  }

  if (schema instanceof z.ZodString) {
    return String(XML.getContent(elements[0]) ?? "");
  }

  if (schema instanceof z.ZodNumber) {
    return Number(XML.getContent(elements[0]));
  }

  if (schema instanceof z.ZodBoolean) {
    return XML.getContent(elements[0]) === "true";
  }

  return undefined;
}

/**
 * Converts a single XML element into a value using the given schema.
 * Used for array items and nested object fields.
 */
function convertSingleFromXML(schema: z.ZodType, el: XMLElement): unknown {
  if (schema instanceof z.ZodLazy) {
    return convertSingleFromXML(schema.def.getter(), el);
  }

  if (schema instanceof z.ZodPipe) {
    const inner = schema.def.in as z.ZodObject<any>;
    return _fromInner(inner, el.elements ?? [], el.attributes);
  }

  if (schema instanceof z.ZodObject) {
    return _fromInner(schema, el.elements ?? [], el.attributes);
  }

  if (schema instanceof z.ZodString) {
    return String(XML.getContent(el) ?? "");
  }

  if (schema instanceof z.ZodNumber) {
    return Number(XML.getContent(el));
  }

  if (schema instanceof z.ZodBoolean) {
    return XML.getContent(el) === "true";
  }

  if (schema instanceof z.ZodOptional) {
    return convertSingleFromXML(schema.def.innerType, el);
  }

  return undefined;
}

function buildToXML<S extends z.ZodObject<any>>(schema: S) {
  return function toXML(value: z.infer<S>): XMLRoot {
    const rootTagname = getRootTagname(schema);
    const shape = schema.def.shape as Record<string, z.ZodType>;
    const children: XMLElement[] = [];
    const attrs: XMLAttributes = {
      ...(value as any)[ROOT_ATTRS],
    };

    // Collect xml.attr fields
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const attrMeta = getXMLAttrMeta(fieldSchema);
      if (!attrMeta || attrMeta.ignore) continue;
      const fieldValue = (value as any)[fieldName];
      if (fieldValue !== undefined) attrs[attrMeta.name] = String(fieldValue);
    }

    // Use FIELD_ORDER sequence when available (document order + unknown passthrough)
    // Fall back to schema key order for hand-crafted objects
    const sequence: OrderEntry[] =
      (value as any)[FIELD_ORDER] ??
      Object.keys(shape).filter((k) => {
        const fs = shape[k];
        return !getXMLPropMeta(fs).ignore && !getXMLAttrMeta(fs);
      });

    const emitted = new Set<string>();

    for (const entry of sequence) {
      if (typeof entry !== "string") {
        // Unknown element — re-emit verbatim
        children.push(entry as XMLElement);
        continue;
      }

      const fieldName = entry;
      if (emitted.has(fieldName)) continue;
      emitted.add(fieldName);

      const fieldSchema = shape[fieldName];
      if (!fieldSchema) continue;
      const propMeta = getXMLPropMeta(fieldSchema);
      if (propMeta.ignore) continue;
      const attrMeta = getXMLAttrMeta(fieldSchema);
      if (attrMeta) continue; // handled above

      const tagname = getPropTagname(fieldName, fieldSchema);
      const fieldValue = (value as any)[fieldName];
      children.push(...convertToXML(fieldSchema, fieldValue, tagname, propMeta));
    }

    // Append any schema fields that weren't in the sequence (new fields)
    for (const fieldName of Object.keys(shape)) {
      if (emitted.has(fieldName)) continue;
      const fieldSchema = shape[fieldName];
      const propMeta = getXMLPropMeta(fieldSchema);
      if (propMeta.ignore) continue;
      const attrMeta = getXMLAttrMeta(fieldSchema);
      if (attrMeta) continue;
      const tagname = getPropTagname(fieldName, fieldSchema);
      const fieldValue = (value as any)[fieldName];
      children.push(...convertToXML(fieldSchema, fieldValue, tagname, propMeta));
      emitted.add(fieldName);
    }

    if (rootTagname) {
      const rootEl: XMLElement = { type: "element", name: rootTagname, elements: children };
      if (Object.keys(attrs).length) rootEl.attributes = attrs;
      return { elements: [rootEl] };
    } else {
      return { elements: children };
    }
  };
}

/**
 * Converts a typed value to a list of XMLElements using the given schema.
 */
function convertToXML(
  schema: z.ZodType,
  value: unknown,
  tagname: string,
  meta: XMLFieldMeta,
): XMLElement[] {
  if (schema instanceof z.ZodOptional) {
    if (value === undefined) return [];
    return convertToXML(schema.def.innerType, value, tagname, meta);
  }

  if (schema instanceof z.ZodLazy) {
    return convertToXML(schema.def.getter(), value, tagname, meta);
  }

  if (schema instanceof z.ZodArray) {
    const items = value as unknown[];
    const elementSchema = schema.def.element;
    if (!items || items.length === 0) return [];

    if (meta.inline) {
      // Each item becomes its own element at this level
      return items.flatMap((item) => convertSingleToXML(elementSchema, item, tagname));
    } else {
      // Wrap items in a container element
      const itemEls = items.flatMap((item) => convertSingleToXML(elementSchema, item, tagname));
      return [{ type: "element", name: tagname, elements: itemEls }];
    }
  }

  if (schema instanceof z.ZodPipe) {
    return convertToXML(schema.def.in as z.ZodObject<any>, value, tagname, meta);
  }

  if (schema instanceof z.ZodObject) {
    const nested = xmlCodec(schema).toXML(value as any);
    // Rename the root element if schema has a tagname
    const nestedRootTagname = getRootTagname(schema);
    if (nestedRootTagname && nested.elements[0]) {
      const el = { ...nested.elements[0], name: tagname };
      return [el];
    }
    // No tagname on nested schema — wrap its children in tagname element
    return [{ type: "element", name: tagname, elements: nested.elements }];
  }

  if (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean
  ) {
    return [XML.fromContent(String(value), tagname)];
  }

  return [];
}

/**
 * Converts a single value to XMLElement(s). Used for array items.
 */
function convertSingleToXML(schema: z.ZodType, value: unknown, tagname: string): XMLElement[] {
  if (schema instanceof z.ZodLazy) {
    return convertSingleToXML(schema.def.getter(), value, tagname);
  }

  if (schema instanceof z.ZodPipe) {
    return convertSingleToXML(schema.def.in as z.ZodObject<any>, value, tagname);
  }

  if (schema instanceof z.ZodObject) {
    const nested = xmlCodec(schema).toXML(value as any);
    const nestedRootTagname = getRootTagname(schema);
    if (nestedRootTagname && nested.elements[0]) {
      return [{ ...nested.elements[0], name: tagname }];
    }
    return [{ type: "element", name: tagname, elements: nested.elements }];
  }

  if (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean
  ) {
    return [XML.fromContent(String(value), tagname)];
  }

  if (schema instanceof z.ZodOptional) {
    if (value === undefined) return [];
    return convertSingleToXML(schema.def.innerType, value, tagname);
  }

  return [];
}
