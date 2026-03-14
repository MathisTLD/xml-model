import { expectTypeOf, test, describe } from "vitest";
import { z } from "zod";
import { xml } from "./schema-meta";
import { Vehicle, Car, SportCar, Fleet } from "./examples";

describe("class model", () => {
  test(".schema() returns a schema that returns an instance of the class", () => {
    const schema = Car.schema();
    expectTypeOf(schema.parse(null)).toEqualTypeOf<Car>();
  });
});

describe("composition", () => {
  test("nested class instance types include inherited methods", () => {
    const fleet = Fleet.fromXML("");
    // fleet.cars[0] is typed via z.infer<Car.schema()>, which uses InstanceType<typeof Car>
    // so inherited methods like label() are included.
    expectTypeOf(fleet.cars[0]).toEqualTypeOf<Car>();
    expectTypeOf(fleet.cars[0].label).toEqualTypeOf<() => string>();
    expectTypeOf(fleet.cars[0].doors).toEqualTypeOf<number>();
    expectTypeOf(fleet.totalVehicles).toEqualTypeOf<() => number>();
  });
});

describe("class extension via .extend()", () => {
  test("child has parent and own fields", () => {
    const car = Car.fromXML("");
    // Vehicle fields
    expectTypeOf(car.vin).toEqualTypeOf<string>();
    expectTypeOf(car.make).toEqualTypeOf<string>();
    expectTypeOf(car.year).toEqualTypeOf<number>();
    // Car fields
    expectTypeOf(car.doors).toEqualTypeOf<number>();
  });

  test("parent methods survive into child instance type", () => {
    const car = Car.fromXML("");
    expectTypeOf(car.label).toEqualTypeOf<() => string>();
  });

  test("chained extension accumulates all fields", () => {
    const sc = SportCar.fromXML("");
    // Vehicle fields
    expectTypeOf(sc.vin).toEqualTypeOf<string>();
    // Car fields
    expectTypeOf(sc.doors).toEqualTypeOf<number>();
    // SportCar fields
    expectTypeOf(sc.topSpeed).toEqualTypeOf<number>();
    // Vehicle method
    expectTypeOf(sc.label).toEqualTypeOf<() => string>();
  });

  test("inline extend without explicit class keeps types", () => {
    class TruckBase extends Vehicle.extend(
      { payload: xml.prop(z.number()) },
      xml.model({ tagname: "truck" }),
    ) {}
    const truck = TruckBase.fromXML("");
    expectTypeOf(truck.make).toEqualTypeOf<string>(); // Vehicle
    expectTypeOf(truck.payload).toEqualTypeOf<number>(); // TruckBase
    expectTypeOf(truck.label).toEqualTypeOf<() => string>(); // Vehicle method
  });
});
