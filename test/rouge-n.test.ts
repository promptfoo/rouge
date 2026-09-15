import * as rouge from '../src/rouge';
import { expectBundledScriptToPass } from './helpers';

describe('Core Functions', () => {
  describe('ROUGE-N', () => {
    const { n } = rouge;

    const cand = 'pulses may ease schizophrenic voices';

    const refs = [
      'magnetic pulse series sent through brain may ease schizophrenic voices',
      'yale finds magnetic stimulation some relief to schizophrenics imaginary voices',
    ];

    test('should give reordered sentence unigrams a perfect score', () => {
      expect(n('Alpha. Beta.', 'Beta. Alpha.')).toBe(1);
    });

    test('should throw RangeError for empty candidate', () => {
      expect(() => n('', refs[0], { n: 2 })).toThrow(RangeError);
    });

    test('should throw RangeError for empty ref', () => {
      expect(() => n(cand, '', { n: 2 })).toThrow(RangeError);
    });

    test.each([
      ['one', 'one two'],
      ['one two', 'one'],
    ])('returns 0 for short %j and %j', (candidate, reference) => {
      expect(n(candidate, reference, { n: 2 })).toBe(0);
    });

    test('should return 0 when built-in tokenization produces no grams', () => {
      const tokenizer = (): string[] => [];
      expect(n('candidate', 'reference', { n: 2, tokenizer })).toBe(0);
    });

    test('should correctly compute ROUGE-N F1-score for ref 1', () => {
      // 3 matching bigrams, 4 candidate bigrams, 9 reference bigrams
      // precision = 3/4, recall = 3/9 = 1/3
      // F1 = 2 * P * R / (P + R) = 2 * (3/4) * (1/3) / (3/4 + 1/3) = 6/13
      expect(n(cand, refs[0], { n: 2, beta: 1 })).toBeCloseTo(6 / 13, 15);
    });

    test('should correctly compute ROUGE-N F1-score for ref 2', () => {
      expect(n(cand, refs[1], { n: 2, beta: 1 })).toBe(0);
    });

    test.each<[number, string]>([
      [1, 'the cat sat on the mat'],
      [2, 'a b a b'],
      [3, 'a b a b a'],
    ])('should give repeated %i-gram identity a perfect score', (size, text) => {
      expect(n(text, text, { n: size })).toBe(1);
    });

    test('should count each matching occurrence up to the reference frequency', () => {
      expect(n('a a a b', 'a a b b')).toBeCloseTo(3 / 4);
    });

    test.each([
      [0, 2 / 3],
      [1, 4 / 5],
      [Number.POSITIVE_INFINITY, 1],
    ])('should clip repeated matches with beta=%s', (beta, expected) => {
      expect(n('a a a', 'a a', { beta })).toBeCloseTo(expected);
    });

    test('should reject excessive built-in n-grams within a small heap', () => {
      expectBundledScriptToPass(
        `
          const summary = Array(600).fill('x'.repeat(1024)).join(' ');
          try {
            module.exports.n(summary, summary, { n: 300 });
            throw new Error('excessive n-grams were accepted');
          } catch (error) {
            if (!(error instanceof RangeError) || !/materialization limit/.test(error.message)) {
              throw error;
            }
          }
          process.stdout.write('ok');
        `,
        30_000,
        ['--max-old-space-size=64'],
      );
    }, 30_000);

    test('should reject oversized tokens before encoding them', () => {
      const tokenizer = (): string[] => new Array<string>(3).fill('x'.repeat(1_000_001));
      const stringify = jest.spyOn(JSON, 'stringify');
      try {
        expect(() => n('candidate', 'reference', { tokenizer })).toThrow(/materialization limit/);
        expect(stringify).not.toHaveBeenCalled();
      } finally {
        stringify.mockRestore();
      }
    });

    test.each(['', 'a', '"', '\u0000', '\ud800'])(
      'accounts for JSON token quoting and escapes before allocating: %j',
      (token) => {
        const tokenizer = (): string[] => new Array<string>(400_000).fill(token);
        const stringify = jest.spyOn(JSON, 'stringify');
        try {
          expect(() => n('candidate', 'reference', { tokenizer })).toThrow(/materialization limit/);
          expect(stringify).not.toHaveBeenCalled();
        } finally {
          stringify.mockRestore();
        }
      },
    );

    test('retains correctly encoded surrogate pairs under the limit', () => {
      const tokenizer = (): string[] => ['\ud83d\ude00', '\t'];
      expect(n('candidate', 'reference', { tokenizer })).toBe(1);
    });

    test('budgets both summaries and distinct reference gram entries before encoding', () => {
      const tokens = Array.from({ length: 120_000 }, (_, index) =>
        String.fromCodePoint(0x1_00_00 + index),
      );
      const tokenizer = (): string[] => tokens;
      const stringify = jest.spyOn(JSON, 'stringify');
      try {
        expect(() => n('candidate', 'reference', { tokenizer })).toThrow(/materialization limit/);
        expect(stringify).not.toHaveBeenCalled();
      } finally {
        stringify.mockRestore();
      }
    });

    test('rejects an oversized candidate before tokenizing the reference', () => {
      const tokenizer = jest.fn((input: string): string[] => {
        if (input === 'candidate') {
          return new Array<string>(400_000).fill('');
        }
        throw new Error('The reference tokenizer should not run');
      });
      expect(() => n('candidate', 'reference', { tokenizer })).toThrow(/materialization limit/);
      expect(tokenizer).toHaveBeenCalledTimes(1);
    });

    test('should reject oversized token encoding within a small heap', () => {
      expectBundledScriptToPass(
        `
          const token = 'x'.repeat(1_000_001);
          const tokenizer = () => Array(96).fill(token);
          try {
            module.exports.n('candidate', 'reference', { tokenizer });
            throw new Error('oversized tokens were accepted');
          } catch (error) {
            if (!(error instanceof RangeError) || !/materialization limit/.test(error.message)) {
              throw error;
            }
          }
          process.stdout.write('ok');
        `,
        30_000,
        ['--max-old-space-size=32'],
      );
    }, 30_000);

    test('rejects large short-token arrays before JSON encoding under a small heap', () => {
      expectBundledScriptToPass(
        `
          const tokenizer = () => new Array(800000).fill('a');
          try {
            module.exports.n('candidate', 'reference', { tokenizer });
            throw new Error('Oversized token encoding was accepted');
          } catch (error) {
            if (!(error instanceof RangeError) || !/materialization limit/.test(error.message)) {
              throw error;
            }
          }
          process.stdout.write('ok');
        `,
        30_000,
        ['--max-old-space-size=32'],
      );
    }, 30_000);

    test('rejects large empty-token arrays before allocating the encoding map', () => {
      expectBundledScriptToPass(
        `
          const tokenizer = () => new Array(400000).fill('');
          try {
            module.exports.n('candidate', 'reference', { tokenizer });
            throw new Error('Oversized encoding map was accepted');
          } catch (error) {
            if (!(error instanceof RangeError) || !/materialization limit/.test(error.message)) {
              throw error;
            }
          }
          process.stdout.write('ok');
        `,
        30_000,
        ['--max-old-space-size=32'],
      );
    }, 30_000);

    test('rejects combined distinct-summary allocations within a constrained heap', () => {
      expectBundledScriptToPass(
        `
          const tokens = Array.from({ length: 120000 }, (_, index) => String.fromCodePoint(0x10000 + index));
          const tokenizer = () => tokens;
          try {
            module.exports.n('candidate', 'reference', { tokenizer });
            throw new Error('Combined distinct-gram allocations were accepted');
          } catch (error) {
            if (!(error instanceof RangeError) || !/materialization limit/.test(error.message)) {
              throw error;
            }
          }
          process.stdout.write('ok');
        `,
        30_000,
        ['--max-old-space-size=32'],
      );
    }, 30_000);

    test('should return 0 for no matches', () => {
      expect(n(cand, refs[1], { n: 2, beta: 0 })).toBe(0);
    });
  });
});
