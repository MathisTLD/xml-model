export * from "./xml-js";

export { xml } from "./schema-meta";
export type { UserCodecOptions, XMLState } from "./codec";
export {
  xmlCodec, // if not re-exported here, xmlCodec is not exported from "./codex.js" but only from "./codec.d.ts"
  registerDefault,
  normalizeCodecOptions,
  XMLCodecError,
  xmlStateSchema,
  parseXML,
  toXML,
  stringifyXML,
} from "./codec";
export { xmlModel, type XmlModelConstructor } from "./model";
