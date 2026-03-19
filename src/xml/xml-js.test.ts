import { describe, expect, test } from "vitest";
import { XML } from "./xml-js";
import type { XMLRoot } from "./xml-js";
import { xml2js } from "xml-js";

const singleRoot = `<car vin="VIN001"><make>Toyota</make><year>2020</year><doors>4</doors><engine type="petrol"><horsepower>150</horsepower></engine></car>`;
const multiRoot = singleRoot + singleRoot;
const comment = `<!-- a comment -->`;
const singleRootWithComment = `${comment}${singleRoot}`;

describe("XML", () => {
  test("Single root", () => {
    const xml = XML.parse(singleRoot);
    expect(xml.elements).toBeDefined();
  });

  test("Single root with comment", () => {
    const xml = XML.parse(singleRootWithComment);
    expect(xml.elements).toBeDefined();
  });

  test("Empty is disallowed", () => {
    // empty passes in xml2js...
    expect(xml2js("")).toEqual({});
    // ...but not without our refinement
    expect(() => XML.parse("")).toThrow();
  });

  test("Comment only", () => {
    const xml = XML.parse(comment);
    expect(xml.elements).toBeDefined();
  });

  test("XML.parse doesn't allow more than one root element", () => {
    expect(() => XML.parse(multiRoot)).toThrow("Text data outside of root node.");
  });

  test("XML.stringify only works with XMLRoot", () => {
    const xml: XMLRoot = { elements: [{ type: "element", name: "car", elements: [] }] };
    expect(XML.stringify(xml)).toBe("<car/>");
    // @ts-ignore
    expect(XML.stringify(xml.elements[0])).toBe("");
  });
});
