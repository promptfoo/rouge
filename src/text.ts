function opensDoubleQuote(input: string, index: number, insideQuotes: boolean): boolean {
  return !insideQuotes && quoteOpeningContext(input, index);
}

function quoteOpeningContext(input: string, index: number): boolean {
  return (
    index === 0 ||
    /[\s\p{Punctuation}<]/u.test(input[index - 1]) ||
    input.slice(index - 2, index) === '``' ||
    followsQuotedModifier(input, index)
  );
}
const casedCharacterReg = /^\p{Cased}$/u;
const upperOrTitleCaseLetterReg = /^[\p{Lu}\p{Lt}]$/u;
const upperCaseReg = /^\p{Uppercase}$/u;
const closingDelimiterReg = /[\])}>"'”»›]/;
const openingBracketReg = /[([{<]/;
const closingBracketReg = /[\])}>]/;

/** A compatibility modifier after a closed terminal is a marker, not a word prefix. */
function followsQuotedModifier(input: string, index: number): boolean {
  const modifier = input.slice(Math.max(0, index - 2), index).match(/\p{Lm}$/u)?.[0];
  if (modifier === undefined || !isAlphabeticFootnote(input, index - modifier.length - 1)) {
    return false;
  }
  let start = index - modifier.length;
  while (start > 0) {
    const number = input.slice(Math.max(0, start - 2), start).match(/\p{Number}$/u)?.[0];
    if (number === undefined) {
      break;
    }
    start -= number.length;
  }
  return /[.!?]["'”’]$/.test(input.slice(Math.max(0, start - 2), start));
}

function isAlphabeticFootnote(input: string, index: number): boolean {
  const following = characterAt(input, index + 1);
  return (
    following !== following.normalize('NFKC') &&
    /^\p{Lm}(?:[\s.,;:!?"'“‘”’\])}>]|$)/u.test(input.slice(index + 1, index + 5))
  );
}

/**
 * Checks if a string is titlecase
 * @method strIsTitleCase
 * @param  {string}   input       The string to be checked
 * @return {boolean}              True if the string is titlecase and false otherwise
 */
export function strIsTitleCase(input: string): boolean {
  const firstChar = characterAt(input.trim(), 0);
  return firstChar.length > 0 && charIsUpperCase(firstChar);
}

/**
 * Checks if a character is uppercase (i18n-compatible)
 * @method charIsUpperCase
 * @param  {string}   input     The character to be tested
 * @return {boolean}            True if the character is uppercase and false otherwise.
 */
export function charIsUpperCase(input: string): boolean {
  const value = characterAt(input, 0);
  if (value.length === 0 || value.length !== input.length) {
    throw new RangeError('Input should be a single character');
  }

  // Some Uppercase-property symbols have no JavaScript case mapping; preserve the legacy result.
  return (
    upperOrTitleCaseLetterReg.test(value) ||
    (upperCaseReg.test(value) && value.toUpperCase() === value && value.toLowerCase() !== value)
  );
}

function characterAt(input: string, index: number): string {
  const codePoint = input.codePointAt(index);
  return codePoint === undefined ? '' : String.fromCodePoint(codePoint);
}

function isCasedCharacter(input: string): boolean {
  return casedCharacterReg.test(input);
}

function startsWithCasedCharacter(input: string): boolean {
  return isCasedCharacter(characterAt(input.trim(), 0));
}

export {
  characterAt,
  closingBracketReg,
  closingDelimiterReg,
  followsQuotedModifier,
  isAlphabeticFootnote,
  isCasedCharacter,
  openingBracketReg,
  opensDoubleQuote,
  quoteOpeningContext,
  startsWithCasedCharacter,
};
