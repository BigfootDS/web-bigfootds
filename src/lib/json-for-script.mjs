const unsafeScriptCharacterPattern = /[<>&\u2028\u2029]/g;
const scriptEscapes = {
  '&': '\\u0026',
  '<': '\\u003c',
  '>': '\\u003e',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
};

/**
 * Serialises JSON for a script element without allowing data to terminate the
 * element or become executable HTML. JSON remains recoverable with
 * `JSON.parse`, while the five characters with special HTML or JavaScript
 * parsing behaviour are represented as JSON Unicode escapes.
 *
 * @param {unknown} value - JSON-compatible data destined for `set:html` inside a script element.
 * @returns {string} JSON that is safe to place directly in an inline script element.
 * @throws {TypeError} When the value cannot be represented as JSON text.
 */
export function serialiseJsonForScript(value) {
  const serialised = JSON.stringify(value);

  if (serialised === undefined) {
    throw new TypeError('Inline script data must be JSON-serialisable.');
  }

  return serialised.replace(unsafeScriptCharacterPattern, (character) => scriptEscapes[character]);
}
