export class XMLConversionError extends Error {
  origin: unknown;
  constructor(message: string, origin?: XMLConversionError["origin"]) {
    super(message);
    this.name = "XMLConversionError";
    this.origin = origin;
  }
}
