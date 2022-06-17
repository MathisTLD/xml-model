// import { toXML as _toXML } from "./xml-from-object";
// import { fromXML as _fromXML } from "./xml-to-object";
// import { findModel, ObjectConversionOptions } from "./model";
// import { XMLElement } from "./types";

// function resolveConversionOptionsFromObject(object: unknown){
//   if(object && object.constructor)
// }

// export function toXML(object,options?:ObjectConversionOptions): XMLElement {
//   const _options = options || resolveConversionOptionsFromObject(object)
// }
export type { XMLElement, Constructor } from "./types";
export { defaults } from "./defaults";
export { getModel, createModel, Model, Prop } from "./model";

import XML from "./xml";
export { XML };
