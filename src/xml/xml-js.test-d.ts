import { describe, expect, test } from "vitest";
import { XML } from "./xml-js";
import type { XMLRoot } from "./xml-js";

describe("XML", () => {
  test("XML.stringify only accepts XMLRoot", () => {
    const xml: XMLRoot = { elements: [{ type: "element", name: "car", elements: [] }] };
    expect(XML.stringify(xml)).toBe("<car/>");
    // @ts-expect-error
    expect(XML.stringify(xml.elements[0])).toBe("");
  });
});
