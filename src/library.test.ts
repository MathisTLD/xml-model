import { describe, it, expect } from "vitest";
import { z } from "zod";
import { xml, xmlCodec, xmlModel } from "./index";
import XML from "./xml";

// --- Schemas ---

const AuthorSchema = xml.model(
  z.object({
    firstName: xml.prop(z.string()),
    lastName: xml.prop(z.string()),
  }),
  { tagname: "author" },
);

const ChapterSchema = xml.model(
  z.object({
    number: xml.attr(z.number(), { name: "n" }),
    title: xml.prop(z.string()),
  }),
  { tagname: "chapter" },
);

const BookSchema = xml.model(
  z.object({
    isbn: xml.attr(z.string(), { name: "isbn" }),
    title: xml.prop(z.string()),
    author: xml.prop(AuthorSchema),
    chapters: xml.prop(z.array(ChapterSchema), { inline: true }),
  }),
  { tagname: "book" },
);

const LibrarySchema = xml.model(
  z.object({
    name: xml.attr(z.string(), { name: "name" }),
    books: xml.prop(z.array(BookSchema), { inline: true }),
  }),
  { tagname: "library" },
);

// --- Classes ---

class Author extends xmlModel(AuthorSchema) {
  fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

class Book extends xmlModel(BookSchema) {
  chapterCount() {
    return this.chapters.length;
  }
}

// --- Fixtures ---

const libraryXml = `<library name="City Library"><book isbn="978-0-7432-7356-5"><title>The Road</title><author><first-name>Cormac</first-name><last-name>McCarthy</last-name></author><chapter n="1"><title>The Beginning</title></chapter><chapter n="2"><title>The Journey</title></chapter></book><book isbn="978-0-14-028329-7"><title>Blood Meridian</title><author><first-name>Cormac</first-name><last-name>McCarthy</last-name></author><chapter n="1"><title>The Kid</title></chapter></book></library>`;

const codec = xmlCodec(LibrarySchema);

describe("library composition", () => {
  it("parses library name attribute", () => {
    const library = codec.fromXML(libraryXml);
    expect(library.name).toBe("City Library");
  });

  it("parses inline array of books", () => {
    const library = codec.fromXML(libraryXml);
    expect(library.books).toHaveLength(2);
  });

  it("parses book attributes and nested fields", () => {
    const library = codec.fromXML(libraryXml);
    expect(library.books[0].isbn).toBe("978-0-7432-7356-5");
    expect(library.books[0].title).toBe("The Road");
  });

  it("parses nested object (author)", () => {
    const library = codec.fromXML(libraryXml);
    expect(library.books[0].author.firstName).toBe("Cormac");
    expect(library.books[0].author.lastName).toBe("McCarthy");
  });

  it("parses inline array of chapters with numeric attribute", () => {
    const library = codec.fromXML(libraryXml);
    expect(library.books[0].chapters).toHaveLength(2);
    expect(library.books[0].chapters[0].number).toBe(1);
    expect(library.books[0].chapters[0].title).toBe("The Beginning");
  });

  it("round-trips to identical XML", () => {
    const library = codec.fromXML(libraryXml);
    const reserialized = XML.stringify(codec.toXML(library));
    expect(reserialized).toBe(libraryXml);
  });
});

describe("Book class", () => {
  const bookXml = `<book isbn="978-0-7432-7356-5"><title>The Road</title><author><first-name>Cormac</first-name><last-name>McCarthy</last-name></author><chapter n="1"><title>One</title></chapter><chapter n="2"><title>Two</title></chapter><chapter n="3"><title>Three</title></chapter></book>`;

  it("fromXML returns Book instance", () => {
    const book = Book.fromXML(bookXml);
    expect(book instanceof Book).toBe(true);
  });

  it("chapterCount() method works", () => {
    const book = Book.fromXML(bookXml);
    expect(book.chapterCount()).toBe(3);
  });
});

describe("Author class", () => {
  it("fullName() method works", () => {
    const author = Author.fromXML(
      `<author><first-name>Cormac</first-name><last-name>McCarthy</last-name></author>`,
    );
    expect(author.fullName()).toBe("Cormac McCarthy");
  });
});
