/**
 * Prerequisite validation for the mixin-based multi-codec design.
 *
 * Goal: verify that `Omit<Self, keyof ModelConstructor<S, Inst>> & ModelConstructor<NewS, NewInst>`
 * correctly preserves codec-specific statics (fromXML, toXML, toXMLString) through chained
 * `.extend()` calls, so that `XmlModelConstructor` does NOT need to re-declare `extend()`.
 *
 * This is a pure type-level test — no implementation is changed here.
 */
import { expectTypeOf, test, describe } from "vite-plus/test";
import { z } from "zod";
import { xmlModel } from "./model";
import type { ModelConstructor } from "../model";

// ---------------------------------------------------------------------------
// The proposed Omit-based return type for base ModelConstructor.extend()
// ---------------------------------------------------------------------------

type OmitExtendResult<
  Self extends ModelConstructor<S, Inst>,
  S extends z.ZodObject<any>,
  Inst extends z.infer<S>,
  U extends z.core.$ZodLooseShape,
  NewS extends z.ZodObject<any> = z.ZodObject<z.util.Extend<S["shape"], U>>,
  NewInst extends z.infer<NewS> = InstanceType<Self> & z.infer<NewS>,
> = Omit<Self, keyof ModelConstructor<S, Inst>> & ModelConstructor<NewS, NewInst>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const XMLBase = xmlModel(z.object({}));
type XMLBaseType = typeof XMLBase;
type XMLBaseSchema = (typeof XMLBase)["dataSchema"];
type XMLBaseInst = InstanceType<XMLBaseType>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Omit<Self, keyof ModelConstructor> return type", () => {
  test("Omit correctly isolates XML-specific statics", () => {
    // The Omit part should contain fromXML, toXML, toXMLString but NOT new, dataSchema etc.
    type XmlOnly = Omit<XMLBaseType, keyof ModelConstructor<XMLBaseSchema, XMLBaseInst>>;
    expectTypeOf<XmlOnly>().toHaveProperty("fromXML");
    expectTypeOf<XmlOnly>().toHaveProperty("toXML");
    expectTypeOf<XmlOnly>().toHaveProperty("toXMLString");
  });

  test("OmitExtendResult preserves fromXML after one extend", () => {
    type U = { title: z.ZodString };
    type Result = OmitExtendResult<XMLBaseType, XMLBaseSchema, XMLBaseInst, U>;

    expectTypeOf<Result>().toHaveProperty("fromXML");
    expectTypeOf<Result>().toHaveProperty("toXML");
    expectTypeOf<Result>().toHaveProperty("toXMLString");
  });

  test("OmitExtendResult adds new fields to instance type", () => {
    type U = { title: z.ZodString };
    type Result = OmitExtendResult<XMLBaseType, XMLBaseSchema, XMLBaseInst, U>;

    expectTypeOf<InstanceType<Result>>().toMatchTypeOf<{ title: string }>();
  });

  test("OmitExtendResult preserves fromXML after chained extends", () => {
    type U1 = { title: z.ZodString };
    type S1 = z.ZodObject<z.util.Extend<XMLBaseSchema["shape"], U1>>;
    type Inst1 = XMLBaseInst & z.infer<S1>;
    type Step1 = OmitExtendResult<XMLBaseType, XMLBaseSchema, XMLBaseInst, U1>;

    type U2 = { year: z.ZodNumber };
    type Step2 = OmitExtendResult<Step1, S1, Inst1, U2>;

    expectTypeOf<Step2>().toHaveProperty("fromXML");
    expectTypeOf<Step2>().toHaveProperty("toXML");
    expectTypeOf<Step2>().toHaveProperty("toXMLString");
  });

  test("OmitExtendResult accumulates instance fields through chained extends", () => {
    type U1 = { title: z.ZodString };
    type S1 = z.ZodObject<z.util.Extend<XMLBaseSchema["shape"], U1>>;
    type Inst1 = XMLBaseInst & z.infer<S1>;
    type Step1 = OmitExtendResult<XMLBaseType, XMLBaseSchema, XMLBaseInst, U1>;

    type U2 = { year: z.ZodNumber };
    type Step2 = OmitExtendResult<Step1, S1, Inst1, U2>;

    expectTypeOf<InstanceType<Step2>>().toMatchTypeOf<{ title: string; year: number }>();
  });

  test("extend() on OmitExtendResult result is still callable (base extend survives)", () => {
    type U = { title: z.ZodString };
    type Result = OmitExtendResult<XMLBaseType, XMLBaseSchema, XMLBaseInst, U>;

    expectTypeOf<Result>().toHaveProperty("extend");
    expectTypeOf<Result["extend"]>().toBeFunction();
  });
});
