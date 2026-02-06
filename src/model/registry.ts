import type { Constructor } from "typescript-rtti";
import type { XMLModel } from ".";

type ModelID<T> = Constructor<T>;
export const Models = new Map<ModelID<unknown>, XMLModel<unknown>>();

export function registrerModel(model: XMLModel<unknown>) {
  return Models.set(model.type, model);
}

export function findModel<T>(id: ModelID<T>): XMLModel<T> | undefined {
  return Models.get(id) as XMLModel<T> | undefined;
}

export function getModel<T>(id: ModelID<T>) {
  const model = findModel(id);
  if (model) return model;
  else throw new TypeError(`couldn't find model for type ${id.name}`);
}
