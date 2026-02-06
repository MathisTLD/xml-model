import type { ReflectedProperty } from "typescript-rtti";
import type { XMLRoot, XMLElement } from "../types";
import type { Middleware } from "../middleware";
import type { XMLModel } from "./index";

/* PROPERTIES */
export type XMLModelProperty<T> = Extract<keyof T, string>;

export type PropertiesRecord<T> = {
  [key in keyof T]?: T[key];
};

export type XMLPropertiesRecord<T> = {
  [key in keyof T]?: XMLRoot;
};

export interface PropertyToXMLContext<T> extends Omit<toXMLContext<T>, "properties"> {
  property: XMLModelPropertyOptions<T>;
  value: T[keyof T]; // FIXME ???
}

export interface PropertyFromXMLContext<T> extends Omit<fromXMLContext<T>, "properties"> {
  property: XMLModelPropertyOptions<T>;
  elements: XMLElement[];
}
export interface XMLModelPropertyOptions<T> {
  name: keyof T;
  reflected: ReflectedProperty;
  tagname: string;
  ignored: boolean;
  inline: boolean;
  model?: XMLModel<any>;
  // from XML
  isSourceElement: (
    element: XMLElement,
    context: Omit<PropertyFromXMLContext<T>, "elements">,
  ) => boolean;
  resolveElements: (context: Omit<PropertyFromXMLContext<T>, "elements">) => XMLElement[];
  fromXML: (context: PropertyFromXMLContext<T>) => T[keyof T];
  // to XML
  toXML: (context: PropertyToXMLContext<T>) => XMLRoot;
}

export interface CreateXMLModelPropertyOptions<T> {
  tagname?: string;
  sourceElements?: string | RegExp | XMLModelPropertyOptions<T>["isSourceElement"];
  resolveElements?: XMLModelPropertyOptions<T>["resolveElements"];
  toXML?: XMLModelPropertyOptions<T>["toXML"];
  fromXML?: XMLModelPropertyOptions<T>["fromXML"];
  inline?: boolean;
  ignore?: boolean;
  model?: XMLModelPropertyOptions<T>["model"];
}

/* MODEL */
interface ConversionOptions<C, T> {
  parent: ConversionOptions<C, T> | null;
  middlewares: Middleware<C, T>[];
}
export interface fromXMLContext<T> {
  xml: XMLRoot;
  properties: PropertiesRecord<T>;
  model: XMLModel<T>;
}

export interface toXMLContext<T> {
  object: T;
  properties: XMLPropertiesRecord<T>;
  model: XMLModel<T>;
}
export interface XMLModelOptions<T> {
  parent?: XMLModel<T>;
  properties: {
    fromXML: ConversionOptions<Omit<fromXMLContext<T>, "properties">, PropertiesRecord<T>>;
    toXML: ConversionOptions<Omit<toXMLContext<T>, "properties">, XMLPropertiesRecord<T>>;
    options: Map<XMLModelProperty<T>, XMLModelPropertyOptions<T>>;
  };
  fromXML: ConversionOptions<fromXMLContext<T>, T>;
  toXML: ConversionOptions<toXMLContext<T>, XMLRoot>;
  tagname: string;
}

export interface CreateXMLModelOptions<T> {
  parent?: XMLModelOptions<T>["parent"];
  fromXML?: XMLModelOptions<T>["fromXML"]["middlewares"][number];
  toXML?: XMLModelOptions<T>["toXML"]["middlewares"][number];
  tagname?: XMLModelOptions<T>["tagname"];
}

export { XMLModel };
