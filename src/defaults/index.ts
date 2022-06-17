import { XMLModelOptions, XMLModel } from "../model";
import {
  getPropertyConversionOptions,
  XMLModelPropertyOptions,
} from "../model/property";
import { getModel } from "../model";

import kebabCase from "lodash/kebabCase";
import type { XMLElement, XMLRoot } from "../types";
import { Constructor, ReflectedProperty } from "typescript-rtti";

type defaults = {
  // XML -> Object
  fromXML: Required<XMLModelOptions<unknown>>["fromXML"];
  propertySourceElements: Extract<
    Required<XMLModelPropertyOptions<unknown>>["sourceElements"],
    Function
  >;
  propertyFromXML: Required<XMLModelPropertyOptions<unknown>>["fromXML"];
  // Object -> XML
  toXML: Required<XMLModelOptions<unknown>>["toXML"];
  tagnameFromModel: (model: XMLModel) => string;
  resolveTagnameForModel: (model: XMLModel) => string;
  tagnameFromProperty: (property: ReflectedProperty) => string;
  resolveTagnameForProperty: (property: ReflectedProperty) => string;
  propertyToXML: Required<XMLModelPropertyOptions<unknown>>["toXML"];
};

export const defaults: defaults = {
  fromXML() {
    throw new Error(
      "you should define 'defaults.fromXML' yourself or provide a 'fromXML' function to @Model() decorator's options"
    );
  },
  propertySourceElements(element, property) {
    return defaults.resolveTagnameForProperty(property) == element.name;
  },
  propertyFromXML(context) {
    const prop = context.property;
    const type = prop.type;
    if (type.is("class")) {
      const model = getModel(type.class);
      return model.fromXML(context.xml);
    } else if (type.is("array")) {
      const els = context.xml.elements;
      let arrayEl: XMLElement = {};
      if (
        els.length === 1 &&
        els[0].name === defaults.resolveTagnameForProperty(prop)
      ) {
        // we assume our array is contained in a root tag
        arrayEl = els[0];
      } else if (
        els.every((el) => el.name === defaults.resolveTagnameForProperty(prop))
      ) {
        // we assume our array is contained in xml.elements
        arrayEl = context.xml;
      }
      if (arrayEl.elements) {
        const elType = type.elementType;
        if (elType.is("class")) {
          const model = getModel(elType.class);
          const xmlInstances = arrayEl.elements.map((el) => ({
            elements: [el],
          }));
          return xmlInstances.map((xml) => model.fromXML(xml));
        }
      }
    } else if (
      type.is("union") &&
      type.types.length &&
      type.types[0].is("literal")
    ) {
      const firstType = type.types[0];
      if (firstType.is("literal")) {
        const firstTypeCtor = firstType.value.constructor;
        if (
          type.types.every(
            (type) =>
              type.is("literal") && type.value.constructor === firstTypeCtor
          )
        ) {
          // all elements of unions are litteral with same type
          const model = getModel(firstTypeCtor);
          return model.fromXML(context.xml);
        }
      }
    }

    // TODO: should warn ???
    return undefined;
  },
  /* Object -> XML */
  toXML({ properties, model }) {
    const elements: XMLElement[] = [];
    model.reflectedClass.properties.forEach((prop) => {
      if (prop.name in properties) {
        const _xml = properties[prop.name] as XMLRoot;
        // overwrite tagnames
        _xml.elements.forEach((el) => {
          (el.name = defaults.resolveTagnameForProperty(prop)), // TODO: configurable ?
            elements.push(el);
        });
      }
    });
    return {
      elements: [
        {
          type: "element",
          name: defaults.resolveTagnameForModel(model),
          elements,
        },
      ],
    };
  },
  tagnameFromModel(model) {
    return kebabCase(model.type.name);
  },
  resolveTagnameForModel(model) {
    if (model.options.tagname) return model.options.tagname;
    return defaults.tagnameFromModel(model);
  },
  tagnameFromProperty(property) {
    return kebabCase(property.name);
  },
  resolveTagnameForProperty(property) {
    // TODO: try to use property's tagname param if exists
    const options = getPropertyConversionOptions(
      property.class.class as Constructor<any>,
      property.name
    );
    if (options.tagname) return options.tagname;
    return defaults.tagnameFromProperty(property);
  },
  propertyToXML(context) {
    const type = context.property.type;
    if (type.is("class")) {
      const model = getModel(type.class);
      return model.toXML(context.object);
    } else if (type.is("array") && type.elementType.is("class")) {
      const elementType = type.elementType;
      if (elementType.is("class")) {
        const model = getModel(elementType.class);
        const elements: XMLElement[] = [];
        (context.object as object[]).forEach((el) =>
          elements.push(...model.toXML(el).elements)
        );
        return { elements: [{ type: "element", name: "array(", elements }] };
      }
      // TODO: handle other types of array
    }
    // TODO: should warn ???
    return { elements: [] };
  },
};
