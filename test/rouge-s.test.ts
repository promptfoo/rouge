import * as rouge from '../src/rouge';
import { expectBundledScriptToPass } from './helpers';

describe('Core Functions', () => {
  describe('ROUGE-S', () => {
    const { s } = rouge;

    const ref = 'police killed the gunman';

    const cands = ['police kill the gunman', 'the gunman kill police', 'the gunman police killed'];

    test('should throw RangeError for empty candidate', () => {
      expect(() => s('', ref)).toThrow(RangeError);
    });

    test('should throw RangeError for empty ref', () => {
      expect(() => s(cands[0], '')).toThrow(RangeError);
    });

    test.each([
      ['one', 'one two'],
      ['one two', 'one'],
    ])('returns 0 for short %j and %j', (candidate, reference) => {
      expect(s(candidate, reference)).toBe(0);
    });

    test('should return 0 when built-in tokenization produces no skip-bigrams', () => {
      const tokenizer = (): string[] => [];
      expect(s('candidate', 'reference', { tokenizer })).toBe(0);
    });

    test('should return 0 for summaries with zero overlap', () => {
      expect(s('banana yoghurt', ref)).toBe(0);
    });

    test('should correctly compute ROUGE-S score for cand 1 with different opts', () => {
      expect(s(cands[0], ref, { beta: 1 })).toBe(1 / 2);
    });

    test('should correctly compute ROUGE-S score for cand 2 with different opts', () => {
      expect(s(cands[1], ref, { beta: 1 })).toBe(1 / 6);
    });

    test('should correctly compute ROUGE-S score for cand 3 with different opts', () => {
      expect(s(cands[2], ref, { beta: 1 })).toBe(1 / 3);
    });

    test.each([1, 2, Number.POSITIVE_INFINITY])('should count repeats at window %s', (maxSkip) => {
      expect(s('a a a', 'a a a', { maxSkip })).toBe(1);
    });

    test.each([
      [0, 1 / 2],
      [1, 2 / 3],
      [Number.POSITIVE_INFINITY, 1],
    ])('should clip repeated skip-bigram matches with beta=%s', (beta, expected) => {
      expect(s('a a a a', 'a a a', { beta })).toBeCloseTo(expected);
    });

    test('should use the bounded skip-bigram counts as denominators', () => {
      expect(s('a a a a', 'a a a', { maxSkip: 2 })).toBeCloseTo(3 / 4);
    });

    test('should preserve the zero-window behavior', () => {
      expect(s('a b', 'a b', { maxSkip: 0 })).toBe(0);
    });

    test.each([0, 1, Number.POSITIVE_INFINITY])(
      'keeps identical summaries and beta=%s on the built-in fast path',
      (beta) => {
        expect(s('a b c', 'a b c', { beta, maxSkip: 1 })).toBe(1);
      },
    );

    test('treats a finite full-summary window as unbounded', () => {
      expect(s('a a a b', 'a a a c', { maxSkip: Number.MAX_SAFE_INTEGER })).toBe(
        s('a a a b', 'a a a c'),
      );
    });

    test('should match materialized skip-bigram scoring exhaustively', () => {
      const tokenizer = (input: string): string[] => JSON.parse(input);
      const materialized = (tokens: string[], maxSkip?: number): string[] =>
        rouge.skipBigram(
          tokens.map((token) => JSON.stringify(token)),
          maxSkip,
        );
      const sequences: string[][] = [];
      for (let length = 2; length <= 4; length++) {
        for (let value = 0; value < 2 ** length; value++) {
          sequences.push(Array.from({ length }, (_, index) => (value & (1 << index) ? 'a' : 'b')));
        }
      }

      for (const candidate of sequences) {
        const candidateJson = JSON.stringify(candidate);
        for (const reference of sequences) {
          const referenceJson = JSON.stringify(reference);
          for (const maxSkip of [0, 1, 2, Number.POSITIVE_INFINITY]) {
            for (const beta of [0, 1, Number.POSITIVE_INFINITY]) {
              expect(s(candidateJson, referenceJson, { tokenizer, maxSkip, beta })).toBeCloseTo(
                s(candidateJson, referenceJson, {
                  tokenizer,
                  maxSkip,
                  beta,
                  skipBigram: materialized,
                }),
                12,
              );
            }
          }
        }
      }
    });

    test('should score long summaries within a small heap', () => {
      expectBundledScriptToPass(
        `
          const summary = Array.from({ length: 5000 }, () => 'a').join(' ');
          if (module.exports.s(summary, summary) !== 1) {
            throw new Error('ROUGE-S score changed');
          }
          process.stdout.write('ok');
        `,
        30_000,
        ['--max-old-space-size=64'],
      );
    }, 30_000);

    test('should score finite windows without scanning every distinct token pair', () => {
      expectBundledScriptToPass(
        `
          const summary = Array.from({ length: 30000 }, (_, index) => \`token\${index}\`).join(' ');
          if (module.exports.s(summary, summary, { maxSkip: 0 }) !== 0) {
            throw new Error('zero-window score changed');
          }
          if (module.exports.s(summary, summary, { maxSkip: 1 }) !== 1) {
            throw new Error('finite-window score changed');
          }
          process.stdout.write('ok');
        `,
        3000,
      );
    }, 10_000);

    test('scores large finite full windows without visiting every position pair', () => {
      expectBundledScriptToPass(
        `
          const prefix = 'a '.repeat(12000);
          const candidate = prefix + 'b';
          const reference = prefix + 'c';
          const score = module.exports.s(candidate, reference, { maxSkip: Number.MAX_SAFE_INTEGER });
          if (score !== module.exports.s(candidate, reference)) {
            throw new Error('Finite full-window score changed');
          }
          process.stdout.write('ok');
        `,
        3000,
      );
    }, 10_000);

    test('should respect maxSkip option', () => {
      // With maxSkip=1, only adjacent pairs are considered
      // cand: 'police kill the gunman' -> adjacent pairs: 'police kill', 'kill the', 'the gunman'
      // ref: 'police killed the gunman' -> adjacent pairs: 'police killed', 'killed the', 'the gunman'
      // Only 'the gunman' matches, so precision = 1/3, recall = 1/3, F1 = 1/3
      expect(s(cands[0], ref, { beta: 1, maxSkip: 1 })).toBe(1 / 3);
    });
  });
});
