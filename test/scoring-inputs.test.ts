import * as rouge from '../src/rouge';
import { bracketPairs, invalidBetas } from './helpers';

describe('Core Functions', () => {
  const metrics = [
    ['ROUGE-N', rouge.n],
    ['ROUGE-S', rouge.s],
    ['ROUGE-L', rouge.l],
  ] as const;

  test.each([
    ['ROUGE-N', rouge.n, 1],
    ['ROUGE-S', rouge.s, 7 / 15],
    ['ROUGE-L', rouge.l, 1],
  ] as const)(
    '%s preserves reordered mapping-less cased sentences case-insensitively',
    (_name, score, expected) => {
      const reference = 'Use etc. 𝐀 begins.';
      const candidate = '𝐀 begins. Use etc.';
      expect(score(candidate, reference, { caseSensitive: false })).toBe(expected);
    },
  );

  describe.each(metrics)('%s input handling', (_name, score) => {
    test('does not change already-lowercase abbreviation scores in case-insensitive mode', () => {
      const candidate = 'we need etc. and more animals.';
      const reference = 'and more animals we need etc.';
      expect(score(candidate, reference, { caseSensitive: false })).toBe(
        score(candidate, reference),
      );
    });

    test.each(['\n', '\r\n', '\r'])('keeps wrapped quotes (%j)', (lineBreak) => {
      expect(score(`He said "Stop.${lineBreak}" Next.`, 'He said "Stop." Next.')).toBe(1);
      expect(score(`He said "Stop.${lineBreak}"`, 'He said "Stop."')).toBe(1);
    });

    test('should use defaults for explicitly undefined options', () => {
      const options = {
        beta: undefined,
        caseSensitive: undefined,
        tokenizer: undefined,
        n: undefined,
        nGram: undefined,
        maxSkip: undefined,
        skipBigram: undefined,
        segmenter: undefined,
        lcs: undefined,
      };
      expect(score('A B', 'a b', options)).toBe(0);
      expect(score('a b c', 'a b d', options)).toBe(score('a b c', 'a b d'));
    });

    test.each(invalidBetas)('rejects beta=%s before callbacks', (beta) => {
      const tokenizer = jest.fn((input: string): string[] => input.split(' '));
      expect(() => score('a b', 'a b', { beta, tokenizer })).toThrow(/beta/);
      expect(() => score('a b', 'c d', { beta, tokenizer })).toThrow(/beta/);
      expect(tokenizer).not.toHaveBeenCalled();
    });

    test('should keep finite large-beta scores and explicit recall mode', () => {
      expect(score('a b', 'a b c', { beta: 1e200 })).toBe(
        score('a b', 'a b c', { beta: Number.POSITIVE_INFINITY }),
      );
      expect(score('A B C', 'a b', { beta: Number.POSITIVE_INFINITY, caseSensitive: false })).toBe(
        1,
      );
    });

    test('should treat word-separating whitespace consistently', () => {
      expect(score('alpha\tbeta', 'alpha beta')).toBe(1);
      expect(score('alpha\nbeta', 'alpha beta')).toBe(1);
      expect(score('alpha\u00a0beta', 'alpha beta')).toBe(1);
      expect(score('alpha\u0085beta', 'alpha beta')).toBe(1);
      expect(score('Alpha.\u0085Beta.', 'Alpha. Beta.')).toBe(1);
    });

    test('should reject whitespace-only summaries like empty strings', () => {
      expect(() => score(' \t\r\n', 'alpha beta')).toThrow('Candidate cannot be an empty string');
      expect(() => score('alpha beta', ' \t\r\n')).toThrow('Reference cannot be an empty string');
      expect(() => score('\u0085', 'alpha beta')).toThrow('Candidate cannot be an empty string');
      expect(() => score('alpha beta', '\u0085')).toThrow('Reference cannot be an empty string');
    });

    test('should separate colons without splitting numeric commas', () => {
      expect(score('Note: 12,000 items', 'Note : 12,000 items')).toBe(1);
      expect(score('12,000 items', '12 000 items')).toBeLessThan(1);
    });

    test('keeps punctuation aligned after a quoted numeric boundary', () => {
      expect(score('"Stop." 123 starts.', '"Stop ." 123 starts.')).toBe(1);
      expect(score('"Stop." 3 times.', '"STOP." 3 TIMES.', { caseSensitive: false })).toBe(1);
    });

    test.each([
      ['He said... "what?" Next.', "He said ... `` what ? '' Next ."],
      ['Use "e.g." here.', "Use `` e.g. '' here ."],
      ['"Dr." is a title.', "`` Dr. '' is a title ."],
      ['"U.S." is an abbreviation.', "`` U.S. '' is an abbreviation ."],
      ['She wrote "etc.", then left.', "She wrote `` etc. '' , then left ."],
    ])('preserves quoted token identities in %s', (input, tokens) => {
      expect(score(input, tokens)).toBe(1);
    });

    test.each(bracketPairs)('keeps %s%s spacing equivalent', (open, close) => {
      const sentence = `${open}Nobody noticed.${close}`;
      const spaced = `${open} Nobody noticed. ${close}`;
      expect(score(`${sentence} Next came rain.`, `${spaced} Next came rain.`)).toBe(1);
      expect(score(`${sentence} then left.`, `${spaced} then left.`)).toBe(1);
      expect(
        score(`He said "${open}Stop.${close}" Next.`, `He said "${open}Stop. ${close} " Next.`),
      ).toBe(1);
    });

    test.each([
      ["He said ''hello''.", 'He said "hello".'],
      ["He quoted ''$100''.", 'He quoted "$100".'],
      ["He quoted ''(yes)''.", 'He quoted "(yes)".'],
      ["He said ``hello''.", 'He said "hello".'],
      [
        "``First sentence. Second fragment '', attribution ''third''.",
        '``First sentence. Second fragment", attribution "third".',
      ],
    ])('should normalize existing Treebank quotation markers in %s', (input, expected) => {
      expect(score(input, expected)).toBe(1);
    });

    test.each([
      ['alpha..omega', 'alpha...omega'],
      ['alpha...omega', 'alpha....omega'],
      ['alpha--omega', 'alpha---omega'],
      ['alpha--omega', 'alpha----omega'],
    ])('should distinguish punctuation runs in %s and %s', (candidate, reference) => {
      expect(score(candidate, reference)).toBeLessThan(1);
    });
  });

  describe.each([
    ['ROUGE-N', rouge.n],
    ['ROUGE-S', rouge.s],
  ] as const)('%s summary tokenization', (_name, score) => {
    test('should tokenize each sentence before flattening the token stream', () => {
      expect(score('Alpha. Beta.', 'Alpha . Beta .')).toBe(1);
      expect(score('Alpha. Beta.', 'alpha . beta .', { caseSensitive: false })).toBe(1);
      expect(
        score('Use etc. Another sentence.', 'use etc . another sentence .', {
          caseSensitive: false,
        }),
      ).toBe(1);
    });

    test('should pass complete summaries to custom tokenizers', () => {
      const tokenizer = jest.fn((input: string): string[] => input.split(' '));
      expect(score('Alpha. Beta.', 'alpha. beta.', { tokenizer, caseSensitive: false })).toBe(1);
      expect(tokenizer.mock.calls).toEqual([['alpha. beta.'], ['alpha. beta.']]);
    });

    test('should use sentence tokenization for the explicitly supplied built-in tokenizer', () => {
      expect(score('Alpha. Beta.', 'Alpha . Beta .', { tokenizer: rouge.treeBankTokenize })).toBe(
        1,
      );
    });

    test('should not split a period off an acronym inside a name', () => {
      const tokenizer = (input: string): string[] => rouge.treeBankTokenize(input);
      expect(score('U.S. Government', 'U.S Government')).toBe(
        score('U.S. Government', 'U.S Government', { tokenizer }),
      );
    });
  });

  describe.each([
    ['ROUGE-N', rouge.n, 'nGram', rouge.nGram, 1 / 2],
    ['ROUGE-S', rouge.s, 'skipBigram', rouge.skipBigram, 2 / 7],
  ] as const)('%s token identity', (_name, score, gramOption, builtIn, repeatedScore) => {
    const tokenizer = (input: string): string[] => JSON.parse(input);

    const options = { n: 2, tokenizer };

    test.each<[string[], string[]]>([
      [
        ['new york', 'city'],
        ['new', 'york city'],
      ],
      [
        ['a ', 'b'],
        ['a', ' b'],
      ],
      [
        ['', ' a'],
        [' ', 'a'],
      ],
      [
        ['a|b', 'c'],
        ['a', 'b|c'],
      ],
      [
        ['a\0b', 'c'],
        ['a', 'b\0c'],
      ],
      [
        ['a" b', 'c\\d'],
        ['a"', 'b c\\d'],
      ],
    ])('should distinguish token tuples %j and %j', (candidate, reference) => {
      const cand = JSON.stringify(candidate);
      const ref = JSON.stringify(reference);
      expect(score(cand, ref, options)).toBe(0);
      expect(score(cand, cand, options)).toBe(1);
    });

    test('should encode built-in grams but pass raw tokens to custom generators', () => {
      const candidate = ['new york', 'city'];
      const reference = ['new', 'york city'];
      const cand = JSON.stringify(candidate);
      const ref = JSON.stringify(reference);
      expect(score(cand, ref, { ...options, [gramOption]: builtIn })).toBe(0);
      const generator = jest.fn((): string[] => ['custom gram']);
      expect(score(cand, ref, { ...options, maxSkip: 2, [gramOption]: generator })).toBe(1);
      expect(generator.mock.calls).toEqual([
        [candidate, 2],
        [reference, 2],
      ]);
    });

    test('should clip repeated multiword-token grams', () => {
      expect(
        score('["new york","city","new york","city"]', '["new york","city"]', options),
      ).toBeCloseTo(repeatedScore);
    });
  });

  describe('caseSensitive option', () => {
    const { n, s, l } = rouge;

    test.each([
      ['ROUGE-N', n, 4 / 11],
      ['ROUGE-S', s, 2 / 25],
      ['ROUGE-L', l, 4 / 11],
    ] as const)(
      '%s keeps case-sensitive scoring while making case-insensitive boundaries casing-neutral',
      (_name, score, caseSensitiveScore) => {
        const mixedCase = 'Use etc. Another sentence.';
        const lowerCase = mixedCase.toLowerCase();
        expect(score(mixedCase, lowerCase)).toBeCloseTo(caseSensitiveScore);
        expect(score(mixedCase, lowerCase, { caseSensitive: false })).toBe(1);
      },
    );

    test.each(['ΟΣ.Α', 'ΟΣ.Α Β', 'ΟΣ.\u0301Α', 'İΟΣ.Α', 'ΟΣ.Α\nNext sentence.', 'ΟΣ. Α', 'ΟΣ\nΑ'])(
      'preserves whole-summary case context across segmentation: %s',
      (input) => {
        for (const score of [n, s, l]) {
          expect(score(input, input.toLowerCase(), { caseSensitive: false })).toBe(
            score(input, input, { caseSensitive: false }),
          );
        }
      },
    );

    test('preserves whole-summary sigma casing next to a mark-only initial', () => {
      const input = 'fooΣ.\u0345.B next.';
      for (const score of [n, s, l]) {
        expect(score(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
      }
    });

    test('preserves sigma scores across the rejected mark-only initial boundary', () => {
      const input = 'fooΣ.\u0345.B next.';
      const lower = input.toLowerCase();
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([
        'fooΣ.\u0345.',
        'B next.',
      ]);
      expect(rouge.sentenceSegment(lower, { caseNeutral: true })).toEqual([
        'fooσ.\u0345.',
        'b next.',
      ]);
      for (const score of [n, s, l]) {
        expect(score(input, lower, { caseSensitive: false })).toBe(1);
      }
    });

    test('protects prepared sentences from a custom LCS consuming its arguments', () => {
      expect(
        l('alpha|beta', 'alpha|beta', {
          segmenter: (input) => input.split('|'),
          lcs: (candidate, reference) => {
            const common = candidate.filter((token) => reference.includes(token));
            candidate.length = 0;
            reference.length = 0;
            return common;
          },
        }),
      ).toBe(1);
    });

    test.each([
      ['ROUGE-N', n],
      ['ROUGE-S', s],
      ['ROUGE-L', l],
    ] as const)('%s preserves Unicode case expansion across dotted identifiers', (_name, score) => {
      for (const input of ['A.İ Beta', 'İ12345678.X more']) {
        expect(score(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
      }
    });

    test('ROUGE-L passes original text to custom segmenters before case folding', () => {
      const segmenter = jest.fn((input: string): string[] => [input]);
      expect(
        l('Use etc. Another sentence.', 'use etc. another sentence.', {
          caseSensitive: false,
          segmenter,
        }),
      ).toBe(1);
      expect(segmenter.mock.calls).toEqual([
        ['Use etc. Another sentence.'],
        ['use etc. another sentence.'],
      ]);
    });

    test('ROUGE-N should be case-sensitive by default', () => {
      expect(n('Hello World', 'hello world')).toBe(0);
    });

    test('ROUGE-N should match when caseSensitive is false', () => {
      expect(n('Hello World', 'hello world', { caseSensitive: false })).toBe(1);
    });

    test('ROUGE-S should be case-sensitive by default', () => {
      expect(s('Hello World', 'hello world')).toBe(0);
    });

    test('ROUGE-S should match when caseSensitive is false', () => {
      expect(s('Hello World', 'hello world', { caseSensitive: false })).toBe(1);
    });

    test('ROUGE-L should be case-sensitive by default', () => {
      expect(l('Hello World', 'hello world')).toBe(0);
    });

    test('ROUGE-L should match when caseSensitive is false', () => {
      expect(l('Hello World', 'hello world', { caseSensitive: false })).toBe(1);
    });

    test('caseSensitive option should work with partial matches', () => {
      // 'The cat' vs 'the CAT sat' - case insensitive should find 2/3 word match
      const score = n('The cat', 'the CAT sat', { caseSensitive: false });
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });
});
