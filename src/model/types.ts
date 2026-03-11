import type { ReflectedProperty } from "typescript-rtti";
import type { XMLRoot, XMLElement } from "../types";
import type { Middleware } from "../middleware";
import type { XMLModel } from "./index";

/* PROPERTIES */

/** The name of a property on type `T` (string keys only). */
export type XMLModelProperty<T> = Extract<keyof T, string>;

/** A partial record mapping property names to their runtime values. */
export type PropertiesRecord<T> = {
  [key in keyof T]?: T[key];
};

/** A partial record mapping property names to their XML representations. */
export type XMLPropertiesRecord<T> = {
  [key in keyof T]?: XMLRoot;
};

/** Context passed to a property's `toXML` conversion function. */
export interface PropertyToXMLContext<T> extends Omit<toXMLContext<T>, "properties"> {
  property: XMLModelPropertyOptions<T>;
  value: T[keyof T]; // FIXME ???
}

/** Context passed to a property's `fromXML` conversion function. */
export interface PropertyFromXMLContext<T> extends Omit<fromXMLContext<T>, "properties"> {
  property: XMLModelPropertyOptions<T>;
  /** The XML elements resolved as source data for this property. */
  elements: XMLElement[];
}

/** Fully resolved runtime options for a single model property. */
export interface XMLModelPropertyOptions<T> {
  name: keyof T;
  reflected: ReflectedProperty;
  /** XML tag name used for this property. Derived from the property name in kebab-case by default. */
  tagname: string;
  ignored: boolean;
  /** When `true`, array items are serialised/deserialised directly into the parent element without a wrapper tag. */
  inline: boolean;
  /** Override model used to convert this property's value. */
  model?: XMLModel<any>;
  // from XML
  /** Returns `true` when the given element should be considered a source for this property. */
  isSourceElement: (
    element: XMLElement,
    context: Omit<PropertyFromXMLContext<T>, "elements">,
  ) => boolean;
  /** Collects the XML elements that will be passed to `fromXML` for this property. */
  resolveElements: (context: Omit<PropertyFromXMLContext<T>, "elements">) => XMLElement[];
  fromXML: (context: PropertyFromXMLContext<T>) => T[keyof T];
  // to XML
  toXML: (context: PropertyToXMLContext<T>) => XMLRoot;
}

/** User-facing options accepted by the `@Prop()` decorator and `createModel`. */
export interface CreateXMLModelPropertyOptions<T> {
  /** Override the XML tag name for this property. */
  tagname?: string;
  /**
   * Controls which XML elements are treated as the source for this property.
   * - `string`: exact tag name match
   * - `RegExp`: tag name pattern match
   * - `function`: custom predicate
   */
  sourceElements?: string | RegExp | XMLModelPropertyOptions<T>["isSourceElement"];
  /** Custom element resolver; overrides the default source-element resolution logic. */
  resolveElements?: XMLModelPropertyOptions<T>["resolveElements"];
  toXML?: XMLModelPropertyOptions<T>["toXML"];
  fromXML?: XMLModelPropertyOptions<T>["fromXML"];
  /** When `true`, array items are inlined directly into the parent element. */
  inline?: boolean;
  /** When `true`, the property is excluded from XML conversion entirely. */
  ignore?: boolean;
  /** Explicit model to use for this property's value. */
  model?: XMLModelPropertyOptions<T>["model"];
}

/* MODEL */
interface ConversionOptions<C, T> {
  parent: ConversionOptions<C, T> | null;
  middlewares: Middleware<C, T>[];
}

/** Context passed to the model-level `fromXML` middleware chain. */
export interface fromXMLContext<T> {
  xml: XMLRoot;
  /** Lazily computed property values derived from `xml`. */
  properties: PropertiesRecord<T>;
  model: XMLModel<T>;
}

/** Context passed to the model-level `toXML` middleware chain. */
export interface toXMLContext<T> {
  object: T;
  /** Lazily computed per-property XML fragments. */
  properties: XMLPropertiesRecord<T>;
  model: XMLModel<T>;
}

/** Internal fully-resolved model options (not the user-facing create options). */
export interface XMLModelOptions<T> {
  parent?: XMLModel<T>;
  properties: {
    fromXML: ConversionOptions<Omit<fromXMLContext<T>, "properties">, PropertiesRecord<T>>;
    toXML: ConversionOptions<Omit<toXMLContext<T>, "properties">, XMLPropertiesRecord<T>>;
    options: Map<XMLModelProperty<T>, XMLModelPropertyOptions<T>>;
  };
  fromXML: ConversionOptions<fromXMLContext<T>, T>;
  toXML: ConversionOptions<toXMLContext<T>, XMLRoot>;
  /** XML tag name for the root element of this model. */
  tagname: string;
}

/** User-facing options for `createModel` / `@Model()`. */
export interface CreateXMLModelOptions<T> {
  /** Explicitly set the parent model (otherwise inferred from the prototype chain). */
  parent?: XMLModelOptions<T>["parent"];
  /** Middleware that converts XML into an instance of `T`. Required unless a parent model provides one. */
  fromXML?: XMLModelOptions<T>["fromXML"]["middlewares"][number];
  /** Middleware that converts an instance of `T` into XML. Optional — a default implementation is provided. */
  toXML?: XMLModelOptions<T>["toXML"]["middlewares"][number];
  /** Override the root XML tag name. Defaults to the class name in kebab-case. */
  tagname?: XMLModelOptions<T>["tagname"];
}

export { XMLModel };
