import { createModel } from "../model";
import { Constructor, XMLRoot } from "../types";
import { getContent, fromContent } from "../xml";

// string is <string>value</string>
createModel<string>(String as unknown as Constructor<string>, {
  toXML: (ctx): XMLRoot => {
    return {
      elements: [fromContent(ctx.object, "string")],
    };
  },
  fromXML: (ctx) => {
    return String(getContent(ctx.xml.elements[0]));
  },
});

// number is <number>value</number>
createModel<number>(Number as unknown as Constructor<number>, {
  toXML: (ctx): XMLRoot => {
    return {
      elements: [fromContent(String(ctx.object), "number")],
    };
  },
  fromXML: (ctx) => {
    return Number(getContent(ctx.xml.elements[0]));
  },
});

// number is <boolean>value</boolean>
createModel<boolean>(Boolean as unknown as Constructor<boolean>, {
  toXML: (ctx) => {
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
  fromXML: (ctx) => {
    return Boolean(getContent(ctx.xml.elements[0]));
  },
});
