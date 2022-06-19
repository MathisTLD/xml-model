import "mocha";
import { expect, assert } from "chai";

import { Model, Prop, getModel } from "./model";
import XML from "./xml";
import { reflect, ReflectedClass } from "typescript-rtti";
import { UnknownRecord } from "./types";

@Model({
  fromXML({ model, properties }) {
    return new model.type(properties);
  },
})
class Book {
  name: string;
  nbPages: number;
  constructor(options: { name: string; nbPages: number }) {
    this.name = options.name;
    this.nbPages = options.nbPages;
  }
  equals(book: Book) {
    if (this.name !== book.name) return false;
    if (this.nbPages !== book.nbPages) return false;
    return true;
  }
}

@Model<Library>({
  fromXML({ model, properties }) {
    return new model.type(properties.name, ...(properties.books as Book[]));
  },
})
class Library {
  name: string;
  books: Book[] = [];
  constructor(name: string, ...books: Book[]) {
    this.name = name;
    this.books.push(...books);
  }
  equals(library: Library) {
    if (this.name !== library.name) return false;
    if (this.books.length !== library.books.length) return false;
    for (let index = 0; index < this.books.length; index++) {
      if (!this.books[index].equals(library.books[index])) return false;
    }
    return true;
  }
}

describe("Library Example", () => {
  const library = new Library("test");
  for (let i = 1; i <= 4; i++) {
    const book = new Book({ name: `Book #${i}`, nbPages: Math.pow(10, i) });
    library.books.push(book);
  }
  const libraryXMLString = XML.stringify(
    XML.parse(
      `<library>
    <name>${library.name}</name>
    <books>
      ${library.books
        .map(
          (book) =>
            `     <book>
        <name>${book.name}</name>
        <nb-pages>${book.nbPages}</nb-pages>
      </book>`
        )
        .join("")}
    </books>
</library>`
    )
  );

  it("Object -> XML", () => {
    const xml = getModel(Library).toXML(library);
    expect(XML.stringify(xml)).to.equal(libraryXMLString);
  });
  it("XML -> Object", () => {
    const parsedLibrary = getModel(Library).fromXML(libraryXMLString);
    expect(parsedLibrary instanceof Library).to.be.true;
    expect(library.equals(parsedLibrary as Library)).to.be.true;
  });
});

@Model({
  fromXML({ model, properties }) {
    return new model.type(properties);
  },
})
class A {
  propA: string = "";
  propB: boolean = true;
  @Prop({ tagname: "b", inline: true })
  propC: B[] = [];
  @Prop({ tagname: "propd" })
  propD: 0 | 1 = 0;
  equals(a: A) {
    //
    if (
      this.propA !== a.propA ||
      this.propB !== a.propB ||
      this.propC.length !== a.propC.length ||
      this.propD !== a.propD
    )
      return false;
    for (let i = 0; i < this.propC.length; i++) {
      if (!this.propC[i].equals(a.propC[i])) return false;
    }
    return true;
  }
  constructor(record?: UnknownRecord) {
    if (record)
      Object.entries(record).forEach(([key, val]) => {
        (this[key as keyof A] as any) = val as any;
      });
  }
}

@Model({
  fromXML({ model, properties }) {
    return new model.type(properties);
  },
})
class B {
  propA: number = 0;
  equals(b: B) {
    return this.propA === b.propA;
  }
  constructor(record?: UnknownRecord) {
    if (record)
      Object.entries(record).forEach(([key, val]) => {
        (this[key as keyof B] as any) = val as any;
      });
  }
}

describe("Edgy Cases", () => {
  const instance = new A();
  for (let i = 0; i < 8; i++) {
    const b = new B();
    b.propA = i;
    instance.propC.push(b);
  }

  const instanceXMLString = XML.stringify(
    XML.parse(`<a>
  <prop-a>${instance.propA}</prop-a>
  <prop-b>${instance.propB}</prop-b>
  ${instance.propC.map((b) => `<b><prop-a>${b.propA}</prop-a></b>`).join("")}
  <propd>${instance.propD}</propd>
</a>`)
  );

  it("should give right type infos", () => {
    const reflectedA = reflect(A) as unknown as ReflectedClass;
    assert(reflectedA === <ReflectedClass>(<unknown>reflect(A)));
    expect(reflectedA.getProperty("propA").type.isClass(String)).to.be.true;
    expect(reflectedA.getProperty("propB").type.isClass(Boolean)).to.be.true;
    const ModelAPropCType = reflectedA.getProperty("propC").type;
    expect(
      ModelAPropCType.is("array") && ModelAPropCType.elementType.isClass(B)
    ).to.be.true;
    const ModelAPropDType = reflectedA.getProperty("propD").type;
    expect(ModelAPropDType.is("union")).to.be.true;
  });

  it("XML -> Object", () => {
    const parsed = getModel(A).fromXML(instanceXMLString);
    expect(parsed instanceof A).to.be.true;
    const equals = instance.equals(parsed as A);
    expect(equals).to.be.true;
  });
  it("Object -> XML", () => {
    const xml = getModel(A).toXML(instance);
    expect(XML.stringify(xml)).to.equal(instanceXMLString);
  });
});
