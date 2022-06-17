import { XMLRoot, UnknownRecord } from "../types";

export type XMLModelProperty<T> = Extract<keyof T, string>;

export type XMLRootRecord<T> = {
  [key in keyof UnknownRecord]: XMLRoot;
};
