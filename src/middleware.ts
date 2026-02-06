export type Middleware<C, T> = (context: C, next: () => T) => T;

interface ChainableOptions<C, T> {
  parent: ChainableOptions<C, T> | null;
  middlewares: Middleware<C, T>[];
}

export function* MiddlewareChain<C, T>(options: ChainableOptions<C, T>) {
  do {
    for (let index = options.middlewares.length - 1; index >= 0; index--) {
      yield options.middlewares[index];
    }
    if (options.parent) options = options.parent;
    else return;
    // oxlint-disable-next-line no-constant-condition
  } while (true);
}
type MiddlewareChain<C, T> = Iterator<Middleware<C, T>>;

export function resolve<C, T>(middlewares: MiddlewareChain<C, T>, context: C): T {
  const next = (): T => {
    const { value: nextMiddleware, done } = middlewares.next();
    if (done || !nextMiddleware) {
      // previous middlewares should have returned a value before
      // TODO: dedicated error class
      throw new Error("no more next middleware");
    } else {
      return nextMiddleware(context, next);
    }
  };
  return next();
}
