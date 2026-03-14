// This file is for tests and documentation only — it does not end up in the build.
import { z } from "zod";
import { xml } from "./schema-meta";
import { xmlModel } from "./model";

// #region engine
/**
 * A car engine. Demonstrates a basic nested class with one XML attribute
 * (`type`) and one child element (`horsepower`).
 */
export class Engine extends xmlModel(
  z.object({
    /** Fuel type stored as an XML attribute: `<engine type="petrol">` */
    type: xml.attr(z.string(), { name: "type" }),
    /** Power output stored as a child element: `<horsepower>150</horsepower>` */
    horsepower: xml.prop(z.number()),
  }),
  { tagname: "engine" },
) {}
// #endregion engine

// #region vehicle
/**
 * Base vehicle class. Demonstrates `xml.attr()` for identifier fields and
 * `xml.prop()` for child-element fields. Custom methods on the class are
 * available on every parsed instance.
 */
export class Vehicle extends xmlModel(
  z.object({
    /** Unique identifier stored as a root XML attribute: `<vehicle vin="...">` */
    vin: xml.attr(z.string(), { name: "vin" }),
    /** Manufacturer name stored as a child element: `<make>Toyota</make>` */
    make: xml.prop(z.string()),
    /** Production year stored as a child element: `<year>2020</year>` */
    year: xml.prop(z.number()),
  }),
  { tagname: "vehicle" },
) {
  /** Returns a human-readable label for this vehicle. */
  label() {
    return `${this.year} ${this.make}`;
  }
}
// #endregion vehicle

// #region car
/**
 * Car extends Vehicle using `Vehicle.extend()`, which creates a **true subclass**:
 * instances are `instanceof Vehicle` and inherit Vehicle's methods (e.g. `label()`).
 *
 * Demonstrates:
 * - chaining `.extend()` to add fields to a parent model
 * - `xml.prop(Engine)` to embed a nested xmlModel class as a child element
 */
export class Car extends Vehicle.extend(
  {
    /** Number of doors: `<doors>4</doors>` */
    doors: xml.prop(z.number()),
    /**
     * Nested engine. Passing an xmlModel class to `xml.prop()` embeds it as a
     * child element and parses it into the correct class instance automatically.
     */
    engine: xml.prop(Engine),
  },
  xml.model({ tagname: "car" }),
) {}
// #endregion car

// #region sport-car
/**
 * SportCar shows that `.extend()` chains across multiple levels.
 * Instances are `instanceof SportCar`, `instanceof Car`, and `instanceof Vehicle`.
 */
export class SportCar extends Car.extend(
  {
    /** Top speed in km/h: `<top-speed>320</top-speed>` (camelCase → kebab-case) */
    topSpeed: xml.prop(z.number()),
  },
  xml.model({ tagname: "sport-car" }),
) {}
// #endregion sport-car

// #region motorcycle
/**
 * Motorcycle extends Vehicle with an optional boolean field.
 * When `<sidecar>` is absent from the XML the field is `undefined`;
 * `toXMLString` omits it entirely.
 */
export class Motorcycle extends Vehicle.extend(
  {
    /** Whether a sidecar is attached. Omitted from XML when `undefined`. */
    sidecar: xml.prop(z.optional(z.boolean())),
  },
  xml.model({ tagname: "motorcycle" }),
) {}
// #endregion motorcycle

// #region fleet
/**
 * Fleet demonstrates **inline arrays** of multiple vehicle types.
 * `inline: true` places each item as a direct sibling element inside the
 * root tag rather than wrapping them in a container element.
 */
export class Fleet extends xmlModel(
  z.object({
    /** Fleet name stored as a root XML attribute: `<fleet name="...">` */
    name: xml.attr(z.string(), { name: "name" }),
    /**
     * Inline list of cars. Each `<car>` is a direct child of `<fleet>`.
     * `Car.schema()` returns a ZodPipe that also instantiates `Car` objects.
     */
    cars: xml.prop(z.array(Car.schema()), { inline: true }),
    /** Inline list of motorcycles. Each `<motorcycle>` is a direct child of `<fleet>`. */
    motorcycles: xml.prop(z.array(Motorcycle.schema()), { inline: true }),
  }),
  { tagname: "fleet" },
) {
  /** Total number of vehicles across all types in this fleet. */
  totalVehicles() {
    return this.cars.length + this.motorcycles.length;
  }
}
// #endregion fleet

// #region showroom
/**
 * A showroom holds an inventory of car model names.
 * Demonstrates a **non-inline** (wrapped) array: all items are nested inside
 * a single `<models>` container element, as opposed to being direct siblings
 * of the root element.
 *
 * ```xml
 * <showroom name="Acme Dealers">
 *   <models>
 *     <model>Corolla</model>
 *     <model>Civic</model>
 *   </models>
 * </showroom>
 * ```
 *
 * Contrast with `Fleet`, which uses `inline: true` so each `<car>` / `<motorcycle>`
 * is a direct child of `<fleet>` with no container wrapper.
 */
export class Showroom extends xmlModel(
  z.object({
    /** Showroom name stored as a root XML attribute: `<showroom name="...">` */
    name: xml.attr(z.string(), { name: "name" }),
    /**
     * Inventory of model names. Without `inline: true` the codec expects items
     * wrapped inside a single `<models>` container element; the tag name of each
     * individual item is not significant during parsing.
     */
    models: xml.prop(z.array(z.string())),
  }),
  { tagname: "showroom" },
) {}
// #endregion showroom

// #region car-no-proto
/**
 * Demonstrates the alternative to `.extend()`: passing a manually extended
 * schema to `xmlModel()`. This produces a **fresh class** with no prototype
 * link to `Vehicle` — instances are **not** `instanceof Vehicle` and Vehicle's
 * methods are unavailable.
 *
 * Use this pattern when you want a standalone class that reuses a schema shape
 * but does not need to be part of the parent class hierarchy.
 */
export class CarStandalone extends xmlModel(
  Vehicle.dataSchema.extend({
    doors: xml.prop(z.number()),
    engine: xml.prop(Engine),
  }),
  { tagname: "car" },
) {}
// #endregion car-no-proto
