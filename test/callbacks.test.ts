import * as rouge from '../src/rouge';
import { expectBundledScriptToPass, invalidMaxSkips, invalidNGramSizes } from './helpers';

describe('Core Functions', () => {
  describe('ROUGE-N', () => {
    const { n } = rouge;

    test.each(invalidNGramSizes)('rejects n=%s before callbacks', (size) => {
      const nGram = jest.fn((): string[] => []);
      expect(() => n('a b', 'c d', { n: size, nGram })).toThrow(RangeError);
      expect(nGram).not.toHaveBeenCalled();
    });

    const cand = 'pulses may ease schizophrenic voices';

    const refs = [
      'magnetic pulse series sent through brain may ease schizophrenic voices',
      'yale finds magnetic stimulation some relief to schizophrenics imaginary voices',
    ];

    test('should let custom generators define short-token behavior', () => {
      const nGram = jest.fn((): string[] => ['custom gram']);
      expect(n('one', 'one', { n: 2, nGram })).toBe(1);
      expect(nGram.mock.calls).toEqual([
        [['one'], 2],
        [['one'], 2],
      ]);
    });

    test('should count repeated grams from custom tokenizer and ngram callbacks', () => {
      const tokenizer = (text: string): string[] => text.split('');
      const nGram = (tokens: string[]): string[] => tokens;
      expect(n('aaa', 'aa', { tokenizer, nGram })).toBeCloseTo(4 / 5);
    });

    test('should snapshot reusable custom n-gram arrays', () => {
      const scratch: string[] = [];
      const nGram = (tokens: string[]): string[] => {
        scratch.splice(0, scratch.length, ...tokens);
        return scratch;
      };
      expect(n('alpha', 'beta', { nGram })).toBe(0);
    });

    test('should not apply the built-in padding limit to custom ngram callbacks', () => {
      const nGram = jest.fn((): string[] => ['match']);
      expect(n('a', 'a', { n: 1_000_000_000, nGram })).toBe(1);
      expect(nGram).toHaveBeenCalledTimes(2);
    });

    test('snapshots reusable tokenizer buffers before tokenizing the reference', () => {
      const buffer: string[] = [];
      const tokenizer = (input: string): string[] => {
        buffer.length = 0;
        buffer.push(input);
        return buffer;
      };
      expect(n('candidate', 'reference', { tokenizer })).toBe(0);
    });

    test('should correctly compute ROUGE-N score with custom beta', () => {
      // With beta=0, F-score equals precision
      // 3 matching bigrams out of 4 candidate bigrams = 3/4
      expect(n(cand, refs[0], { n: 2, beta: 0 })).toBe(3 / 4);
    });
  });

  describe('ROUGE-S', () => {
    const { s } = rouge;

    test.each(invalidMaxSkips)('rejects maxSkip=%s before callbacks', (maxSkip) => {
      const skipBigram = jest.fn((): string[] => []);
      expect(() => s('a b', 'c d', { maxSkip, skipBigram })).toThrow(RangeError);
      expect(skipBigram).not.toHaveBeenCalled();
    });

    test('should let custom generators define short-token behavior', () => {
      const skipBigram = jest.fn((): string[] => ['custom gram']);
      expect(s('one', 'one', { skipBigram })).toBe(1);
      expect(skipBigram.mock.calls).toEqual([
        [['one'], Number.POSITIVE_INFINITY],
        [['one'], Number.POSITIVE_INFINITY],
      ]);
    });

    test('should snapshot reusable custom skip-bigram arrays', () => {
      const scratch: string[] = [];
      const skipBigram = (tokens: string[], maxSkip: number): string[] => {
        scratch.splice(0, scratch.length, tokens.slice(0, maxSkip + 1).join(' '));
        return scratch;
      };
      expect(s('alpha one', 'beta two', { maxSkip: 1, skipBigram })).toBe(0);
    });

    test('still invokes a custom skip-bigram callback for identical summaries', () => {
      const skipBigram = jest.fn(() => ['custom']);
      expect(s('a b', 'a b', { skipBigram })).toBe(1);
      expect(skipBigram).toHaveBeenCalledTimes(2);
    });
  });

  describe('ROUGE-L', () => {
    const { l } = rouge;

    test('applies the exact sentence-pair work limit with a custom tokenizer', () => {
      const tokenizer = (): string[] => ['x'];
      const candidate = new Array(250).fill('Alpha.').join(' ');
      const reference = new Array(400).fill('Beta.').join(' ');
      expect(l(candidate, reference, { tokenizer })).toBeCloseTo((2 * 250) / 650, 15);
      const overCandidate = new Array(11).fill('Alpha.').join(' ');
      const overReference = new Array(9091).fill('Beta.').join(' ');
      expect(() => l(overCandidate, overReference, { tokenizer })).toThrow(
        /sentence comparison exceeds the work limit/,
      );
    });

    test('retains the work-limit bypass for an explicit custom segmenter', () => {
      const segmenter = (input: string): string[] =>
        new Array(input === 'candidate' ? 11 : 9091).fill('x');
      const tokenizer = (): string[] => ['x'];
      expect(l('candidate', 'reference', { segmenter, tokenizer })).toBeCloseTo(22 / 9102, 15);
    });

    test.each(['lcs', 'lcsIndices'] as const)(
      'retains the work-limit bypass for a custom %s callback',
      (mode) => {
        const candidate = new Array(11).fill('Alpha.').join(' ');
        const reference = new Array(9091).fill('Beta.').join(' ');
        let comparisons = 0;
        const callback = (): [] => {
          comparisons++;
          return [];
        };
        const options = mode === 'lcs' ? { lcs: callback } : { lcsIndices: callback };
        expect(l(candidate, reference, { tokenizer: () => ['x'], ...options })).toBe(0);
        expect(comparisons).toBe(100_001);
      },
    );

    test('returns for empty custom tokens before applying the sentence-pair limit', () => {
      const candidate = new Array(11).fill('Alpha.').join(' ');
      const reference = new Array(9091).fill('Beta.').join(' ');
      expect(l(candidate, reference, { tokenizer: () => [] })).toBe(0);
    });

    describe('custom LCS token copying', () => {
      const segmenter = (input: string): string[] => input.split('|');

      const summary = new Array(250).fill(new Array(8).fill('x').join(' ')).join('|');

      test.each(['lcs', 'lcsIndices'] as const)(
        'accepts exactly one million copied token slots for %s',
        (mode) => {
          const sentence = new Array(20).fill('x').join(' ');
          const candidate = new Array(100).fill(sentence).join('|');
          const reference = new Array(250).fill(sentence).join('|');
          let calls = 0;
          const callback = (): [] => {
            calls++;
            return [];
          };
          const options = mode === 'lcs' ? { lcs: callback } : { lcsIndices: callback };
          expect(l(candidate, reference, { segmenter, ...options })).toBe(0);
          expect(calls).toBe(25_000);
        },
      );

      test.each(['lcs', 'lcsIndices'] as const)(
        'rejects the combined %s copying cost when either side grows',
        (mode) => {
          const callback = jest.fn((): [] => []);
          const options = mode === 'lcs' ? { lcs: callback } : { lcsIndices: callback };
          for (const [candidate, reference] of [
            [`${summary} x`, summary],
            [summary, `${summary} x`],
          ]) {
            expect(() => l(candidate, reference, { segmenter, ...options })).toThrow(
              /custom LCS token copying exceeds the work limit/,
            );
          }
          expect(callback).not.toHaveBeenCalled();
        },
      );

      test.each(['lcs', 'lcsIndices'] as const)(
        'rejects amplified %s copying before invoking the callback',
        (mode) => {
          expectBundledScriptToPass(
            `
              const candidate = new Array(100000).fill('x').join(' ');
              const reference = new Array(30000).fill('x!').join(' ');
              let calls = 0;
              let failure;
              try {
                module.exports.l(candidate, reference, {
                  ${mode}: () => { calls++; return []; },
                });
              } catch (error) {
                failure = error;
              }
              if (!(failure instanceof RangeError) ||
                  !/custom LCS token copying exceeds the work limit/.test(failure.message) ||
                  calls !== 0) {
                throw new Error('Amplified token copying was not rejected before callbacks');
              }
              process.stdout.write('ok');
            `,
            5000,
          );
        },
        10_000,
      );

      test.each(['lcs', 'lcsIndices'] as const)(
        'returns for empty token summaries before the %s copy budget',
        (mode) => {
          const callback = jest.fn((): [] => []);
          const options = mode === 'lcs' ? { lcs: callback } : { lcsIndices: callback };
          const split = (input: string): string[] =>
            input === 'empty' ? new Array(1001).fill('') : ['tokens'];
          const tokenizer = (input: string): string[] =>
            input === 'tokens' ? new Array(1000).fill('x') : [];
          for (const [candidate, reference] of [
            ['empty', 'nonempty'],
            ['nonempty', 'empty'],
          ]) {
            expect(l(candidate, reference, { segmenter: split, tokenizer, ...options })).toBe(0);
          }
          expect(callback).not.toHaveBeenCalled();
        },
      );

      test('does not apply the copy budget to the built-in LCS with a custom segmenter', () => {
        expect(l(summary, `${summary} x`, { segmenter, lcs: rouge.lcs })).toBeCloseTo(4000 / 4001);
      });

      test.each(['lcs', 'lcsIndices'] as const)(
        'preserves isolated mutable arrays and original alignment for %s',
        (mode) => {
          const arrays = new Set<string[]>();
          const inputs: string[][] = [];
          const consume = (candidate: string[], reference: string[]): string | undefined => {
            expect(Array.isArray(candidate) && Array.isArray(reference)).toBe(true);
            expect(arrays.has(candidate) || arrays.has(reference)).toBe(false);
            arrays.add(candidate);
            arrays.add(reference);
            inputs.push([...candidate, ...reference]);
            const common = candidate[0] === reference[0] ? candidate[0] : undefined;
            candidate.length = 0;
            reference.length = 0;
            return common;
          };
          const options =
            mode === 'lcs'
              ? {
                  lcs: (candidate: string[], reference: string[]): string[] => {
                    const token = consume(candidate, reference);
                    return token === undefined ? [] : [token];
                  },
                }
              : {
                  lcsIndices: (candidate: string[], reference: string[]): number[] =>
                    consume(candidate, reference) === undefined ? [] : [0],
                };
          expect(l('a|b', 'a|b', { segmenter, ...options })).toBe(1);
          expect(inputs).toEqual([
            ['a', 'a'],
            ['b', 'a'],
            ['a', 'b'],
            ['b', 'b'],
          ]);
          expect(arrays.size).toBe(8);
        },
      );
    });

    test('should preserve word separation after an ellipsis for custom tokenizers', () => {
      const tokenizer = (input: string): string[] => input.split(/\s+/);
      expect(l('what?', 'Wait... what?', { tokenizer })).toBeCloseTo(2 / 3);
    });

    test('does not suppress custom LCS callbacks after the candidate budget is exhausted', () => {
      const segmenter = (input: string): string[] => input.split('|');
      const customLcs = jest.fn(() => ['a']);
      expect(l('a', 'a|a', { segmenter, lcs: customLcs })).toBeCloseTo(2 / 3);
      expect(customLcs).toHaveBeenCalledTimes(2);
    });

    test('still validates custom LCS-index callbacks after the candidate budget is exhausted', () => {
      const segmenter = (input: string): string[] => input.split('|');
      let invocation = 0;
      expect(() =>
        l('a', 'a|a', {
          segmenter,
          lcsIndices: () => (++invocation === 1 ? [0] : [1]),
        }),
      ).toThrow(/strictly increasing integer indices within the reference/);
    });

    test('should preserve custom callbacks and normalize only after segmentation', () => {
      const segmenter = jest.fn((text: string): string[] => text.split('|'));
      const tokenizer = jest.fn((text: string): string[] => text.split(' '));
      const customLcs = jest.fn((a: string[], b: string[]): string[] => rouge.lcs(a, b));
      expect(
        l('A A|B', 'A A B', { segmenter, tokenizer, lcs: customLcs, caseSensitive: false }),
      ).toBe(1);
      expect(segmenter).toHaveBeenCalledWith('A A|B');
      expect(tokenizer).toHaveBeenCalledWith('a a');
      expect(customLcs).toHaveBeenCalledWith(['a', 'a'], ['a', 'a', 'b']);
    });

    test('should use the subsequence selected by a custom LCS callback', () => {
      const customLcs = (): string[] => ['b'];
      expect(l('a b', 'a b', { lcs: customLcs })).toBeCloseTo(1 / 2);
    });

    test('should preserve repeated occurrences returned by a custom LCS callback', () => {
      const customLcs = (): string[] => ['a', 'a'];
      expect(l('a a a', 'a a', { lcs: customLcs })).toBeCloseTo(4 / 5);
    });

    test('should preserve left-to-right alignment for value-only LCS callbacks', () => {
      const customLcs = (a: string[], b: string[]): string[] => rouge.lcs(a, b);
      expect(l('a\nb a', 'a b a', { lcs: customLcs })).toBe(1);
    });

    test('should use exact reference positions from a custom LCS-index callback', () => {
      const customLcsIndices = (candidate: string[]): number[] =>
        candidate.length === 1 ? [0] : [1, 2];
      expect(l('a\nb a', 'a b a')).toBeCloseTo(2 / 3);
      expect(l('a\nb a', 'a b a', { lcsIndices: customLcsIndices })).toBe(1);
    });

    test('should reject specifying both custom LCS callback forms', () => {
      expect(() =>
        l('a', 'a', {
          lcs: () => ['a'],
          lcsIndices: () => [0],
        }),
      ).toThrow(/cannot specify both lcs and lcsIndices/);
    });

    test('should reject a non-array custom LCS-index result', () => {
      const customLcsIndices = (): number[] => 'not an array' as unknown as number[];
      expect(() => l('a b', 'a b', { lcsIndices: customLcsIndices })).toThrow(
        /must return an array/,
      );
    });

    test('should reject custom LCS indices whose tokens are not a candidate subsequence', () => {
      expect(() => l('a', 'a b', { lcsIndices: () => [1] })).toThrow(
        /subsequence of the candidate/,
      );
    });

    test('should preserve best-effort alignment for legacy value-only callbacks', () => {
      expect(l('a b', 'a c', { lcs: () => ['a', 'missing'] })).toBeCloseTo(1 / 2);
    });

    test('should accept an empty custom LCS result', () => {
      expect(l('candidate', 'reference', { lcs: () => [] })).toBe(0);
    });

    test('should return zero when custom tokenization removes every token', () => {
      expect(l('a', 'b', { tokenizer: () => [] })).toBe(0);
    });

    test('should snapshot reusable custom tokenizer arrays', () => {
      const scratch: string[] = [];
      const tokenizer = (input: string): string[] => {
        scratch.splice(0, scratch.length, ...input.split(' '));
        return scratch;
      };
      expect(l('alpha', 'beta', { tokenizer })).toBe(0);
    });
  });
});
