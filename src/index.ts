// FIXME: strange bug, If not exporting all from ./model
// then can't import data from `xml-model/model` even if
// in source there is `export const DATA...`
export * from "./model";
export * from "./xml";
