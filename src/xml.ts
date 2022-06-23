import { xml2js, js2xml } from "xml-js";
import { XMLElement, XMLRoot } from "./types";

export function parse(string: string) {
  return xml2js(string) as XMLRoot;
}

export function stringify(
  xml: XMLRoot,
  options?: Parameters<typeof js2xml>[1]
) {
  return js2xml(xml, options);
}

export function getContent(xml: XMLElement) {
  if (xml.elements?.length === 1) {
    const content = xml.elements[0];
    if (content.type === "text") return content.text;
  }
  if (!xml.elements) return "";
  throw new TypeError(`can't get text from XMLElement: ${JSON.stringify(xml)}`);
}

export function fromContent(content: string): {
  elements: [{ type: "text"; text: string }] | [];
};
export function fromContent(
  content: string,
  tag: string,
  attributes?: XMLElement["attributes"]
): {
  type: "element";
  name: string;
  attributes?: XMLElement["attributes"];
  elements: [{ type: "text"; text: string }] | [];
};
export function fromContent(
  content = "",
  tag?: string,
  attributes?: XMLElement["attributes"]
): XMLElement {
  const el: XMLElement = {
    elements: content ? [{ type: "text", text: String(content) }] : [],
  };
  if (tag) el.name = tag;
  if (attributes) {
    if (!el.name)
      throw new TypeError(
        "please provide a name if you want to provide attributes"
      );
    el.attributes = attributes;
  }
  if (el.name) el.type = "element";
  return el;
}

export function addElement(xml: XMLElement, element: XMLElement) {
  if (!xml.elements) xml.elements = [];
  xml.elements.push(element);
}

export function setAttribute(
  xml: XMLElement,
  attribute: string,
  value: string
) {
  if (!xml.attributes) xml.attributes = {};
  xml.attributes[attribute] = value;
}

export function deleteAttribute(xml: XMLElement, attribute: string) {
  if (!xml.attributes) return;
  delete xml.attributes[attribute];
}

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
