import { expect, test } from "vite-plus/test";
import { z } from "zod";

test("Meta has no side effect (need to captured returned value)", () => {
  const a = z.object({ test: z.literal(42) }).meta({ foo: true });
  const b = a.meta({ bar: true });
  expect(a.meta()).toEqual({ foo: true });
  expect(b.meta()).toEqual({ foo: true, bar: true });
});
