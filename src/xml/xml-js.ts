import { xml2js, js2xml } from "xml-js";
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

// TODO: audit these option types and remove anything we don't want to expose/support

type IgnoreOptions = {
  /** Whether to ignore the XML declaration (`<?xml?>`). @default false */
  ignoreDeclaration?: boolean;
  /** Whether to ignore processing instructions (`<?go there?>`). @default false */
  ignoreInstruction?: boolean;
  /** Whether to ignore element attributes. @default false */
  ignoreAttributes?: boolean;
  /** Whether to ignore comments (`<!-- -->`). @default false */
  ignoreComment?: boolean;
  /** Whether to ignore CData sections (`<![CDATA[ ]]>`). @default false */
  ignoreCdata?: boolean;
  /** Whether to ignore DOCTYPE declarations. @default false */
  ignoreDoctype?: boolean;
  /** Whether to ignore text content inside elements. @default false */
  ignoreText?: boolean;
};

type ChangingKeyNames = {
  /** Override the key name used for the declaration property. @default "declaration" */
  declarationKey?: string;
  /** Override the key name used for processing instructions. @default "instruction" */
  instructionKey?: string;
  /** Override the key name used for element attributes. @default "attributes" */
  attributesKey?: string;
  /** Override the key name used for text content. @default "text" */
  textKey?: string;
  /** Override the key name used for CData sections. @default "cdata" */
  cdataKey?: string;
  /** Override the key name used for DOCTYPE. @default "doctype" */
  doctypeKey?: string;
  /** Override the key name used for comments. @default "comment" */
  commentKey?: string;
  /** Override the key name used for the parent back-reference (when `addParent` is enabled). @default "parent" */
  parentKey?: string;
  /** Override the key name used for node type. @default "type" */
  typeKey?: string;
  /** Override the key name used for element name. @default "name" */
  nameKey?: string;
  /** Override the key name used for child elements array. @default "elements" */
  elementsKey?: string;
};

/** Options for parsing XML into a JS object tree. */
export type ParseOptions = IgnoreOptions &
  ChangingKeyNames & {
    /** Whether to trim whitespace surrounding text content. @default false */
    trim?: boolean;
    /**
     * Whether to replace `&`, `<`, `>` with their XML entities in text nodes.
     * @deprecated See https://github.com/nashwaan/xml-js/issues/26
     * @default false
     */
    sanitize?: boolean;
    /** Whether to coerce numeric and boolean text values to their native JS types. @default false */
    nativeType?: boolean;
    /**
     * Whether to add a `parent` property on each element pointing back to its parent.
     * Useful for upward traversal but creates circular references.
     * @default false
     */
    addParent?: boolean;
    /**
     * Whether to always wrap sub-elements in an array, even when there is only one.
     * Pass an array of element names to restrict this behaviour to those names only.
     * Only applicable in compact mode.
     * @default false
     */
    alwaysArray?: boolean | Array<string>;
    /**
     * Whether to always emit an `elements` array even on empty elements.
     * `<a></a>` becomes `{ elements: [{ type: "element", name: "a", elements: [] }] }`
     * instead of `{ elements: [{ type: "element", name: "a" }] }`.
     * Only applicable in non-compact mode.
     * @default false
     */
    alwaysChildren?: boolean;
    /**
     * Whether to parse the contents of processing instructions as attributes.
     * `<?go to="there"?>` becomes `{ go: { attributes: { to: "there" } } }`
     * instead of `{ go: 'to="there"' }`.
     * @default false
     */
    instructionHasAttributes?: boolean;
    /** Whether to preserve whitespace-only text nodes that appear between elements. @default false */
    captureSpacesBetweenElements?: boolean;
    /** Custom processing hook called for each DOCTYPE value. */
    doctypeFn?: (value: string, parentElement: object) => void;
    /** Custom processing hook called for each processing instruction value. */
    instructionFn?: (
      instructionValue: string,
      instructionName: string,
      parentElement: string,
    ) => void;
    /** Custom processing hook called for each CData section. */
    cdataFn?: (value: string, parentElement: object) => void;
    /** Custom processing hook called for each comment. */
    commentFn?: (value: string, parentElement: object) => void;
    /** Custom processing hook called for each text node. */
    textFn?: (value: string, parentElement: object) => void;
    /** Custom processing hook called for each processing instruction name. */
    instructionNameFn?: (
      instructionName: string,
      instructionValue: string,
      parentElement: string,
    ) => void;
    /** Custom processing hook called for each element name. */
    elementNameFn?: (value: string, parentElement: object) => void;
    /** Custom processing hook called for each attribute name. */
    attributeNameFn?: (
      attributeName: string,
      attributeValue: string,
      parentElement: string,
    ) => void;
    /** Custom processing hook called for each attribute value. */
    attributeValueFn?: (
      attributeValue: string,
      attributeName: string,
      parentElement: string,
    ) => void;
    /** Custom processing hook called for the whole attributes object of an element. */
    attributesFn?: (value: string, parentElement: string) => void;
  };

