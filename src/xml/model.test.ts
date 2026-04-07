import { describe, it, expect } from "vite-plus/test";
import { z } from "zod";
import { xmlModel } from "./model";
import { xml } from "./schema-meta";
import { XML, type XMLRoot } from "./xml-js";
import {
  Vehicle,
  Car,
  SportCar,
  Motorcycle,
  Fleet,
  Engine,
  CarStandalone,
  Showroom,
} from "./examples";
import { xmlStateSchema } from "./codec";

/* eslint-disable typescript-eslint(unbound-method) */

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

type XMLLike = string | XMLRoot;

function prettifyXML(input: XMLLike) {
  const root = typeof input === "string" ? XML.parse(input) : input;
  return XML.stringify(root, { spaces: 2 });
}

// -----------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------

const carXml =
  '<car vin="VIN001"><make>Toyota</make><year>2020</year><doors>4</doors><engine type="petrol"><horsepower>150</horsepower></engine></car>';

const sportCarXml =
  '<sport-car vin="VIN004"><make>Ferrari</make><year>2023</year><doors>2</doors><engine type="petrol"><horsepower>710</horsepower></engine><top-speed>320</top-speed></sport-car>';

const motorcycleXml =
  '<motorcycle vin="VIN003"><make>Kawasaki</make><year>2019</year></motorcycle>';

const motorcycleWithSidecarXml =
  '<motorcycle vin="VIN005"><make>Ural</make><year>2018</year><sidecar>true</sidecar></motorcycle>';

const fleetXml =
  '<fleet name="Acme Fleet">' +
  '<car vin="VIN001"><make>Toyota</make><year>2020</year><doors>4</doors><engine type="petrol"><horsepower>150</horsepower></engine></car>' +
  '<car vin="VIN002"><make>Honda</make><year>2021</year><doors>2</doors><engine type="electric"><horsepower>204</horsepower></engine></car>' +
  '<motorcycle vin="VIN003"><make>Kawasaki</make><year>2019</year></motorcycle>' +
  "</fleet>";

// -----------------------------------------------------------------------
// xmlModel basics
// -----------------------------------------------------------------------

describe("xmlModel", () => {
  it("creates class instances", () => {
    const car = Car.fromXML(carXml);
    expect(car).toBeInstanceOf(Car);
  });

  it("exposes element fields on instance", () => {
    const car = Car.fromXML(carXml);
    expect(car.make).toBe("Toyota");
    expect(car.year).toBe(2020);
    expect(car.doors).toBe(4);
  });

  it("reads xml.attr fields from root element attributes", () => {
    const car = Car.fromXML(carXml);
    expect(car.vin).toBe("VIN001");
  });

  it("static toXML returns XMLRoot with correct root tag", () => {
    const car = Car.fromXML(carXml);
    const xml = Car.toXML(car);
    const el = XML.elementFromRoot(xml)!;
    expect(el.name).toBe("car");
  });

  it("static toXMLString contains expected elements and attributes", () => {
    const car = Car.fromXML(carXml);
    const out = Car.toXMLString(car);
    expect(prettifyXML(out)).toEqual(prettifyXML(carXml));
  });

  it("static schema() is accessible", () => {
    expect(Car.schema).toBeDefined();
  });

  it("constructor accepts plain data objects", () => {
    const engine = new Engine({ type: "diesel", horsepower: 180 });
    expect(engine).toBeInstanceOf(Engine);
    expect(engine.type).toBe("diesel");
    expect(engine.horsepower).toBe(180);
  });

  it("two-step xml.root() + xmlModel() pattern works", () => {
    const Schema = xml.root(z.object({ make: z.string() }), { tagname: "vehicle" });
    class SimpleVehicle extends xmlModel(Schema) {}
    const v = SimpleVehicle.fromXML("<vehicle><make>Ford</make></vehicle>");
    expect(v).toBeInstanceOf(SimpleVehicle);
    expect(v.make).toBe("Ford");
    expect(SimpleVehicle.dataSchema).toBe(Schema);
  });

  it("fromData() hook allows custom instantiation", () => {
    class CustomCar extends Car {
      extra = "injected";
      static fromData<T extends new (...args: any[]) => any>(
        this: T,
        data: ConstructorParameters<typeof Car>[0],
      ): InstanceType<T> {
        const instance = new this(data);
        instance.extra = "custom";
        return instance;
      }
    }
    const car = CustomCar.fromXML(carXml);
    expect(car).toBeInstanceOf(CustomCar);
    expect((car as any).extra).toBe("custom");
  });
});

