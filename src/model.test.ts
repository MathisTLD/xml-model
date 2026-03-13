import { describe, it, expect } from "vitest";
import { z } from "zod";
import { xmlModel } from "./model";
import { xml } from "./schema-meta";

const BookSchema = xml.model(
  z.object({
    title: xml.prop(z.string()),
    year: xml.prop(z.number()),
  }),
  { tagname: "book" },
);

class Book extends xmlModel(BookSchema) {
  getTitle() {
    return `Title: ${this.title}`;
  }
}

describe("xmlModel", () => {
  it("creates class instances with instanceof", () => {
    const book = Book.fromXML("<book><title>Dune</title><year>1965</year></book>");
    expect(book instanceof Book).toBe(true);
  });

  it("exposes schema properties on instance", () => {
    const book = Book.fromXML("<book><title>Dune</title><year>1965</year></book>");
    expect(book.title).toBe("Dune");
    expect(book.year).toBe(1965);
  });

  it("allows class methods on parsed instances", () => {
    const book = Book.fromXML("<book><title>Dune</title><year>1965</year></book>");
    expect(book.getTitle()).toBe("Title: Dune");
  });

  it("static toXML works", () => {
    const book = Book.fromXML("<book><title>Dune</title><year>1965</year></book>");
    const root = Book.toXML(book);
    expect(root.elements[0].name).toBe("book");
  });

  it("static toXMLString works", () => {
    const book = Book.fromXML("<book><title>Dune</title><year>1965</year></book>");
    const xmlStr = Book.toXMLString(book);
    expect(xmlStr).toContain("<book>");
    expect(xmlStr).toContain("<title>Dune</title>");
  });

  it("schema property is accessible", () => {
    expect(Book.schema).toBe(BookSchema);
  });

  it("constructor accepts plain data objects", () => {
    const book = new Book({ title: "Foundation", year: 1951 });
    expect(book instanceof Book).toBe(true);
    expect(book.title).toBe("Foundation");
    expect(book.year).toBe(1951);
  });

  it("subclass fromXML returns subclass instances", () => {
    class SpecialBook extends Book {
      isSpecial() {
        return true;
      }
    }
    const book = SpecialBook.fromXML("<book><title>Dune</title><year>1965</year></book>");
    expect(book instanceof SpecialBook).toBe(true);
    expect(book instanceof Book).toBe(true);
    expect((book as any).isSpecial()).toBe(true);
  });
});
