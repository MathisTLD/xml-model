const KEBAB_REGEX = /\p{Lu}/gu;

/**
 * Transforms a string into kebab-case.
 *
 * stolen from https://github.com/joakimbeng/kebab-case/blob/master/index.js
 *
 * @example
 * kebabCase("helloWorld"); // "hello-world"
 * kebabCase("HelloWorld"); // "-hello-world"
 * kebabCase("HelloWorld", false); // "hello-world"
 *
 * @param str The string to transform
 * @param keepLeadingDash Whether to keep the leading dash in case the string starts with an uppercase letter (default: true)
 * @returns The kebab-cased string
 */
export function kebabCase(str: string, keepLeadingDash = false) {
  const result = str.replace(KEBAB_REGEX, (match) => `-${match.toLowerCase()}`);

  if (keepLeadingDash) {
    return result;
  }

  if (result.startsWith("-")) {
    return result.slice(1);
  }

  return result;
}
