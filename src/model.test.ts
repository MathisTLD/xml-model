import { describe, it, expect } from "vitest";
import { z } from "zod";
import { xmlModel } from "./model";
import { xml, xmlCodec } from "./index";
import XML from "./xml";

// -----------------------------------------------------------------------
// Basic xmlModel
// -----------------------------------------------------------------------

class Book extends xmlModel(
  z.object({
    title: xml.prop(z.string()),
    year: xml.prop(z.number()),
  }),
  { tagname: "book" },
) {
  getTitle() {
    return `Title: ${this.title}`;
  }
}

describe("xmlModel", () => {
  it("creates class instances", () => {
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
    expect(Book.toXML(book).elements[0].name).toBe("book");
  });

  it("static toXMLString works", () => {
    const book = Book.fromXML("<book><title>Dune</title><year>1965</year></book>");
    const out = Book.toXMLString(book);
    expect(out).toContain("<book>");
    expect(out).toContain("<title>Dune</title>");
  });

  it("schema property is accessible", () => {
    expect(Book.schema).toBeDefined();
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

  it("two-step xml.model() + xmlModel() pattern still works", () => {
    const Schema = xml.model(z.object({ title: xml.prop(z.string()) }), { tagname: "article" });
    class Article extends xmlModel(Schema) {}
    const a = Article.fromXML("<article><title>Hello</title></article>");
    expect(a instanceof Article).toBe(true);
    expect(a.title).toBe("Hello");
    expect(Article.dataSchema).toBe(Schema);
  });
});

// -----------------------------------------------------------------------
// Composition — nested classes, attributes, inline arrays
// -----------------------------------------------------------------------

class Author extends xmlModel(
  z.object({
    firstName: xml.prop(z.string()),
    lastName: xml.prop(z.string()),
  }),
  { tagname: "author" },
) {
  fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

class Chapter extends xmlModel(
  z.object({
    number: xml.attr(z.number(), { name: "n" }),
    title: xml.prop(z.string()),
  }),
  { tagname: "chapter" },
) {}

class ComposedBook extends xmlModel(
  z.object({
    isbn: xml.attr(z.string(), { name: "isbn" }),
    title: xml.prop(z.string()),
    author: xml.prop(Author),
    chapters: xml.prop(z.array(Chapter.schema()), { inline: true }),
  }),
  { tagname: "book" },
) {
  chapterCount() {
    return this.chapters.length;
  }
}

class Library extends xmlModel(
  z.object({
    name: xml.attr(z.string(), { name: "name" }),
    books: xml.prop(z.array(ComposedBook.schema()), { inline: true }),
  }),
  { tagname: "library" },
) {}

const libraryXml = `<library name="City Library"><book isbn="978-0-7432-7356-5"><title>The Road</title><author><first-name>Cormac</first-name><last-name>McCarthy</last-name></author><chapter n="1"><title>The Beginning</title></chapter><chapter n="2"><title>The Journey</title></chapter></book><book isbn="978-0-14-028329-7"><title>Blood Meridian</title><author><first-name>Cormac</first-name><last-name>McCarthy</last-name></author><chapter n="1"><title>The Kid</title></chapter></book></library>`;

describe("composition", () => {
  it("parses nested classes and attributes", () => {
    const lib = Library.fromXML(libraryXml);
    expect(lib.name).toBe("City Library");
    expect(lib.books).toHaveLength(2);
    expect(lib.books[0].isbn).toBe("978-0-7432-7356-5");
    expect(lib.books[0].title).toBe("The Road");
    expect(lib.books[0].author.firstName).toBe("Cormac");
    expect(lib.books[0].chapters[0].number).toBe(1);
  });

  it("instantiates nested classes correctly", () => {
    const lib = Library.fromXML(libraryXml);
    expect(lib.books[0]).toBeInstanceOf(ComposedBook);
    expect(lib.books[0].author).toBeInstanceOf(Author);
    expect(lib.books[0].chapters[0]).toBeInstanceOf(Chapter);
  });

  it("class methods work on nested instances", () => {
    const lib = Library.fromXML(libraryXml);
    expect(lib.books[0].author.fullName()).toBe("Cormac McCarthy");
    expect(lib.books[0].chapterCount()).toBe(2);
  });

  it("round-trips to identical XML", () => {
    const lib = Library.fromXML(libraryXml);
    expect(XML.stringify(xmlCodec(Library.dataSchema).toXML(lib))).toBe(libraryXml);
  });
});
