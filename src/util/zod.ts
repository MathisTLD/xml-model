import { z } from "zod";

export function isZodType(object: any): object is z.ZodType {
  return object instanceof z.ZodType;
}

export function getParentSchema(schema: z.ZodType) {
  let parent: z.ZodType | undefined;
  if (schema instanceof z.ZodPipe) {
    // TODO: check in what cases isZodType could return false
    if (isZodType(schema.def.in)) parent = schema.def.in;
  } else if (schema instanceof z.ZodOptional) {
    if (isZodType(schema.def.innerType)) parent = schema.def.innerType;
  } else if (schema instanceof z.ZodLazy) {
    const value = schema.def.getter();
    if (isZodType(value)) parent = value;
  }
  return parent;
}
