import { reflect, type Constructor } from "typescript-rtti";

import type {
  XMLModelProperty,
  XMLModelPropertyOptions,
  CreateXMLModelPropertyOptions,
} from "./types";
import { defaults } from "../defaults";

function resolvePropertyConversionOptions<T>(
  options: CreateXMLModelPropertyOptions<T>,
  constructor: Constructor<T>,
  property: XMLModelProperty<T>,
) {
  const _options: XMLModelPropertyOptions<T> = {
    name: property as keyof T,
    get reflected() {
      const reflectedClass = reflect(constructor);
      return reflectedClass.getOwnProperty(property) || reflectedClass.getProperty(property); // patch bug in typescript-rtti
      // TODO: remove when typescript-rtti is patched
    },
    get tagname() {
      return options.tagname || defaults.tagnameFromProperty(this);
    },
    inline: !!options.inline,
    ignored: !!options.ignore,
    isSourceElement: (...args) => defaults.propertySourceElementsFilter(...args),
    resolveElements: options.resolveElements
      ? options.resolveElements
      : (...args) => defaults.propertyResolveSourceElements(...args),
    fromXML: (context) => (options.fromXML || defaults.propertyFromXML)(context),
    toXML: (context) => (options.toXML || defaults.propertyToXML)(context),
  };
  if (options?.model) _options.model = options.model;

  if (options?.sourceElements) {
    const _sourceElements = options.sourceElements;
    if (typeof _sourceElements === "string") {
      _options.isSourceElement = (element) => element.name === _sourceElements;
    } else if (_sourceElements && _sourceElements instanceof RegExp) {
      _options.isSourceElement = (element) => _sourceElements.test(element.name || "");
    } else {
      _options.isSourceElement = _sourceElements;
    }
  }

  return _options;
}

const PropertyOptions = new Map<
  Constructor<any>,
  Map<XMLModelProperty<any>, XMLModelPropertyOptions<any>>
>();

function storePropertyConversionOptions<T>(
  constructor: Constructor<T>,
  property: XMLModelProperty<T>,
  options: XMLModelPropertyOptions<T>,
) {
  let map = PropertyOptions.get(constructor);
  if (!map) {
    map = new Map<XMLModelProperty<unknown>, XMLModelPropertyOptions<unknown>>();
    PropertyOptions.set(constructor, map);
  }
  map.set(property, options);
}

function findPropertyConversionOptions<T>(
  constructor: Constructor<T>,
  property: XMLModelProperty<T>,
) {
  const options = PropertyOptions.get(constructor) as
    | Map<XMLModelProperty<T>, XMLModelPropertyOptions<T>>
    | undefined;
  if (options) {
    return options.get(property);
  }
}

export function getPropertyConversionOptions<T>(
  constructor: Constructor<T>,
  property: XMLModelProperty<T>,
) {
  const options = findPropertyConversionOptions(constructor, property);
  return options || resolvePropertyConversionOptions({}, constructor, property);
}

function PropDecoratorFactory<T = any>(options?: CreateXMLModelPropertyOptions<T>) {
  return function (prototype: any, property: XMLModelProperty<T>) {
    const _options = resolvePropertyConversionOptions(
      options || {},
      prototype.constructor,
      property,
    );
    storePropertyConversionOptions(prototype.constructor, property, _options);
  };
}
export { PropDecoratorFactory as Prop };
