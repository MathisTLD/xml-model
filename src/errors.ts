import {
  fromXMLContext,
  PropertyFromXMLContext,
  PropertyToXMLContext,
  toXMLContext,
} from "./model/types";

/**
 * Thrown when model-level XML → object conversion fails.
 * Wraps the original error along with the conversion context.
 */
export class FromXMLConversionError<T> extends Error {
  name = "FromXMLConversionError";
  constructor(
    public context: Omit<fromXMLContext<T>, "properties">,
    public error: unknown,
  ) {
    const message = `[Model: ${context.model.type.name}] failed to convert from XML`;
    super(message);
  }
}

/**
 * Thrown when a single property's XML → value conversion fails.
 * Extends `FromXMLConversionError` with additional property context.
 */
export class PropertyFromXMLConversionError<T> extends FromXMLConversionError<T> {
  name = "PropertyFromXMLConversionError";
  constructor(
    context: Omit<fromXMLContext<T>, "properties">,
    public propertyContext: PropertyFromXMLContext<T>,
    error: unknown,
  ) {
    super(context, error);
    this.message = `[Model: ${context.model.type.name}] failed to convert prop <${String(
      propertyContext.property.name,
    )}> from XML`;
  }
}

/**
 * Thrown when model-level object → XML conversion fails.
 * Wraps the original cause along with the conversion context.
 */
export class ToXMLConversionError<T> extends Error {
  name = "ToXMLConversionError";
  constructor(
    public context: Omit<toXMLContext<T>, "properties">,
    public cause: unknown,
  ) {
    const message = `[Model: ${context.model.type.name}] failed to convert to XML`;
    super(message);
  }
}

/**
 * Thrown when a single property's value → XML conversion fails.
 * Extends `ToXMLConversionError` with additional property context.
 */
export class PropertyToXMLConversionError<T> extends ToXMLConversionError<T> {
  name = "PropertyToXMLConversionError";
  constructor(
    context: Omit<toXMLContext<T>, "properties">,
    public propertyContext: PropertyToXMLContext<T>,
    cause: unknown,
  ) {
    super(context, cause);
    this.message = `[Model: ${context.model.type.name}] failed to convert prop <${String(
      propertyContext.property.name,
    )}> to XML`;
  }
}
