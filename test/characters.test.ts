import * as rouge from '../src/rouge';

describe('charIsUpperCase', () => {
  const isUpper = rouge.charIsUpperCase;

  test('should throw RangeError for non-character input', () => {
    expect(() => isUpper('abcd')).toThrow(RangeError);
    expect(() => isUpper('\u{10400}A')).toThrow(RangeError);
  });
  test('should throw RangeError for empty input', () => {
    expect(() => isUpper('')).toThrow(RangeError);
  });

  test('should return true for uppercase input', () => {
    expect(isUpper('A')).toBe(true);
  });
  test('should return false for lowercase input', () => {
    expect(isUpper('a')).toBe(false);
  });
  test('should return false for non-alphabetical input', () => {
    expect(isUpper('1')).toBe(false);
  });

  test('should return true for uppercase international characters', () => {
    expect(isUpper('Ü')).toBe(true);
    expect(isUpper('É')).toBe(true);
    expect(isUpper('Ñ')).toBe(true);
  });
  test('should return false for lowercase international characters', () => {
    expect(isUpper('ü')).toBe(false);
    expect(isUpper('é')).toBe(false);
    expect(isUpper('ñ')).toBe(false);
  });
  test.each([
    ['astral uppercase', '\u{10400}', true],
    ['astral lowercase', '\u{10428}', false],
    ['titlecase', 'ǅ', true],
    ['titlecase lowercase', 'ǆ', false],
    ['Roman uppercase', 'Ⅰ', true],
    ['Roman lowercase', 'ⅰ', false],
    ['circled uppercase', 'Ⓐ', true],
    ['circled lowercase', 'ⓐ', false],
    ['mapping-less uppercase', '𝐀', true],
    ['mapping-less lowercase', '𝐚', false],
  ])('classifies %s characters', (_label, input, expected) => {
    expect(isUpper(input)).toBe(expected);
  });
});

describe('strIsTitleCase', () => {
  const isTitle = rouge.strIsTitleCase;

  test('should return true for titlecase input', () => {
    expect(isTitle('Abcd')).toBe(true);
  });
  test('should return false for all lowercase input', () => {
    expect(isTitle('abcd')).toBe(false);
  });
  test('should return false for lowercase input with interspersed capitals', () => {
    expect(isTitle('aBcD')).toBe(false);
  });

  test('should return false when there is no first character', () => {
    expect(isTitle('')).toBe(false);
    expect(isTitle(' \t\r\n')).toBe(false);
  });

  test.each([
    ['  \u{10400}bc', true],
    ['  \u{10428}bc', false],
    ['ǅuro', true],
  ])('classifies the first Unicode code point in %j', (input, expected) => {
    expect(isTitle(input)).toBe(expected);
  });
});
