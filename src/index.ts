export { model, isModel } from "./model";
export type { ModelConstructor } from "./model";

export * from "./codec";

export { xmlCodec, FIELD_ORDER, ROOT_ATTRS } from "./xml/codec";
export { xmlModel } from "./xml/model";
export { xml } from "./xml/schema-meta";
export type { XMLCodec } from "./xml/codec";
export type { XMLMeta } from "./xml/schema-meta";
export type { XMLElement, XMLRoot } from "./xml/types";
export { XMLValidationError } from "./xml/errors";
export type { Options as XMLOptions } from "xml-js";
