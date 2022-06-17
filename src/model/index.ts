import "reflect-metadata";
import type { Constructor, ReflectedProperty } from "typescript-rtti";
import { reflect } from "typescript-rtti";

import { Middleware } from "../middleware";
import { fromXMLOptions, fromXMLMiddlewareContext, fromXML } from "../from-xml";
import { toXMLOptions, toXMLMiddlewareContext, toXML } from "../to-xml";
import { XMLModelProperty, XMLRootRecord } from "./types";
import { getPropertyConversionOptions } from "./property";
import { XMLRoot } from "../types";
import XML from "../xml";
import { defaults } from "../defaults";

interface ConversionOptions<T> {
  properties: {
    fromXML: fromXMLOptions<T>; // TODO: typing
    toXML: toXMLOptions<T>;
  };
  fromXML: fromXMLOptions<T>; // TODO: typing
  toXML: toXMLOptions<T>;
}

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
  for (const constructor of ParentChain(model.type)) {
    const model = findModel(constructor);
    if (model) {
      return model as XMLModel<any>;
    }
  }
  return null;
}

export interface XMLModelOptions<T> {
  fromXML?: Middleware<
    fromXMLMiddlewareContext & {
      properties: { [key in keyof T]: unknown };
      model: XMLModel<T>;
      constructor: Constructor<T>;
    },
    T
  >;
  tagname?: string;
  toXML?: Middleware<
    toXMLMiddlewareContext<T> & {
      properties: Partial<XMLRootRecord<T>>;
      model: XMLModel<T>;
    },
    XMLRoot
  >;
}

export class XMLModel<T = any> {
  conversionOptions?: ConversionOptions<T>;
  constructor(
    readonly type: Constructor<T>,
    readonly options: XMLModelOptions<T>
  ) {}
  private resolveConversionOptions(): ConversionOptions<T> {
    const parentModel = getParentModel(this);
    const options: ConversionOptions<T> = {
      properties: {
        toXML: {
          get parent() {
            return parentModel
              ? parentModel.getConversionOptions().properties.toXML
              : null;
          },
          middlewares: [],
        },
        fromXML: {
          get parent() {
            return parentModel
              ? parentModel.getConversionOptions().properties.fromXML
              : null;
          },
          middlewares: [],
        },
      },
      toXML: {
        get parent() {
          return parentModel ? parentModel.getConversionOptions().toXML : null;
        },
        middlewares: [],
      },
      fromXML: {
        get parent() {
          return parentModel
            ? parentModel.getConversionOptions().fromXML
            : null;
        },
        middlewares: [],
      },
    };
    const properties = reflect(this.type).ownProperties.filter(
      (prop) => typeof prop.host.constructor.prototype[prop.name] !== "function"
    ); // filter out methods like String.prototype.concat etc... that are seen as properties

    const propertyConversionOptions = properties.map((property) =>
      getPropertyConversionOptions(
        this.type,
        property.name as XMLModelProperty<T>
      )
    );

    /* Properties */
    // from XML
    function getProperties(context: fromXMLMiddlewareContext) {
      const props = {} as Parameters<
        NonNullable<XMLModelOptions<T>["fromXML"]>
      >[0]["properties"];
      for (const prop of propertyConversionOptions) {
        props[prop.name as keyof T] = prop.fromXML(context) as T[keyof T];
      }
      return props;
    }
    // to XML
    function getXMLProperties(context: toXMLMiddlewareContext<T>) {
      const record: Partial<XMLRootRecord<T>> = {};
      for (const prop of propertyConversionOptions) {
        record[prop.name as keyof T] = prop.toXML(context); // pass context as-is, property's value will be extracted later
      }
      return record;
    }

    /* Global */
    // from XML
    options.fromXML.middlewares.push((context, next) =>
      (
        this.options.fromXML ||
        (defaults.fromXML as Required<XMLModelOptions<T>>["fromXML"])
      )(
        {
          ...context,
          get properties() {
            return getProperties(context);
          },
          model: this,
          constructor: this.type,
        },
        next
      )
    );
    // to XML
    options.toXML.middlewares.push((context, next) =>
      (
        this.options.toXML ||
        (defaults.toXML as Required<XMLModelOptions<T>>["toXML"])
      )(
        {
          ...context,
          get properties() {
            return getXMLProperties(context);
          },
          model: this,
        },
        next
      )
    );

    return options;
  }
  getConversionOptions() {
    if (!this.conversionOptions) {
      this.conversionOptions = this.resolveConversionOptions();
    }
    return this.conversionOptions;
  }
  fromXML(xml: XMLRoot | string) {
    const _xml = typeof xml === "string" ? XML.parse(xml) : xml;
    return fromXML(_xml, this.getConversionOptions().fromXML);
  }
  toXML(instance: any) {
    if (instance instanceof this.type || instance.constructor === this.type) {
      // intanceof won't work with type "String" for example
      return toXML(instance, this.getConversionOptions().toXML);
    } else {
      throw new Error(
        `provided object is not an instance of ${this.type.name}`
      );
    }
  }
  get reflectedClass() {
    return reflect(this.type);
  }
}

export function createModel<T>(
  type: Constructor<T>,
  options: XMLModelOptions<T>
): XMLModel<T> {
  if (findModel(type)) {
    throw new Error(`a model for type ${type.name} already exists`);
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
  else throw new Error(`couln't find model for type ${id.name}`);
}

function ensureModel<T>(id: ModelID<T>) {
  return findModel<T>(id) || createModel<T>(id, {});
}

// Model decorator
function ModelDecoratorFactory<T>(options?: XMLModelOptions<T>) {
  return function (constructor: Constructor<T>): void {
    const model = ensureModel(constructor);
    if (options) {
      Object.assign(model.options, options);
    }
  };
}
export { ModelDecoratorFactory as Model };
export { Prop } from "./property";

import "../defaults/models";
