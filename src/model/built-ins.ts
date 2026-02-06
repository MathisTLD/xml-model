import type { createModel } from ".";
import type { Constructor } from "../types";
import { getContent, fromContent } from "../xml";

export default function registerBuiltIns(create: typeof createModel) {
  // string is <string>value</string>
  create<string>(String as unknown as Constructor<string>, {
    toXML(ctx) {
      return {
        elements: [fromContent(ctx.object, "string")],
      };
    },
    fromXML(ctx) {
      return String(getContent(ctx.xml.elements[0]));
    },
  });

  // number is <number>value</number>
  create<number>(Number as unknown as Constructor<number>, {
    toXML(ctx) {
      return {
        elements: [fromContent(String(ctx.object), "number")],
      };
    },
    fromXML(ctx) {
      return Number(getContent(ctx.xml.elements[0]));
    },
  });

  // number is <boolean>value</boolean>
  create<boolean>(Boolean as unknown as Constructor<boolean>, {
    toXML(ctx) {
      return {
        elements: [
          {
            type: "element",
            name: "boolean",
            ...fromContent(String(ctx.object)),
          },
        ],
      };
    },
    fromXML(ctx) {
      return Boolean(getContent(ctx.xml.elements[0]));
    },
  });
}