// -----------------------------------------------------------------------
// Composition — nested classes, attributes, inline arrays
// -----------------------------------------------------------------------

describe("composition", () => {
  it("parses root attributes", () => {
    const fleet = Fleet.fromXML(fleetXml);
    expect(fleet.name).toBe("Acme Fleet");
  });

  it("parses inline arrays of nested class instances", () => {
    const fleet = Fleet.fromXML(fleetXml);
    expect(fleet.cars).toHaveLength(2);
    expect(fleet.motorcycles).toHaveLength(1);
  });

  it("parses nested class fields", () => {
    const fleet = Fleet.fromXML(fleetXml);
    expect(fleet.cars[0].vin).toBe("VIN001");
    expect(fleet.cars[0].make).toBe("Toyota");
    expect(fleet.cars[0].engine.horsepower).toBe(150);
    expect(fleet.cars[0].engine.type).toBe("petrol");
  });

  it("instantiates nested classes correctly", () => {
    const fleet = Fleet.fromXML(fleetXml);
    expect(fleet.cars[0]).toBeInstanceOf(Car);
    expect(fleet.cars[0].engine).toBeInstanceOf(Engine);
    expect(fleet.motorcycles[0]).toBeInstanceOf(Motorcycle);
  });

  it("class methods work on parsed instances", () => {
    const fleet = Fleet.fromXML(fleetXml);
    expect(fleet.totalVehicles()).toBe(3);
  });

  it("round-trips to identical XML", () => {
    const fleet = Fleet.fromXML(fleetXml);
    expect(prettifyXML(Fleet.toXML(fleet))).toEqual(prettifyXML(fleetXml));
  });
});

// -----------------------------------------------------------------------
// Non-inline (wrapped) arrays
// -----------------------------------------------------------------------

describe("non-inline arrays", () => {
  // Items are nested inside a <models> container element, not direct siblings of <showroom>.
  const showroomXml =
    '<showroom name="Acme Dealers">' +
    "<models><model>Corolla</model><model>Civic</model><model>Mustang</model></models>" +
    "</showroom>";

  it("parses items from the container element", () => {
    const showroom = Showroom.fromXML(showroomXml);
    expect(showroom.name).toBe("Acme Dealers");
    expect(showroom.models).toEqual(["Corolla", "Civic", "Mustang"]);
  });

  it("serializes items back inside the container element", () => {
    const showroom = Showroom.fromXML(showroomXml);
    const out = Showroom.toXMLString(showroom);
    expect(out).toContain("<models>");
    expect(out).toContain("Corolla");
    expect(out).toContain("Civic");
  });

  it("round-trips data correctly", () => {
    const showroom = Showroom.fromXML(showroomXml);
    const reparsed = Showroom.fromXML(Showroom.toXMLString(showroom));
    expect(reparsed.name).toBe("Acme Dealers");
    expect(reparsed.models).toEqual(["Corolla", "Civic", "Mustang"]);
  });
});

// -----------------------------------------------------------------------
// Optional fields
// -----------------------------------------------------------------------

describe("optional fields", () => {
  it("parses optional boolean field when present", () => {
    const moto = Motorcycle.fromXML(motorcycleWithSidecarXml);
    expect(moto.sidecar).toBe(true);
  });

  it("parses optional field as undefined when absent", () => {
    const moto = Motorcycle.fromXML(motorcycleXml);
    expect(moto.sidecar).toBeUndefined();
  });

  it("toXMLString omits undefined optional field", () => {
    const moto = Motorcycle.fromXML(motorcycleXml);
    expect(Motorcycle.toXMLString(moto)).not.toContain("sidecar");
  });
});

// -----------------------------------------------------------------------
// Class extension via .extend()
// -----------------------------------------------------------------------

describe("class extension via .extend()", () => {
  it("Car inherits Vehicle fields and methods", () => {
    const car = Car.fromXML(carXml);
    expect(car.vin).toBe("VIN001"); // Vehicle attr
    expect(car.make).toBe("Toyota"); // Vehicle prop
    expect(car.doors).toBe(4); // Car prop
    expect(car.label()).toBe("2020 Toyota"); // Vehicle method
  });

  it("Car is instanceof Vehicle", () => {
    const car = Car.fromXML(carXml);
    expect(car).toBeInstanceOf(Car);
    expect(car).toBeInstanceOf(Vehicle);
  });

  it("SportCar chains .extend() across two levels", () => {
    const sc = SportCar.fromXML(sportCarXml);
    expect(sc.make).toBe("Ferrari"); // Vehicle prop
    expect(sc.doors).toBe(2); // Car prop
    expect(sc.topSpeed).toBe(320); // SportCar prop
    expect(sc.label()).toBe("2023 Ferrari"); // Vehicle method
  });

  it("SportCar is instanceof Car and Vehicle", () => {
    const sc = SportCar.fromXML(sportCarXml);
    expect(sc).toBeInstanceOf(SportCar);
    expect(sc).toBeInstanceOf(Car);
    expect(sc).toBeInstanceOf(Vehicle);
  });

  it("inherited xml.attr() and xml.prop() metadata is preserved", () => {
    const car = Car.fromXML(carXml);
    const out = Car.toXMLString(car);
    expect(out).toContain('vin="VIN001"');
    expect(out).toContain("<make>Toyota</make>");
  });
});

