import type { XMLModelPropertyOptions } from "../model/types";

import type { XMLModelOptions, XMLModel } from "../model/types";
import { getModel } from "../model";

import kebabCase from "lodash/kebabCase";
import type { XMLElement, XMLRoot } from "../types";

type defaults<T = any> = {
  // XML -> Object
  fromXML: Required<XMLModelOptions<T>>["fromXML"]["middlewares"][number];
  propertySourceElementsFilter: XMLModelPropertyOptions<T>["isSourceElement"];
  propertyResolveSourceElements: XMLModelPropertyOptions<T>["resolveElements"];
  propertyFromXML: Required<XMLModelPropertyOptions<T>>["fromXML"];
  // Object -> XML
  toXML: Required<XMLModelOptions<T>>["toXML"]["middlewares"][number];
  tagnameFromModel: (model: XMLModel) => string;
  tagnameFromProperty: (property: XMLModelPropertyOptions<T>) => string;
  propertyToXML: Required<XMLModelPropertyOptions<T>>["toXML"];
};

export const defaults: defaults = {
  fromXML() {
    throw new TypeError(
      "you should define 'defaults.fromXML' yourself or provide a 'fromXML' function to @Model() decorator's options"
    );
  },
  propertyResolveSourceElements(context) {
    // We assume context.xml.elements is a single tag containing all the props
    // FIXME: is it safe ?
    const innerElements: XMLElement[] = context.xml.elements[0]?.elements || [];
    return innerElements.filter((el) =>
      context.property.isSourceElement(el, context)
    );
  },
  propertySourceElementsFilter(element, context) {
    return context.property.tagname === element.name;
  },
  propertyFromXML(context) {
    // TODO: handle inline
    const prop = context.property;
    const elements = context.elements;

    if (prop.model) {
      return prop.model.fromXML({ elements });
    }

    const type = context.property.reflected.type;
    if (prop.reflected.isOptional && elements.length === 0) {
      return undefined;
    }
    if (type.is("class")) {
      const model = getModel(type.class);
      return model.fromXML({ elements: context.elements });
    } else if (type.is("array")) {
      let arrayEl: XMLElement = {};
      if (
        !prop.inline &&
        elements.length === 1 &&
        elements[0].name === prop.tagname
      ) {
        // we assume our array is contained in a root tag
        arrayEl = elements[0];
      } else if (prop.inline) {
        // we assume our array is contained in xml.elements
        arrayEl = { elements };
      }
      const els = arrayEl.elements || [];
      const elType = type.elementType;
      if (elType.is("class")) {
        const model = getModel(elType.class);
        const xmlInstances = els.map((el) => ({
          elements: [el],
        }));
        return xmlInstances.map((xml) => model.fromXML(xml));
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
          return model.fromXML({ elements });
        }
      }
    }

    // TODO: should warn ???
    return undefined;
  },
  /* Object -> XML */
  toXML({ properties, model }) {
    const elements: XMLElement[] = [];

    model.resolveAllProperties().forEach((prop) => {
      if (prop.name in properties && typeof prop.name !== "symbol") {
        // FIXME: prop.name should never be a symbol anyway
        const _xml = properties[prop.name] as XMLRoot;

        _xml.elements.forEach((el) => {
          if (!prop.inline) {
            // overwrite tagnames
            el.name = prop.tagname; // TODO: configurable ?
          }
          elements.push(el);
        });
      }
    });
    return {
      elements: [
        {
          type: "element",
          name: model.options.tagname,
          elements,
        },
      ],
    };
  },
  tagnameFromModel(model) {
    return kebabCase(model.type.name);
  },
  tagnameFromProperty(property) {
    return kebabCase(String(property.name));
  },
  propertyToXML(context) {
    const property = context.property;

    if (property.model) {
      return property.model.toXML(context.value);
    }

    const type = property.reflected.type;
    const value = context.value;
    if (property.reflected.isOptional && typeof value === "undefined") {
      return { elements: [] }; // FIXME should return unefined ???
    }
    const getXML = () => {
      if (type.is("class")) {
        const model = getModel(type.class);
        return model.toXML(value);
      } else if (type.is("array") && type.elementType.is("class")) {
        const elementType = type.elementType;
        if (elementType.is("class")) {
          const model = getModel(elementType.class);
          const elements: XMLElement[] = [];
          (value as object[]).forEach((el) =>
            elements.push(...model.toXML(el).elements)
          );
          return { elements: [{ type: "element", name: "array", elements }] };
        }
        // TODO: handle other types of array
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
            return model.toXML(context.value);
          }
        }
      }
      // TODO: should warn ???
      return { elements: [] };
    };
    const xml = getXML();
    if (context.property.inline)
      return { elements: xml.elements.map((el) => el.elements || []).flat() };
    else return xml;
  },
};
