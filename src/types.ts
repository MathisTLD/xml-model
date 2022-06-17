export type { Constructor } from "typescript-rtti";

export type UnknownRecord = Record<string | number | symbol, unknown>;
export type UnknownObject = object; // Record<string | number | symbol, unknown>; // don't works with class' instances

import type { Element as _XMLElement } from "xml-js";
export type XMLElement = _XMLElement;
export type XMLRoot = { elements: XMLElement[] };
