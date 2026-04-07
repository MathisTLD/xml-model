// This file is for tests and documentation only — it does not end up in the build.
import { z } from "zod";
import { xml } from "./schema-meta";
import { xmlModel } from "./model";
import { xmlStateSchema } from "./codec";

// #region xml-base
/**
 * Recommended base class for all xmlModel classes.
 *
 * Extending `XMLBase` instead of calling `xmlModel()` directly opts every subclass
 * into round-trip preservation at no extra cost:
 * - **Element ordering** — elements are re-emitted in source document order, not schema order.
 * - **Unknown elements** — elements with no matching schema field are passed through verbatim.
 *
 * This matters whenever you read XML produced by a third party, modify a subset of fields,
 * and write it back — plain `xmlModel()` would silently reorder elements and drop extensions.
 *
 * The `_xmlState` field holds the tracking state; it is intentionally excluded from XML output.
 *
 * @example
 * class Device extends XMLBase.extend(
 *   { name: z.string() },
 *   xml.root({ tagname: "device" }),
 * ) {}
 */
export const XMLBase = xmlModel(z.object({ _xmlState: xmlStateSchema() }));

/**
 * Like {@link XMLBase}, but also records the original `XMLElement` as `._xmlState.source`
 * on each instance.
 *
 * @example
 * const device = Device.fromXML(`<device>…</device>`);
 * device._xmlState?.source; // XMLElement
 */
export const XMLBaseWithSource = xmlModel(
  z.object({ _xmlState: xmlStateSchema({ source: true }) }),
);
// #endregion xml-base

// #region event
/** ISO 8601 date string ↔ `Date` codec. */
const isoDate = z.codec(z.string(), z.date(), {
  decode: (iso) => new Date(iso),
  encode: (date) => date.toISOString(),
});

/**
 * An event with a typed `Date` field stored as an ISO 8601 string in XML.
 * Extends `XMLBase` so element order and unknown elements are preserved across round-trips.
 * Demonstrates using `z.codec` to transform a raw XML string into a native JS type.
 */
export class Event extends XMLBase.extend(
  {
    /** Event title: `<title>…</title>` */
    title: z.string(),
    /**
     * Publication date, stored as an ISO 8601 string in XML but exposed as a
     * native `Date` on the parsed instance.
     * `<published-at>2024-01-15T00:00:00.000Z</published-at>`
     */
    publishedAt: isoDate,
  },
  xml.root({ tagname: "event" }),
) {}
// #endregion event

// #region engine
/**
 * A car engine. Extends `XMLBase` so unknown vendor elements inside `<engine>`
 * (e.g. manufacturer extensions) survive a read-modify-write cycle.
 * Demonstrates a basic nested class with one XML attribute (`type`) and one
 * child element (`horsepower`).
 */
export class Engine extends XMLBase.extend(
  {
    /** Fuel type stored as an XML attribute: `<engine type="petrol">` */
    type: xml.attr(z.string()),
    /** Power output stored as a child element: `<horsepower>150</horsepower>` */
    horsepower: z.number(),
  },
  xml.root({ tagname: "engine" }),
) {}
// #endregion engine

// #region vehicle
/**
 * Base vehicle class. Extends `XMLBase` so all vehicle subclasses inherit
 * round-trip preservation — element order and unknown extensions are kept
 * intact without any per-subclass ceremony.
 * Demonstrates `xml.attr()` for identifier fields and custom instance methods.
 */
export class Vehicle extends XMLBase.extend(
  {
    /** Unique identifier stored as a root XML attribute: `<vehicle vin="...">` */
    vin: xml.attr(z.string()),
    /** Manufacturer name stored as a child element: `<make>Toyota</make>` */
    make: z.string(),
    /** Production year stored as a child element: `<year>2020</year>` */
    year: z.number(),
  },
  xml.root({ tagname: "vehicle" }),
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
    doors: z.number(),
    /**
     * Nested engine. Passing an xmlModel class to `xml.prop()` embeds it as a
     * child element and parses it into the correct class instance automatically.
     */
    engine: Engine.schema(),
  },
  xml.root({ tagname: "car" }),
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
    topSpeed: z.number(),
  },
  xml.root({ tagname: "sport-car" }),
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
    sidecar: z.boolean().optional(),
  },
  xml.root({ tagname: "motorcycle" }),
) {}
// #endregion motorcycle

