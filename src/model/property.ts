import type { Constructor, ReflectedProperty } from "typescript-rtti";
import { reflect } from "typescript-rtti";

import { fromXMLMiddlewareContext } from "../from-xml";
import { toXMLMiddlewareContext } from "../to-xml";
import { XMLModelProperty } from "./types";
import { XMLElement, XMLRoot } from "../types";
import { defaults } from "../defaults";

interface PropertyToXMLContext<T> extends toXMLMiddlewareContext<T> {
  property: ReflectedProperty;
  root: toXMLMiddlewareContext<T>;
}

interface PropertyFromXMLContext extends fromXMLMiddlewareContext {
  property: ReflectedProperty;
  root: fromXMLMiddlewareContext;
}

export interface PropertyConversionOptions<T> {
  name: keyof T;
  tagname: string;
  fromXML: (context: fromXMLMiddlewareContext) => unknown;
  toXML: (context: toXMLMiddlewareContext<T>) => XMLRoot;
}

// Prop decorator
export interface XMLModelPropertyOptions<T> {
  tagname?: string;
  sourceElements?:
    | string
    | RegExp
    | ((
        element: XMLElement,
        property: ReflectedProperty,
        context: fromXMLMiddlewareContext
      ) => boolean);
  toXML?: (context: PropertyToXMLContext<T>) => XMLRoot;
  fromXML?: (context: PropertyFromXMLContext) => unknown;
  ignore?: boolean;
}

function resolvePropertyConversionOptions<T>(
  options: XMLModelPropertyOptions<T>,
  constructor: Constructor<T>,
  property: XMLModelProperty<T>
) {
  // normalize into PropertyConversionOptions
  function reflectProperty() {
    return reflect(constructor).getProperty(property);
  }

  // XML -> Object
  let isSourceElements: Extract<
    Required<XMLModelPropertyOptions<T>>["sourceElements"],
    Function
  > = (...args) => defaults.propertySourceElements(...args);
  if (options?.sourceElements) {
    const _sourceElements = options.sourceElements;
    if (typeof _sourceElements === "string") {
      isSourceElements = (element) => element.name === _sourceElements;
    } else if (_sourceElements && _sourceElements instanceof RegExp) {
      isSourceElements = (element) => _sourceElements.test(element.name || "");
    } else {
      isSourceElements = _sourceElements;
    }
  }

  // deserialization
  const fromXMLContext = (
    context: fromXMLMiddlewareContext
  ): PropertyFromXMLContext => {
    const property = reflectProperty();
    // We assume context.xml.elements is a single tag containing all the props
    // FIXME: is it safe ?
    const innerElements: XMLElement[] = context.xml.elements[0]?.elements || [];
    const elements = innerElements.filter((el) =>
      isSourceElements(el, property, context)
    );
    return {
      xml: { elements },
      property,
      root: context,
    };
  };

  // Object -> XML
  const toXMLContext = <T>(context: toXMLMiddlewareContext<T>) => {
    const value = (context.object as any)[property] as T;
    const _property = reflectProperty();
    const _context: PropertyToXMLContext<T> = {
      object: value,
      property: _property,
      root: context,
    };
    return _context;
  };

  const _options: PropertyConversionOptions<T> = {
    name: property as keyof T,
    get tagname() {
      return options.tagname || defaults.tagnameFromProperty(reflectProperty());
    },
    fromXML: options.ignore
      ? () => {}
      : options.fromXML
      ? (context) => options.fromXML!(fromXMLContext(context))
      : (context) => defaults.propertyFromXML(fromXMLContext(context)),
    toXML: options.ignore
      ? () => ({
          elements: [],
        })
      : options.toXML
      ? (context) => options.toXML!(toXMLContext(context))
      : (context) => defaults.propertyToXML(toXMLContext(context)),
  };
  return _options;
}

const PropertyOptions = new Map<
  Constructor<unknown>,
  Map<XMLModelProperty<unknown>, PropertyConversionOptions<unknown>>
>();

function storePropertyConversionOptions<T>(
  constructor: Constructor<T>,
  property: XMLModelProperty<T>,
  options: PropertyConversionOptions<T>
) {
  if (!PropertyOptions.has(constructor))
    PropertyOptions.set(
      constructor,
      new Map<XMLModelProperty<unknown>, PropertyConversionOptions<unknown>>()
    );
  PropertyOptions.get(constructor)!.set(
    property as XMLModelProperty<unknown>,
    options as PropertyConversionOptions<unknown>
  );
}

function findPropertyConversionOptions<T>(
  constructor: Constructor<T>,
  property: XMLModelProperty<T>
) {
  const options = PropertyOptions.get(constructor) as
    | Map<XMLModelProperty<T>, PropertyConversionOptions<T>>
    | undefined;
  if (options) {
    return options.get(property);
  }
}

export function getPropertyConversionOptions<T>(
  constructor: Constructor<T>,
  property: XMLModelProperty<T>
) {
  const options = findPropertyConversionOptions(constructor, property);
  return options || resolvePropertyConversionOptions({}, constructor, property);
}

function PropDecoratorFactory<T = any>(options?: XMLModelPropertyOptions<T>) {
  return function (
    prototype: any /* FIXME: should be typed */,
    property: XMLModelProperty<T>
  ) {
    const _options = resolvePropertyConversionOptions(
      options || {},
      prototype.constructor,
      property
    );
    storePropertyConversionOptions(prototype.constructor, property, _options);
  };
}
export { PropDecoratorFactory as Prop };
