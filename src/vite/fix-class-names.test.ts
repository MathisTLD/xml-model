import { describe, expect, test } from "vitest";
import { fixClassNames } from "./fix-class-names";

describe("fixClassNames", () => {
  test("renames mismatched class name", () => {
    expect(fixClassNames("let MyClass = class MyClass2 {")).toBe("let MyClass = class MyClass {");
  });

  test("names anonymous class", () => {
    expect(fixClassNames("let MyClass = class {")).toBe("let MyClass = class MyClass {");
  });

  test("handles const", () => {
    expect(fixClassNames("const MyClass = class MyClass2 {")).toBe(
      "const MyClass = class MyClass {",
    );
  });

  test("handles var", () => {
    expect(fixClassNames("var MyClass = class MyClass2 {")).toBe("var MyClass = class MyClass {");
  });

  test("handles export let", () => {
    expect(fixClassNames("export let MyClass = class MyClass2 {")).toBe(
      "export let MyClass = class MyClass {",
    );
  });

  test("renames class before extends", () => {
    expect(fixClassNames("let Dog = class Dog2 extends Animal {")).toBe(
      "let Dog = class Dog extends Animal {",
    );
  });

  test("names anonymous class before extends", () => {
    expect(fixClassNames("let Dog = class extends Animal {")).toBe(
      "let Dog = class Dog extends Animal {",
    );
  });

  test("leaves already-correct class name unchanged", () => {
    expect(fixClassNames("let MyClass = class MyClass {")).toBe("let MyClass = class MyClass {");
  });

  test("handles multiple classes in one chunk", () => {
    const input = [
      "let Foo = class Foo2 {",
      "let Bar = class {",
      "let Baz = class Baz extends Foo {",
    ].join("\n");
    expect(fixClassNames(input)).toBe(
      ["let Foo = class Foo {", "let Bar = class Bar {", "let Baz = class Baz extends Foo {"].join(
        "\n",
      ),
    );
  });
});
