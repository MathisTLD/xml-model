/**
 * Stolen from https://github.com/sindresorhus/is-regexp/blob/main/index.js
 *
 * see https://github.com/sindresorhus/is#why-not-just-use-instanceof-instead-of-this-package
 *
 * could use `import { isRegExp } from "node:util/types"` but I want isomorphic lib
 * @param value
 * @returns
 */
export function isRegExp(value: unknown): value is RegExp {
  return Object.prototype.toString.call(value) === "[object RegExp]";
}
export default isRegExp;
