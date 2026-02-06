import type {
  fromXMLContext,
  PropertyFromXMLContext,
  PropertyToXMLContext,
  toXMLContext,
  XMLModelPropertyOptions,
  XMLModel,
} from "./model/types";

import { getModel } from "./model/registry";

import { kebabCase } from "./util/kebab-case";
import type { XMLElement, XMLRoot } from "./types";

interface Defaults {
  // XML -> Object
  fromXML<T>(context: fromXMLContext<T>): T;
  propertySourceElementsFilter<T>(
    ...args: Parameters<XMLModelPropertyOptions<T>["isSourceElement"]>
  ): boolean;
  propertyResolveSourceElements<T>(
    context: Omit<PropertyFromXMLContext<T>, "elements">,
  ): XMLElement[];
  propertyFromXML<T>(context: PropertyFromXMLContext<T>): T[keyof T];
  // Object -> XML
  toXML<T>(context: toXMLContext<T>): XMLRoot;
  tagnameFromModel: (model: XMLModel) => string;
  tagnameFromProperty<T>(property: XMLModelPropertyOptions<T>): string;
  propertyToXML<T>(context: PropertyToXMLContext<T>): XMLRoot;
}

export const defaults: Defaults = {
  fromXML() {
    throw new TypeError(
      "you should define 'defaults.fromXML' yourself or provide a 'fromXML' function to @Model() decorator's options",
    );
  },
  propertyResolveSourceElements(context) {
    // We assume context.xml.elements is a single tag containing all the props
    // FIXME: is it safe ?
    const innerElements: XMLElement[] = context.xml.elements[0]?.elements || [];
    return innerElements.filter((el) => context.property.isSourceElement(el, context));
  },
  propertySourceElementsFilter(element, context) {
    return context.property.tagname === element.name;
  },
  propertyFromXML(context) {
    // TODO: handle inline
    const prop = context.property;
    const elements = context.elements;

    if (prop.reflected.isOptional && elements.length === 0) {
      return undefined;
    }

    if (prop.model) {
      return prop.model.fromXML({ elements });
    }

    const type = context.property.reflected.type;
    if (type.is("class")) {
      const model = getModel(type.class);
      return model.fromXML({ elements: context.elements });
    } else if (type.is("array")) {
      let arrayEl: XMLElement = {};
      if (!prop.inline && elements.length === 1 && elements[0].name === prop.tagname) {
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
      // FIXME: other types should be handled
    } else if (type.is("union") && type.types.length && type.types[0].is("literal")) {
      const firstType = type.types[0];
      if (firstType.is("literal")) {
        const firstTypeCtor = firstType.value.constructor;
        if (
          type.types.every((type) => type.is("literal") && type.value.constructor === firstTypeCtor)
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
          // overwrite tagnames
          el.name = prop.tagname; // TODO: configurable ?
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

    const type = property.reflected.type;
    const value = context.value;
    if (property.reflected.isOptional && typeof value === "undefined") {
      return { elements: [] }; // FIXME should return unefined ???
    }

    if (property.model) {
      return property.model.toXML(value);
    }

    const getXML = () => {
      if (type.is("class")) {
        const model = getModel(type.class);
        return model.toXML(value);
      } else if (type.is("array")) {
        const elementType = type.elementType;
        if (elementType.is("class")) {
          const model = getModel(elementType.class);
          const elements: XMLElement[] = [];
          (value as object[]).forEach((el) => elements.push(...model.toXML(el).elements));
          return { elements: [{ type: "element", name: "array", elements }] };
        }
        // TODO: handle other types of array
      } else if (type.is("union") && type.types.length && type.types[0].is("literal")) {
        const firstType = type.types[0];
        if (firstType.is("literal")) {
          const firstTypeCtor = firstType.value.constructor;
          if (
            type.types.every(
              (type) => type.is("literal") && type.value.constructor === firstTypeCtor,
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