// #region fleet
/**
 * Fleet demonstrates **inline arrays** of multiple vehicle types.
 * `inline: true` places each item as a direct sibling element inside the
 * root tag rather than wrapping them in a container element.
 */
export class Fleet extends XMLBase.extend(
  {
    /** Fleet name stored as a root XML attribute: `<fleet name="...">` */
    name: xml.attr(z.string()),
    /**
     * Inline list of cars. Each `<car>` is a direct child of `<fleet>`.
     * `Car.schema()` returns a ZodPipe that also instantiates `Car` objects.
     */
    cars: xml.prop(z.array(Car.schema()), {
      inline: true,
      // FIXME: should be required for inline arrays
      tagname: "car",
    }),
    /** Inline list of motorcycles. Each `<motorcycle>` is a direct child of `<fleet>`. */
    motorcycles: xml.prop(z.array(Motorcycle.schema()), {
      inline: true,
      // FIXME: should be required for inline arrays
      tagname: "motorcycle",
    }),
  },
  xml.root({ tagname: "fleet" }),
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
export class Showroom extends XMLBase.extend(
  {
    /** Showroom name stored as a root XML attribute: `<showroom name="...">` */
    name: xml.attr(z.string()),
    /**
     * Inventory of model names. Without `inline: true` the codec expects items
     * wrapped inside a single `<models>` container element; the tag name of each
     * individual item is not significant during parsing.
     */
    models: z.array(xml.root(z.string(), { tagname: "model" })),
  },
  xml.root({ tagname: "showroom" }),
) {}
// #endregion showroom

// #region discriminated-engines
/**
 * A petrol engine, discriminated by `type="petrol"`.
 */
export class PetrolEngine extends XMLBase.extend(
  {
    type: xml.attr(z.literal("petrol")),
    horsepower: z.number(),
  },
  xml.root({ tagname: "engine" }),
) {}

/**
 * An electric engine, discriminated by `type="electric"`.
 */
export class ElectricEngine extends XMLBase.extend(
  {
    type: xml.attr(z.literal("electric")),
    range: z.number(),
  },
  xml.root({ tagname: "engine" }),
) {}

/**
 * Fallback for unrecognised engine types. Unknown child elements are preserved
 * through round-trips via XMLBase's state tracking.
 */
export class UnknownEngine extends XMLBase.extend(
  { type: xml.attr(z.string()) },
  xml.root({ tagname: "engine" }),
) {}

/**
 * A union that matches known engine types by discriminator and falls back to
 * `UnknownEngine` for any unrecognised `type` value.
 */
export const AnyEngine = z.union([
  z.discriminatedUnion("type", [PetrolEngine.schema(), ElectricEngine.schema()]),
  UnknownEngine.schema(),
]);
// #endregion discriminated-engines

// #region car-no-proto
/**
 * Demonstrates the alternative to `Vehicle.extend()`: listing all fields
 * manually inside `XMLBase.extend()`. This produces a class with the same
 * XML shape as `Car` but **no prototype link to `Vehicle`** — instances are
 * **not** `instanceof Vehicle` and Vehicle's methods are unavailable.
 *
 * Round-trip preservation still applies because the class extends `XMLBase`.
 * Use this pattern when you want a standalone class that reuses a schema shape
 * but does not need to be part of the parent class hierarchy.
 */
export class CarStandalone extends XMLBase.extend(
  {
    vin: xml.attr(z.string()),
    make: z.string(),
    year: z.number(),
    doors: z.number(),
    engine: Engine.schema(),
  },
  xml.root({ tagname: "car" }),
) {}
// #endregion car-no-proto
