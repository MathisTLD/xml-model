import "mocha";
import { expect, assert } from "chai";

import "reflect-metadata";

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
    expect(parsedLibrary).to.deep.equal(library);
  });
});

@Model({
  fromXML({ model, properties }) {
    return new model.type(properties);
  },
})
class A {
  propA = "";
  propB = true;
  @Prop({ tagname: "b", inline: true })
  propC: B[] = [];
  @Prop({ tagname: "propd" })
  propD: 0 | 1 = 0;
  constructor(record?: UnknownRecord) {
    if (record)
      Object.entries(record).forEach(([key, val]) => {
        (this[key as keyof A] as any) = val as any;
      });
  }
  @Prop({ tagname: "array-e", inline: true })
  arrayE: number[] = [];
}

@Model({
  fromXML({ model, properties }) {
    return new model.type(properties);
  },
})
class B {
  propA = 0;
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
    instance.arrayE.push(i * 100);
  }

  const instanceXMLString = XML.stringify(
    XML.parse(`<a>
  <prop-a>${instance.propA}</prop-a>
  <prop-b>${instance.propB}</prop-b>
  ${instance.propC.map((b) => `<b><prop-a>${b.propA}</prop-a></b>`).join("")}
  <propd>${instance.propD}</propd>
  ${instance.arrayE.map((e) => `<array-e>${e}</array-e>`).join("\n")}
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
    expect(parsed).to.deep.equal(instance);
  });
  it("Object -> XML", () => {
    const xml = getModel(A).toXML(instance);
    expect(XML.stringify(xml)).to.equal(instanceXMLString);
  });
});

@Model()
class C extends B {
  propB = 3;
}

describe("Inheritance", () => {
  const cInstance = new C();
  const cInstanceXMLString = `<c><prop-a>${cInstance.propA}</prop-a><prop-b>${cInstance.propB}</prop-b></c>`;

  it("XML -> Object", () => {
    expect(getModel(C).fromXML(cInstanceXMLString)).to.deep.equal(cInstance);
  });
  it("Object -> XML", () => {
    expect(XML.stringify(getModel(C).toXML(cInstance))).to.equal(
      cInstanceXMLString
    );
  });
});