function parse(xml: string, options: ParseOptions = {}): XMLRoot {
  const strippedOptions = { ...options };
  // ensure compact mode can't be used
  delete strippedOptions["compact"];
  const res = xml2js(xml, strippedOptions);
  if ("elements" in res) return res as XMLRoot;
  throw new Error("Got empty XML");
}

/** Options for serializing a JS object tree back to XML. */
export type StringifyOptions = IgnoreOptions &
  ChangingKeyNames & {
    /** Number of spaces (or a string like `'\t'`) to use for indenting XML output. @default 0 */
    spaces?: number | string;
    /** Whether to indent text nodes onto their own line when `spaces` is set. @default false */
    indentText?: boolean;
    /** Whether to write CData sections on a new indented line. @default false */
    indentCdata?: boolean;
    /** Whether to print each attribute on its own indented line (when `spaces` is set). @default false */
    indentAttributes?: boolean;
    /** Whether to indent processing instructions onto their own line. @default false */
    indentInstruction?: boolean;
    /** Whether to emit empty elements as full tag pairs (`<a></a>`) instead of self-closing (`<a/>`). @default false */
    fullTagEmptyElement?: boolean;
    /** Whether to omit quotes around attribute values that are native JS types (numbers, booleans). @default false */
    noQuotesForNativeAttributes?: boolean;
    /** Custom processing hook called for each DOCTYPE value. */
    doctypeFn?: (value: string, currentElementName: string, currentElementObj: object) => void;
    /** Custom processing hook called for each processing instruction value. */
    instructionFn?: (
      instructionValue: string,
      instructionName: string,
      currentElementName: string,
      currentElementObj: object,
    ) => void;
    /** Custom processing hook called for each CData section. */
    cdataFn?: (value: string, currentElementName: string, currentElementObj: object) => void;
    /** Custom processing hook called for each comment. */
    commentFn?: (value: string, currentElementName: string, currentElementObj: object) => void;
    /** Custom processing hook called for each text node. */
    textFn?: (value: string, currentElementName: string, currentElementObj: object) => void;
    /** Custom processing hook called for each processing instruction name. */
    instructionNameFn?: (
      instructionName: string,
      instructionValue: string,
      currentElementName: string,
      currentElementObj: object,
    ) => void;
    /** Custom processing hook called for each element name. */
    elementNameFn?: (value: string, currentElementName: string, currentElementObj: object) => void;
    /** Custom processing hook called for each attribute name. */
    attributeNameFn?: (
      attributeName: string,
      attributeValue: string,
      currentElementName: string,
      currentElementObj: object,
    ) => void;
    /** Custom processing hook called for each attribute value. */
    attributeValueFn?: (
      attributeValue: string,
      attributeName: string,
      currentElementName: string,
      currentElementObj: object,
    ) => void;
    /** Custom processing hook called for the whole attributes object of an element. */
    attributesFn?: (value: string, currentElementName: string, currentElementObj: object) => void;
    /**
     * Per-element override for `fullTagEmptyElement`.
     * Return `true` to emit a full tag pair for the given element, `false` for self-closing.
     */
    fullTagEmptyElementFn?: (currentElementName: string, currentElementObj: object) => void;
  };
function stringify(xml: XMLRoot, options: StringifyOptions = {}) {
  return js2xml(xml, options);
}

function isRoot(xml: object): xml is XMLRoot {
  const keys = Object.keys(xml);
  return keys.length === 1 && "elements" in xml && Array.isArray(xml.elements);
}

function elementFromRoot(root: XMLRoot): XMLElementNode | undefined {
  return root.elements.find((el) => el.type === "element");
}

function isEmpty(xml: object): xml is XMLVoid {
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
