import { z } from "zod";

/**
 * Thrown when Zod schema validation fails after XML parsing.
 * Wraps the ZodError with the raw (pre-validation) data for debugging.
 */
export class XMLValidationError extends Error {
  name = "XMLValidationError";
  constructor(
    public readonly zodError: z.ZodError,
    public readonly raw: unknown,
  ) {
    super(`XML validation failed: ${zodError.message}`);
  }
}
