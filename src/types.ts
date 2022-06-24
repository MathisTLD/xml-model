export type { Constructor } from "typescript-rtti";

export type UnknownRecord = Record<string | number | symbol, unknown>;
export type UnknownObject = object; // Record<string | number | symbol, unknown>; // don't works with class' instances

export interface XMLAttributes {
  [key: string]: string | number | undefined;
}
export interface XMLElement {
  type?: string;
  name?: string;
  attributes?: XMLAttributes;
  elements?: Array<XMLElement>;
  text?: string | number | boolean;
}
export type XMLRoot = { elements: XMLElement[] };
