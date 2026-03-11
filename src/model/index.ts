import "reflect-metadata";
import type { Constructor } from "typescript-rtti";
import { reflect } from "typescript-rtti";

import {
  FromXMLConversionError,
  PropertyFromXMLConversionError,
  PropertyToXMLConversionError,
  ToXMLConversionError,
} from "../errors";
import mergeMaps from "../util/merge-maps";
import { MiddlewareChain, resolve } from "../middleware";
import {
  XMLModelProperty,
  XMLModelOptions,
  XMLModelPropertyOptions,
  PropertiesRecord,
  XMLPropertiesRecord,
  CreateXMLModelOptions,
} from "./types";
import { getPropertyConversionOptions } from "./property";
import { XMLRoot } from "../types";
import XML from "../xml";
import { defaults } from "../defaults";
import { findModel, registrerModel } from "./registry";
import registerBuiltIns from "./built-ins";

/** Yields every constructor in the prototype chain of `constructor`, from immediate parent upward. */
function* ParentChain(constructor: Constructor<unknown>) {
  let parent = Object.getPrototypeOf(constructor);
  if (parent === constructor) {
    return;
  }
  while (parent) {
    yield parent as Constructor<unknown>;
    const _parent = Object.getPrototypeOf(constructor);
    if (parent === _parent) {
      return;
    }
    parent = _parent;
  }
  return;
}

/**
 * Returns the parent `XMLModel` for the given model, walking the prototype chain
 * if no explicit parent was set in options.
 */
export function getParentModel(model: XMLModel<any>) {
  if (model.options.parent) return model.options.parent;
  for (const constructor of ParentChain(model.type)) {
    const model = findModel(constructor);
    if (model) {
      return model as XMLModel<any>;
    }
  }
  return null;
}

/**
 * Encapsulates the XML ↔ TypeScript conversion logic for a specific class.
 *
 * Create instances via `createModel` or the `@Model()` decorator rather than
 * calling this constructor directly.
 */
export class XMLModel<T = any> {
  options: XMLModelOptions<T>;
  constructor(
    readonly type: Constructor<T>,
    options: CreateXMLModelOptions<T>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const model = this;
    let parent: XMLModel<any> | null | undefined = undefined;
    const getParent = () => {
      if (typeof parent === "undefined") parent = getParentModel(this);
      return parent;
    };
    let propertiesLoaded = false;
    const properties: XMLModelOptions<T>["properties"] = {
      options: new Map<XMLModelProperty<T>, XMLModelPropertyOptions<T>>(),
      fromXML: {
        get parent() {
          return getParent()?.options.properties.fromXML || null;
        },
        middlewares: [
          (context, next) => {
            const record: PropertiesRecord<T> = getParent() ? next() : {};
            properties.options.forEach((property) => {
              const xml = context.xml;
              const elements = property.resolveElements({
                model,
                xml,
                property,
              });
              const propertyFromXMLContext = {
                model,
                xml: context.xml,
                property,
                elements,
              };
              try {
                record[property.name] = property.fromXML(propertyFromXMLContext);
              } catch (error) {
                if (error instanceof FromXMLConversionError) {
                  // TODO: might add some more context
                  throw error;
                } else {
                  throw new PropertyFromXMLConversionError(context, propertyFromXMLContext, error);
                }
              }
            });
            return record;
          },
        ],
      },
      toXML: {
        get parent() {
          return getParent()?.options.properties.toXML || null;
        },
        middlewares: [
          (context, next) => {
            const record: XMLPropertiesRecord<T> = getParent() ? next() : {};
            properties.options.forEach((options) => {
              const propertyToXMLContext = {
                model,
                object: context.object,
                property: options,
                value: context.object[options.name],
              };
              try {
                record[options.name] = options.toXML(propertyToXMLContext);
              } catch (error) {
                if (error instanceof ToXMLConversionError) {
                  // TODO: might add some more context
                  throw error;
                } else {
                  throw new PropertyToXMLConversionError(context, propertyToXMLContext, error);
                }
              }
            });
            return record;
          },
        ],
      },
    };
    const loadProperties = () => {
      const props = this.reflectedClass.ownProperties.filter(
        (prop) => typeof prop.host.constructor.prototype[prop.name] !== "function",
      ); // filter out methods like String.prototype.concat etc... that are seen as properties

      props.forEach((property) => {
        const options = getPropertyConversionOptions(
          this.type,
          property.name as XMLModelProperty<T>,
        );
        if (!options.ignored) {
          const type = options.reflected?.type;
          if (!options.model && type?.is("class") && type.class === Object) {
            console.warn(
              `[xml-model] Property '${String(property.name)}' on '${this.type.name}' has type Object at runtime. ` +
                `If its declared type is a class, make sure it is imported as a value and not with 'import type'.`,
            );
          }
          properties.options.set(property.name as XMLModelProperty<T>, options);
        }
      });
      propertiesLoaded = true;
    };

    this.options = {
      get properties() {
        if (!propertiesLoaded) loadProperties();
        return properties;
      },
      fromXML: {
        middlewares: [],
        get parent() {
          return getParent()?.options.fromXML || null;
        },
      },
      toXML: {
        middlewares: [],
        get parent() {
          return getParent()?.options.toXML || null;
        },
      },
      get tagname() {
        return options.tagname || defaults.tagnameFromModel(model);
      },
    };
    if (options.parent) this.options.parent = options.parent;

    if (!getParent()) {
      this.options.fromXML.middlewares.push((ctx) => defaults.fromXML(ctx));
      this.options.toXML.middlewares.push((ctx) => defaults.toXML(ctx));
    }
    if (options.fromXML) this.options.fromXML.middlewares.push(options.fromXML);
    if (options.toXML) this.options.toXML.middlewares.push(options.toXML);
  }

