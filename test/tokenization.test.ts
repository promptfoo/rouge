import * as rouge from '../src/rouge';
import { bracketPairs, geographicAcronyms } from './helpers';

describe('Utility Functions', () => {
  describe('treeBankTokenize', () => {
    const tbt = rouge.treeBankTokenize;

    test.each(geographicAcronyms)('retains the final dot in %s', (acronym) => {
      expect(tbt(acronym)).toEqual([acronym]);
      expect(tbt(`"${acronym}"`)).toEqual(['``', acronym, "''"]);
    });

    test.each([
      ["He quoted ''$100''.", ['He', 'quoted', '``', '$', '100', "''", '.']],
      ["He quoted ''(yes)''.", ['He', 'quoted', '``', '(', 'yes', ')', "''", '.']],
    ])('recognizes paired apostrophes before punctuation in %s', (input, expected) => {
      expect(tbt(input)).toEqual(expected);
    });

    test.each(bracketPairs)('splits final periods through %s%s spacing', (open, close) => {
      const tokens = [open, 'Nobody', 'noticed', '.', close];
      expect(tbt(`${open} Nobody noticed. ${close}`)).toEqual(tokens);
      expect(tbt(`"${open} Nobody noticed. ${close} "`)).toEqual(['``', ...tokens, "''"]);
    });

    test('should return empty array for empty input', () => {
      expect(tbt('')).toEqual([]);
    });

    const whitespace = [' ', '\t', '\n', '\r\n', '\u00a0', '\u0085'];

    test.each(whitespace)('should split words separated by %j', (separator) => {
      expect(tbt(`alpha${separator}beta`)).toEqual(['alpha', 'beta']);
      expect(tbt(`${separator}They'll${separator}go.${separator}`)).toEqual([
        'They',
        "'ll",
        'go',
        '.',
      ]);
    });

    test.each(whitespace)('should not invent tokens for %j', (separator) => {
      expect(tbt(separator.repeat(3))).toEqual([]);
    });

    test.each([
      'écannot',
      'cannoté',
      'Åwanna',
      'wanna\u0301',
      "more'né",
      'cannot‿foo',
      'cannot\u200cfoo',
      'cannot\u200dfoo',
      'foo‿cannot',
      'cannot·foo',
      'cannot・foo',
    ])('does not split contractions inside Unicode words: %s', (word) => {
      expect(tbt(word)).toEqual([word]);
    });

    test.each(['١٢,٣٤٥', '１２,３４５', '١٢:٣٤'])(
      'preserves numeric separators before Unicode decimal digits: %s',
      (number) => {
        expect(tbt(number)).toEqual([number]);
      },
    );

    const uncommonContractions: [string, string[]][] = [
      ['cannot', ['can', 'not']],
      ["d'ye", ['d', "'ye"]],
      ['gimme', ['gim', 'me']],
      ['gonna', ['gon', 'na']],
      ['gotta', ['got', 'ta']],
      ['lemme', ['lem', 'me']],
      ["more'n", ['more', "'n"]],
      ['wanna', ['wan', 'na']],
      ["'tis", ["'t", 'is']],
      ["'twas", ["'t", 'was']],
    ];

    test.each(uncommonContractions)('should split every %s', (word, tokens) => {
      const input = `${word} ${word} ${word.toUpperCase()}`;
      const expected = [...tokens, ...tokens, ...tokens.map((token) => token.toUpperCase())];
      expect(tbt(input)).toEqual(expected);
      // Global patterns must also reset between tokenizer calls.
      expect(tbt(input)).toEqual(expected);
    });

    test("should split 'll contractions", () => {
      expect(tbt("They'll save and invest more.")).toEqual([
        'They',
        "'ll",
        'save',
        'and',
        'invest',
        'more',
        '.',
      ]);
    });

    test("should split n't contractions and trailing commas", () => {
      expect(tbt("hi, my name can't hello,")).toEqual([
        'hi',
        ',',
        'my',
        'name',
        'ca',
        "n't",
        'hello',
        ',',
      ]);
    });

    test('should handle special symbols', () => {
      expect(tbt('Good muffins cost $3.88 in New York.')).toEqual([
        'Good',
        'muffins',
        'cost',
        '$',
        '3.88',
        'in',
        'New',
        'York',
        '.',
      ]);
    });

    test.each([
      ['Note: hello, world:', ['Note', ':', 'hello', ',', 'world', ':']],
      ['12,000 items at 12:30,', ['12,000', 'items', 'at', '12:30', ',']],
      ['12,000,000 and 3.88.', ['12,000,000', 'and', '3.88', '.']],
    ])('should apply Treebank comma and colon rules to %s', (input, expected) => {
      expect(tbt(input)).toEqual(expected);
    });

    test.each(['.', '!', '?'])(
      'tokenizes an unmatched quote after terminal %s as closing',
      (terminal) => {
        expect(tbt(`hello${terminal}"`)).toEqual(['hello', terminal, "''"]);
      },
    );

    test('should handle double quotation marks', () => {
      expect(tbt('"We beat some pretty good teams to get here," Slocum said.')).toEqual([
        '``',
        'We',
        'beat',
        'some',
        'pretty',
        'good',
        'teams',
        'to',
        'get',
        'here',
        ',',
        "''",
        'Slocum',
        'said',
        '.',
      ]);
      expect(tbt('5" nails and "wide" boards.')).toEqual([
        '5',
        "''",
        'nails',
        'and',
        '``',
        'wide',
        "''",
        'boards',
        '.',
      ]);
    });

    test.each([
      ["He said ''hello''.", ['He', 'said', '``', 'hello', "''", '.']],
      ["He said ``hello''.", ['He', 'said', '``', 'hello', "''", '.']],
      ["``hello''", ['``', 'hello', "''"]],
      ["''hello''", ["''", 'hello', "''"]],
      ["Second fragment '' attribution.", ['Second', 'fragment', "''", 'attribution', '.']],
      [
        "Second fragment '' attribution ``third''.",
        ['Second', 'fragment', "''", 'attribution', '``', 'third', "''", '.'],
      ],
      [
        "Second fragment '' attribution ''third''.",
        ['Second', 'fragment', "''", 'attribution', '``', 'third', "''", '.'],
      ],
      [
        "Second fragment '', attribution ''third''.",
        ['Second', 'fragment', "''", ',', 'attribution', '``', 'third', "''", '.'],
      ],
    ])('should recognize existing Treebank quotation markers in %s', (input, expected) => {
      expect(tbt(input)).toEqual(expected);
    });

    test.each([
      ['alpha..omega', ['alpha..omega']],
      ['alpha...omega', ['alpha', '...', 'omega']],
      ['alpha....omega', ['alpha', '...', '.omega']],
      ['alpha.....omega', ['alpha', '...', '..omega']],
    ])('should preserve period multiplicity in %s', (input, expected) => {
      expect(tbt(input)).toEqual(expected);
    });

    test.each([
      ['alpha--omega', ['alpha', '--', 'omega']],
      ['alpha---omega', ['alpha', '--', '-omega']],
      ['alpha----omega', ['alpha', '--', '--', 'omega']],
      ['alpha-----omega', ['alpha', '--', '--', '-omega']],
    ])('should preserve dash multiplicity in %s', (input, expected) => {
      expect(tbt(input)).toEqual(expected);
    });
  });
});
