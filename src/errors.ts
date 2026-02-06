import {
  fromXMLContext,
  PropertyFromXMLContext,
  PropertyToXMLContext,
  toXMLContext,
} from "./model/types";

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
