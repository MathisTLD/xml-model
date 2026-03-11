export type { Constructor } from "typescript-rtti";

/** A record with unknown values, keyed by string, number, or symbol. */
export type UnknownRecord = Record<string | number | symbol, unknown>;

/** Any object type. Used instead of `UnknownRecord` because it is compatible with class instances. */
export type UnknownObject = object; // Record<string | number | symbol, unknown>; // don't works with class' instances

/** Key-value map of XML attributes. Values may be strings, numbers, or absent. */
export interface XMLAttributes {
  [key: string]: string | number | undefined;
}

/**
 * A single node in the xml-js element tree.
 * Used as the internal representation for all XML parsing and serialisation.
 */
export interface XMLElement {
  type?: string;
  name?: string;
  attributes?: XMLAttributes;
  elements?: Array<XMLElement>;
  text?: string | number | boolean;
}

/** The root of an xml-js document: a wrapper object whose `elements` array holds top-level nodes. */
export type XMLRoot = { elements: XMLElement[] };
