import type { Element, Attributes } from "xml-js";

/** Key-value map of XML attributes. Values may be strings, numbers, or absent. */
export interface XMLAttributes extends Attributes {}

/**
 * A single node in the xml-js element tree.
 * Used as the internal representation for all XML parsing and serialization.
 */
export interface XMLElement extends Element {}

/** The root of an xml-js document: a wrapper object whose `elements` array holds top-level nodes. */
export type XMLRoot = { elements: XMLElement[] };