// -----------------------------------------------------------------------
// Fresh class pattern — xmlModel(Parent.dataSchema.extend(...))
// -----------------------------------------------------------------------

describe("xmlModel(Parent.dataSchema.extend(...)) — fresh class pattern", () => {
  it("parses inherited and new fields", () => {
    const car = CarStandalone.fromXML(carXml);
    expect(car.make).toBe("Toyota");
    expect(car.doors).toBe(4);
  });

  it("is NOT instanceof Vehicle", () => {
    const car = CarStandalone.fromXML(carXml);
    expect(car).not.toBeInstanceOf(Vehicle);
  });

  it("does not have Vehicle methods", () => {
    const car = CarStandalone.fromXML(carXml);
    // @ts-expect-error — label() is not available on CarStandalone
    expect(typeof car.label).toBe("undefined");
  });
});

// -----------------------------------------------------------------------
// Order preservation
// -----------------------------------------------------------------------

describe("order preservation", () => {
  // Adding an `xmlStateSchema()` field tells the codec to track source element order
  // and carry unknown elements through the round-trip. Without it, the codec writes
  // fields in schema-definition order and drops unrecognised elements.
  const Schema = xml.root(
    z.object({
      _xmlState: xmlStateSchema(),
      // schema order: a, b, c
      a: z.string(),
      b: z.string(),
      c: z.string(),
    }),
    { tagname: "root" },
  );
  class Root extends xmlModel(Schema) {}

  it("preserves document order (c, a, b) not schema order (a, b, c)", () => {
    const xmlStr = "<root><c>C</c><a>A</a><b>B</b></root>";
    const instance = Root.fromXML(xmlStr);
    const out = Root.toXMLString(instance);
    const cPos = out.indexOf("<c>");
    const aPos = out.indexOf("<a>");
    const bPos = out.indexOf("<b>");
    expect(cPos).toBeLessThan(aPos);
    expect(aPos).toBeLessThan(bPos);
  });

  it("falls back to schema order when _xmlState is absent", () => {
    // Without xmlStateSchema(), the codec has no ordering state and always
    // writes fields in schema-definition order (a, b, c) regardless of input order.
    const SchemaNoState = xml.root(
      z.object({
        // schema order: a, b, c — no _xmlState field
        a: z.string(),
        b: z.string(),
        c: z.string(),
      }),
      { tagname: "root" },
    );
    class RootNoState extends xmlModel(SchemaNoState) {}

    const xmlStr = "<root><c>C</c><a>A</a><b>B</b></root>";
    const instance = RootNoState.fromXML(xmlStr);
    const out = RootNoState.toXMLString(instance);
    // Output follows schema order: a before b before c
    const aPos = out.indexOf("<a>");
    const bPos = out.indexOf("<b>");
    const cPos = out.indexOf("<c>");
    expect(aPos).toBeLessThan(bPos);
    expect(bPos).toBeLessThan(cPos);
  });
});

// -----------------------------------------------------------------------
// Direct JS class inheritance (extends a model class, no new schema fields)
// -----------------------------------------------------------------------

describe("direct JS class inheritance", () => {
  it("subclass fromXML returns subclass instances and inherits all methods", () => {
    class ElectricCar extends Car {
      isElectric() {
        return this.engine.type === "electric";
      }
    }
    const electricCarXml =
      '<car vin="VIN002"><make>Honda</make><year>2021</year><doors>2</doors><engine type="electric"><horsepower>204</horsepower></engine></car>';
    const car = ElectricCar.fromXML(electricCarXml);
    expect(car).toBeInstanceOf(ElectricCar);
    expect(car).toBeInstanceOf(Car);
    expect(car).toBeInstanceOf(Vehicle);
    expect(car.isElectric()).toBe(true);
    expect(car.label()).toBe("2021 Honda"); // Vehicle method, inherited through chain
  });
});
