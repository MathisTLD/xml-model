import { xml2js, js2xml, type Options, type Element } from "xml-js";
import { z } from "zod";

export const ZXMLElementNode = z.object({
  type: z.literal("element"),
  // TODO: test if required
  name: z.string(),
  attributes: z.record(z.string(), z.string()).optional(),
  get elements() {
    return z.array(ZXMLNode).optional();
  },
  // TODO: other fields
});
export type XMLElementNode = z.infer<typeof ZXMLElementNode>;

export const ZXMLCommentNode = z.object({ type: z.literal("comment"), comment: z.string() });
export type XMLCommentNode = z.infer<typeof ZXMLCommentNode>;

export const ZXMLTextNode = z.object({ type: z.literal("text"), text: z.string() });
export type XMLTextNode = z.infer<typeof ZXMLTextNode>;
// TODO: other nodes (if any)

export type XMLNode = XMLElementNode | XMLCommentNode | XMLTextNode;
// @ts-ignore
export const ZXMLNode: z.ZodDiscriminatedUnion<
  [typeof ZXMLElementNode, typeof ZXMLCommentNode, typeof ZXMLTextNode],
  "type"
> = z.discriminatedUnion("type", [ZXMLElementNode, ZXMLCommentNode, ZXMLTextNode]);

/**
 * A single node in the xml-js element tree.
 * Used as the internal representation for all XML parsing and serialization.
 */
export type XMLElement = XMLElementNode;

export const ZXMLRoot = z.object({ elements: z.array(ZXMLNode) });
/** The root of an xml-js document: a wrapper object whose `elements` array holds top-level nodes.
 *
 * **the `elements` array contains AT MOST one node with type `element`**
 */
export type XMLRoot = { elements: XMLNode[] };

type EmptyObj = Record<PropertyKey, never>;
export type XMLVoid = EmptyObj;

export type ParseOptions = Omit<Options.XML2JS, "compact">;

function parse(xml: string, options: ParseOptions = {}): XMLRoot {
  const strippedOptions = { ...options };
  // ensure compact mode can't be used
  delete strippedOptions["compact"];
  const res = xml2js(xml, strippedOptions);
  if ("elements" in res) return res as XMLRoot;
  throw new Error("Got empty XML");
}

export type StringifyOptions = Options.JS2XML;
function stringify(xml: XMLRoot, options: StringifyOptions = {}) {
  return js2xml(xml, options);
}

function isRoot(xml: Element): xml is XMLRoot {
  const keys = Object.keys(xml);
  return keys.length === 1 && Array.isArray(xml.elements);
}

function elementFromRoot(root: XMLRoot): XMLElementNode | undefined {
  return root.elements.find((el) => el.type === "element");
}

function isEmpty(xml: Element): xml is XMLVoid {
  // TODO: handle other cases where properties exist but are undefined ?
  return Object.keys(xml).length === 0;
}

/**
 * Extracts the text content from an element that has a single text child node.
 *
 * @param xml - An `XMLElement` expected to contain a single text node.
 * @returns The text value, or an empty string when there are no child elements.
 * @throws {TypeError} When the element has multiple or non-text children.
 */
function getContent(xml: XMLElement) {
  if (xml.elements?.length === 1) {
    const content = xml.elements[0];
    if (content.type === "text") return content.text;
  }
  if (!xml.elements) return "";
  throw new TypeError(`can't get text from XMLElement: ${JSON.stringify(xml)}`);
}

/**
 * Creates a minimal element structure wrapping the given text content.
 * When no tag name is provided, returns a fragment with a text child.
 * When a tag name is provided, returns a full element with the given name and optional attributes.
 *
 * @param content - The text content to wrap (defaults to empty string).
 * @param tag - Optional element tag name.
 * @param attributes - Optional attributes; only valid when `tag` is provided.
 * @throws {TypeError} When `attributes` are provided without a `tag`.
 */
function fromContent(content: string): {
  elements: [{ type: "text"; text: string }] | [];
};
function fromContent(
  content: string,
  tag: string,
  attributes?: XMLElement["attributes"],
): {
  type: "element";
  name: string;
  attributes?: XMLElement["attributes"];
  elements: [{ type: "text"; text: string }] | [];
};
function fromContent(content = "", tag?: string, attributes?: XMLElement["attributes"]) {
  const elements: [{ type: "text"; text: string }] | [] = content
    ? [{ type: "text", text: String(content) }]
    : [];
  if (!tag) {
    return { elements };
  }
  const el: XMLElement = {
    type: "element",
    name: tag,
    elements,
  };
  if (attributes) {
    el.attributes = attributes;
  }
  return el;
}

/**
 * Appends a child element to `xml`, initialising the `elements` array if needed.
 *
 * @param xml - The parent element to modify.
 * @param element - The child element to append.
 */
function addElement(xml: XMLElement, element: XMLElement) {
  if (!xml.elements) xml.elements = [];
  xml.elements.push(element);
}

/**
 * Sets an attribute on an element, initialising the `attributes` map if needed.
 *
 * @param xml - The element to modify.
 * @param attribute - The attribute name.
 * @param value - The attribute value.
 */
function setAttribute(xml: XMLElement, attribute: string, value: string) {
  if (!xml.attributes) xml.attributes = {};
  xml.attributes[attribute] = value;
}

/**
 * Removes an attribute from an element. Does nothing if the element has no attributes.
 *
 * @param xml - The element to modify.
 * @param attribute - The attribute name to remove.
 */
function deleteAttribute(xml: XMLElement, attribute: string) {
  if (!xml.attributes) return;
  delete xml.attributes[attribute];
}

/** Namespace object bundling all XML utility functions. */
export const XML = {
  parse,
  stringify,
  isRoot,
  elementFromRoot,
  isEmpty,
  fromContent,
  getContent,
  addElement,
  setAttribute,
  deleteAttribute,
};

export default XML;
