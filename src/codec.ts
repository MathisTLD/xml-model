import type { z } from "zod";

/**
 * Augmentable map of codec IDs to their input/output/options types.
 * Codec implementations extend this via declaration merging.
 *
 * @example
 * declare module "xml-model" {
 *   interface CodecMap {
 *     myCodec: { input: string; output: string; options?: MyOptions };
 *   }
 * }
 */
export interface CodecMap {}

export type CodecId = keyof CodecMap;
export type CodecInput<K extends CodecId> = CodecMap[K] extends { input: infer I } ? I : never;
export type CodecOutput<K extends CodecId> = CodecMap[K] extends { output: infer O } ? O : never;
export type CodecOptions<K extends CodecId> = CodecMap[K] extends { options?: infer O } ? O : never;

interface CodecFactory {
  decode(input: unknown): unknown;
  encode(data: unknown, options?: unknown): unknown;
}

const codecRegistry = new Map<string, (schema: z.ZodObject<any>) => CodecFactory>();

/**
 * Register a codec factory for the given ID.
 * The factory is called with the model's dataSchema each time from()/to() is invoked.
 */
export function registerCodec(
  id: string,
  factory: (schema: z.ZodObject<any>) => CodecFactory,
): void {
  codecRegistry.set(id, factory);
}

export function getCodec(id: CodecId) {
  const c = codecRegistry.get(id);
  if (!c) throw new Error(`No codec registered for "${id}"`);
  return c;
}
