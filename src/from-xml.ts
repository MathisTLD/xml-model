import type { XMLRoot, UnknownRecord } from "./types";
import { Middleware, MiddlewareChain, resolve } from "./middleware";

export interface fromXMLMiddlewareContext {
  xml: XMLRoot;
}

export interface fromXMLOptions<T> {
  parent: fromXMLOptions<T> | null;
  middlewares: Middleware<fromXMLMiddlewareContext, T>[];
}

export function fromXML<T>(
  xml: fromXMLMiddlewareContext["xml"],
  options: fromXMLOptions<T>
) {
  const middlewares = MiddlewareChain(options);
  return resolve(middlewares, { xml });
}
