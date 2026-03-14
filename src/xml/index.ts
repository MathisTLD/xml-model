import XMLJS from "./xml-js";

import { XMLElement, XMLRoot } from "./types";

/**
 * Parses an XML string into an `XMLRoot` document tree.
 *
 * @param string - A well-formed XML string.
 * @returns The root of the parsed element tree.
 */
export function parse(string: string) {
  return XMLJS.parse(string) as XMLRoot;
}

/**
 * Serialises an `XMLRoot` or `XMLElement` back into an XML string.
 * Delegates to xml-js's `js2xml` function.
 */
export const stringify = XMLJS.stringify;

/**
 * Extracts the text content from an element that has a single text child node.
 *
 * @param xml - An `XMLElement` expected to contain a single text node.
 * @returns The text value, or an empty string when there are no child elements.
 * @throws {TypeError} When the element has multiple or non-text children.
 */
export function getContent(xml: XMLElement) {
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
export function fromContent(content: string): {
  elements: [{ type: "text"; text: string }] | [];
};
export function fromContent(
  content: string,
  tag: string,
  attributes?: XMLElement["attributes"],
): {
  type: "element";
  name: string;
  attributes?: XMLElement["attributes"];
  elements: [{ type: "text"; text: string }] | [];
};
export function fromContent(
  content = "",
  tag?: string,
  attributes?: XMLElement["attributes"],
): XMLElement {
  const el: XMLElement = {
    elements: content ? [{ type: "text", text: String(content) }] : [],
  };
  if (tag) el.name = tag;
  if (attributes) {
    if (!el.name) throw new TypeError("please provide a name if you want to provide attributes");
    el.attributes = attributes;
  }
  if (el.name) el.type = "element";
  return el;
}

/**
 * Appends a child element to `xml`, initialising the `elements` array if needed.
 *
 * @param xml - The parent element to modify.
 * @param element - The child element to append.
 */
export function addElement(xml: XMLElement, element: XMLElement) {
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
export function setAttribute(xml: XMLElement, attribute: string, value: string) {
  if (!xml.attributes) xml.attributes = {};
  xml.attributes[attribute] = value;
}

/**
 * Removes an attribute from an element. Does nothing if the element has no attributes.
 *
 * @param xml - The element to modify.
 * @param attribute - The attribute name to remove.
 */
export function deleteAttribute(xml: XMLElement, attribute: string) {
  if (!xml.attributes) return;
  delete xml.attributes[attribute];
}

/** Namespace object bundling all XML utility functions. */
const XML = {
  parse,
  stringify,
  fromContent,
  getContent,
  addElement,
  setAttribute,
  deleteAttribute,
};

export default XML;
