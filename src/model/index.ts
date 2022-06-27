import type { Constructor } from "typescript-rtti";
import { reflect } from "typescript-rtti";

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

function getParentModel(model: XMLModel<any>) {
  if (model.options.parent) return model.options.parent;
  for (const constructor of ParentChain(model.type)) {
    const model = findModel(constructor);
    if (model) {
      return model as XMLModel<any>;
    }
  }
  return null;
}

export class XMLModel<T = any> {
  options: XMLModelOptions<T>;
  constructor(
    readonly type: Constructor<T>,
    options: CreateXMLModelOptions<T>
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
              try {
                record[property.name] = property.fromXML({
                  model,
                  xml: context.xml,
                  property,
                  elements,
                });
              } catch (error) {
                throw new XMLConversionError(
                  `[Model: ${
                    context.model.type.name
                  }] failed to convert prop <${String(
                    property.name
                  )}> from XML`,
                  error
                );
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
              try {
                record[options.name] = options.toXML({
                  model,
                  object: context.object,

                  property: options,
                  value: context.object[options.name],
                });
              } catch (error) {
                throw new XMLConversionError(
                  `[Model: ${
                    context.model.type.name
                  }] failed to convert prop <${String(options.name)}> to XML`,
                  error
                );
              }
            });
            return record;
          },
        ],
      },
    };
    const loadProperties = () => {
      const props = reflect(this.type).ownProperties.filter(
        (prop) =>
          typeof prop.host.constructor.prototype[prop.name] !== "function"
      ); // filter out methods like String.prototype.concat etc... that are seen as properties

      props.forEach((property) => {
        const options = getPropertyConversionOptions(
          this.type,
          property.name as XMLModelProperty<T>
        );
        if (!options.ignored) {
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
      this.options.fromXML.middlewares.push((...args) =>
        defaults.fromXML(...args)
      );
      this.options.toXML.middlewares.push((...args) => defaults.toXML(...args));
    }
    if (options.fromXML) this.options.fromXML.middlewares.push(options.fromXML);
    if (options.toXML) this.options.toXML.middlewares.push(options.toXML);
  }
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
        return resolve(
          MiddlewareChain(model.options.properties.fromXML),
          propContext
        );
      },
      model,
    };
    return resolve(MiddlewareChain(this.options.fromXML), context);
  }
  toXML(instance: object) {
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
          return resolve(
            MiddlewareChain(model.options.properties.toXML),
            propContext as any
          );
        },
        model: this,
      };
      return resolve(MiddlewareChain(this.options.toXML), context);
    } else {
      throw new TypeError(
        `provided object is not an instance of ${this.type.name}`
      );
    }
  }
  get reflectedClass() {
    return reflect(this.type);
  }
  resolveAllProperties() {
    const properties = new Map<
      string,
      XMLModelPropertyOptions<any> & { model: any }
    >();
    const parent = getParentModel(this);
    if (parent)
      parent
        .resolveAllProperties()
        .forEach((prop, key) => properties.set(key, prop));
    this.options.properties.options.forEach((options, key) =>
      properties.set(
        key,
        new Proxy(options, {
          get: (target, p, reciever) => {
            if (p === "model") return this;
            else return Reflect.get(target, p, reciever);
          },
        }) as NonNullable<ReturnType<typeof properties["get"]>>
      )
    );
    return properties;
  }
}

export function createModel<T>(
  type: Constructor<T>,
  options: CreateXMLModelOptions<T>
): XMLModel<T> {
  if (findModel(type)) {
    throw new TypeError(`a model for type ${type.name} already exists`);
  }
  const model = new XMLModel(type, options);
  Models.set(type, model as XMLModel<unknown>);
  return model;
}

type ModelID<T> = Constructor<T>;
export const Models = new Map<ModelID<unknown>, XMLModel<unknown>>();

export function findModel<T>(id: ModelID<T>) {
  return Models.get(id) as XMLModel<T> | undefined;
}

export function getModel<T>(id: ModelID<T>) {
  const model = findModel(id);
  if (model) return model;
  else throw new TypeError(`couln't find model for type ${id.name}`);
}

// Model decorator
function ModelDecoratorFactory<T>(options?: CreateXMLModelOptions<T>) {
  return function (constructor: Constructor<T>): void {
    findModel<T>(constructor) || createModel<T>(constructor, options || {});
  };
}
export { ModelDecoratorFactory as Model };
export { Prop } from "./property";

import "../defaults/models";
import { XMLConversionError } from "../errors";
