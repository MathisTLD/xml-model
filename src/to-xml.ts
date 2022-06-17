import { Middleware, MiddlewareChain, resolve } from "./middleware";
import { XMLRoot } from "./types";

export interface toXMLMiddlewareContext<T> {
  object: T;
}

export interface toXMLOptions<T> {
  parent: toXMLOptions<T> | null;
  middlewares: Middleware<toXMLMiddlewareContext<T>, XMLRoot>[];
}

export function toXML<T>(object: T, options: toXMLOptions<T>) {
  const middlewares = MiddlewareChain(options);
  return resolve(middlewares, { object });
}
