import { expect, test } from "vitest";

export class Book {
  name: string;
  nbPages: number;
  constructor(options: { name: string; nbPages: number }) {
    this.name = options.name;
    this.nbPages = options.nbPages;
  }
}

test("expect name is not changed", () => {
  expect(Book.name).toBe("Book");
});