  /**
   * Converts an XML document (string or parsed `XMLRoot`) into an instance of `T`.
   *
   * @param xml - Raw XML string or a pre-parsed `XMLRoot` object.
   * @returns The converted instance produced by the model's `fromXML` middleware chain.
   * @throws {FromXMLConversionError} When model-level conversion fails.
   * @throws {PropertyFromXMLConversionError} When a property-level conversion fails.
   */
  fromXML(xml: XMLRoot | string) {
    const _xml = typeof xml === "string" ? XML.parse(xml) : xml;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const model = this;
    const context = {
      xml: _xml,
      get properties() {
        const propContext = {
          xml: _xml,
          model,
        };
        return resolve(MiddlewareChain(model.options.properties.fromXML), propContext);
      },
      model,
    };
    return resolve(MiddlewareChain(this.options.fromXML), context);
  }

  /**
   * Converts an instance of `T` into an XML document.
   *
   * @param instance - An instance of the class this model was created for.
   * @returns An `XMLRoot` representing the serialised object.
   * @throws {TypeError} When `instance` is not an instance of the expected type.
   * @throws {ToXMLConversionError} When model-level conversion fails.
   * @throws {PropertyToXMLConversionError} When a property-level conversion fails.
   */
  toXML(instance: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const model = this;
    if (
      instance instanceof this.type ||
      (typeof instance !== "undefined" && instance.constructor === this.type) // FIXME: allow instance to be Undefined ?
    ) {
      // intanceof won't work with type "String" for example
      const context = {
        object: instance as unknown as T,
        get properties() {
          const propContext = {
            object: instance,
            model,
          };
          return resolve(MiddlewareChain(model.options.properties.toXML), propContext as any);
        },
        model: this,
      };
      return resolve(MiddlewareChain(this.options.toXML), context);
    } else {
      throw new TypeError(`provided object is not an instance of ${this.type.name}`);
    }
  }

  /** The typescript-rtti reflection metadata for the model's class. */
  get reflectedClass() {
    return reflect(this.type);
  }

  /**
   * Returns a merged map of all property options for this model, including inherited properties.
   * Own properties override parent properties with the same name.
   */
  resolveAllProperties() {
    type K = string;
    type V = XMLModelPropertyOptions<any> & { model: any };
    const ownProperties = new Map<K, V>();
    const parent = getParentModel(this);

    this.options.properties.options.forEach((options, key) => {
      ownProperties.set(
        key,
        new Proxy(options, {
          get: (target, p, reciever) => {
            if (p === "model") return this;
            else return Reflect.get(target, p, reciever);
          },
        }) as V, // FIXME: is typing ok ?
      );
    });
    const res: Map<K, V> = parent
      ? mergeMaps<K, V>(parent.resolveAllProperties(), ownProperties)
      : ownProperties;
    return res;
  }
}

/**
 * Creates and registers a new `XMLModel` for the given constructor.
 *
 * @param type - The class constructor to create a model for.
 * @param options - Model creation options including `fromXML` and `toXML` middlewares.
 * @returns The newly created `XMLModel`.
 * @throws {TypeError} When a model for this type has already been registered.
 */
export function createModel<T>(
  type: Constructor<T>,
  options: CreateXMLModelOptions<T>,
): XMLModel<T> {
  if (findModel(type)) {
    throw new TypeError(`a model for type ${type.name} already exists`);
  }
  const model = new XMLModel(type, options);
  registrerModel(model as XMLModel<unknown>);
  return model;
}

/**
 * Decorator factory that registers an `XMLModel` for the decorated class.
 *
 * Provide at minimum a `fromXML` function unless the class inherits from a
 * parent class that already has a model — the default `fromXML` throws.
 *
 * @param options - Optional model creation options.
 */
function ModelDecoratorFactory<T>(options?: CreateXMLModelOptions<T>) {
  return function (constructor: Constructor<T>): void {
    if (!findModel(constructor)) createModel<T>(constructor, options || {});
  };
}

export { getModel } from "./registry";
export { ModelDecoratorFactory as Model };
export { Prop } from "./property";

// register built-in models once everything is properly defined
registerBuiltIns(createModel);
