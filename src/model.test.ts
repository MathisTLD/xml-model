import { describe, test, expect } from "vite-plus/test";
import { z } from "zod";
import { model } from "./model";

describe("Unions", () => {
  class CircleShape extends model(
    z.object({
      type: z.literal("circle"),
      radius: z.number(),
    }),
  ) {}

  class RectShape extends model(
    z.object({
      type: z.literal("rect"),
      width: z.number(),
      height: z.number(),
    }),
  ) {}

  class UnknownShape extends model(
    z.looseObject({
      type: z.string(),
    }),
  ) {}

  const ZShape = z.union([
    z.discriminatedUnion("type", [CircleShape.schema(), RectShape.schema()]),
    UnknownShape.schema(),
  ]);

  test("should decoded with correct shape instance", () => {
    const circle = ZShape.decode({ type: "circle", radius: 5 });
    expect(circle).toBeInstanceOf(CircleShape);
    const hexagon = ZShape.decode({ type: "hexagon" });
    expect(hexagon).toBeInstanceOf(UnknownShape);
  });
});
