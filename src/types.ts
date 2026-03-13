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
