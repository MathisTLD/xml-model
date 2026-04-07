import { bench, describe } from "vite-plus/test";
import { z } from "zod";
import { xmlModel } from "./model";
import { xml } from "./schema-meta";
import { xmlCodec } from "./codec";

// -----------------------------------------------------------------------
// Discriminated union benchmarks
// -----------------------------------------------------------------------

/**
 * Generates `size` xmlModel schemas, each discriminated by a unique `type`
 * attribute value (`"v0"`, `"v1"`, …). Each variant also carries a realistic
 * set of child-element fields to simulate real-world decode cost.
 * Returns an array suitable for passing to both `z.discriminatedUnion` and `z.union`.
 */
function makeVariantSchemas(size: number) {
  return Array.from({ length: size }, (_, i) =>
    xmlModel(
      z.object({
        type: xml.attr(z.literal(`v${i}` as const)),
        label: z.string(),
        count: z.number(),
        active: z.boolean(),
        description: z.string().optional(),
      }),
      { tagname: "item" },
    ).schema(),
  );
}

/**
 * Returns an array of `count` XML strings, each randomly drawn from the
 * variants produced by `makeVariantSchemas(size)`, with all fields populated.
 */
function makeSamples(size: number, count: number): string[] {
  return Array.from({ length: count }, () => {
    const i = Math.floor(Math.random() * size);
    return (
      `<item type="v${i}">` +
      `<label>label-${i}</label>` +
      `<count>${i}</count>` +
      `<active>true</active>` +
      `<description>desc-${i}</description>` +
      `</item>`
    );
  });
}

// run with `vp test bench ./src/xml/codec.bench.ts`
describe.each([4, 16, 64])("union size %i", (size) => {
  const variants = makeVariantSchemas(size);
  const discriminatedCodec = xmlCodec(z.discriminatedUnion("type", variants as any));
  const unionCodec = xmlCodec(z.union(variants));
  // Pre-generate samples so random number generation is not in the hot path.
  const samples = makeSamples(size, 256);

  bench("discriminatedUnion", () => {
    for (const xml of samples) discriminatedCodec.decode(xml);
  });

  bench("union", () => {
    for (const xml of samples) unionCodec.decode(xml);
  });
});
