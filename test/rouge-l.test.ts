import * as rouge from '../src/rouge';
import { expectBundledScriptToPass, geographicAcronyms } from './helpers';

describe('Core Functions', () => {
  describe('ROUGE-L', () => {
    const { l } = rouge;

    const ref = 'police killed the gunman';

    const cands = ['police kill the gunman', 'the gunman kill police', 'the gunman police killed'];

    test('preserves reordered sentence boundaries across NEL separators', () => {
      expect(l('Alpha.\u0085Beta.', 'Beta.\u0085Alpha.')).toBe(1);
    });

    test('bounds Cartesian comparisons after expanding large embedded lists', () => {
      const summary = Array.from({ length: 317 }, (_, index) =>
        index % 2 === 0 ? 'a) Alpha' : 'b) Beta',
      ).join(' ');
      expect(() => l(summary, summary)).toThrow(/sentence comparison exceeds the work limit/);
    });

    test('should preserve word order across wrapped ellipses', () => {
      expect(l('what Wait', 'Wait...\nwhat?')).toBeCloseTo(1 / 3, 15);
    });

    test('should preserve word order through a parenthetical continuation', () => {
      expect(
        l(
          '100 accurate The result was surprisingly',
          'The result was (surprisingly!) 100% accurate.',
        ),
      ).toBeCloseTo(8 / 17, 15);
      expect(
        l('Alice Smith The winner was surprisingly', 'The winner was (surprisingly!) Alice Smith.'),
      ).toBeCloseTo(1 / 2, 15);
    });

    test.each(geographicAcronyms)('recognizes reordered sentences ending in %s', (acronym) => {
      const first = `I live in the ${acronym}`;
      const second = 'Alice lives in Canada.';
      expect(l(`${first} ${second}`, `${second} ${first}`)).toBe(1);
    });

    test('should throw RangeError for empty candidate', () => {
      expect(() => l('', ref, undefined as any)).toThrow(RangeError);
    });

    test('should throw RangeError for empty ref', () => {
      expect(() => l(cands[0], '', undefined as any)).toThrow(RangeError);
    });

    test('should accept newline-separated sentences', () => {
      const tokenizer = (text: string): string[] => text.match(/[A-Za-z]+/g) || [];
      expect(l('Alpha.\r\nBeta.', 'Alpha.\nBeta.', { tokenizer })).toBe(1);
    });

    test('should correctly compute ROUGE-L score for cand 1 with different opts', () => {
      expect(l(cands[0], ref, { beta: 1 })).toBe(3 / 4);
    });

    test('should correctly compute ROUGE-L score for cand 2 with different opts', () => {
      expect(l(cands[1], ref, { beta: 1 })).toBe(1 / 2);
    });

    test('should correctly compute ROUGE-L score for cand 3 with different opts', () => {
      expect(l(cands[2], ref, { beta: 1 })).toBe(2 / 4);
    });

    const identitySummaries = ['a a a', 'the cat sat on the mat', 'Alpha. Beta.'];

    test.each(identitySummaries)('should give identical summaries a perfect score: %s', (text) => {
      expect(l(text, text)).toBe(1);
    });

    test('should union reference positions instead of repeated token values', () => {
      const tokenizer = (text: string): string[] => text.split(/[| ]+/);
      const segmenter = (text: string): string[] => text.split('|');
      expect(l('a b|a', 'a b a', { tokenizer, segmenter })).toBe(1);
    });

    test('should credit each reference position only once across candidate sentences', () => {
      const tokenizer = (text: string): string[] => text.split(/[| ]+/);
      const segmenter = (text: string): string[] => text.split('|');
      expect(l('a|a', 'a b', { tokenizer, segmenter })).toBeCloseTo(1 / 2);
    });

    test.each([
      ['cat dog fish', 2 / 5],
      ['cat', 2 / 3],
    ] as const)('should clip candidate reuse: %s', (text, expected) => {
      const tokenizer = (input: string): string[] => input.match(/[A-Za-z]+/g) || [];
      expect(l(text, 'cat. cat.', { tokenizer })).toBeCloseTo(expected);
    });

    test('stops built-in LCS evaluation once the candidate token budget is exhausted', () => {
      const segmenter = (input: string): string[] => input.split('|');
      const tokenizer = (input: string): string[] => input.split(' ');
      expect(l('a b', 'a b|a b|a b', { segmenter, tokenizer })).toBe(1 / 2);
    });

    test('handles repeated reference sentences without redundant LCS work', () => {
      expectBundledScriptToPass(
        `
          const sentence = Array.from({ length: 120 }, () => 'a').join(' ');
          const reference = Array.from({ length: 1500 }, () => sentence).join('|');
          const segmenter = (input) => input.split('|');
          const tokenizer = (input) => input.split(' ');
          const score = module.exports.l(sentence, reference, {
            beta: Number.POSITIVE_INFINITY,
            segmenter,
            tokenizer,
          });
          if (score !== 1 / 1500) {
            throw new Error('Clipped ROUGE-L recall changed');
          }
          process.stdout.write('ok');
        `,
        3000,
      );
    }, 10_000);

    test.each([true, false])('keeps boundaries with caseSensitive=%s', (caseSensitive) => {
      const tokenizer = (text: string): string[] => text.match(/[A-Za-z]+/g) || [];
      const first = 'Alpha works at Acme Co. Beta sleeps near Luna Inc.';
      const second = 'Beta sleeps near Luna Inc. Alpha works at Acme Co.';
      expect(l(first, second, { tokenizer, caseSensitive })).toBe(1);
    });

    test.each([
      { name: 'negative out-of-range index', indices: [-1] },
      { name: 'upper out-of-range index', indices: [2] },
      { name: 'fractional index', indices: [0.5] },
      { name: 'duplicate indices', indices: [0, 0] },
      { name: 'descending indices', indices: [1, 0] },
    ])('should reject $name', ({ indices }) => {
      expect(() => l('a b', 'a b', { lcsIndices: () => indices })).toThrow(
        /strictly increasing integer indices within the reference/,
      );
    });

    test('should compute union LCS across all candidate sentences', () => {
      const multiSentCand = 'The cat sat. The dog ran. The bird flew.';
      const multiSentRef = 'The cat sat on the mat.';
      const score = l(multiSentCand, multiSentRef, { beta: 1 });
      // Four matched reference positions, twelve candidate tokens, seven reference tokens.
      expect(score).toBeCloseTo(8 / 19);
    });

    test('should handle multi-sentence summaries correctly', () => {
      // Candidate has words spread across multiple sentences
      const cand = 'Police arrived. They killed the gunman.';
      const reference = 'police killed the gunman';
      const score = l(cand, reference, { beta: 1, caseSensitive: false });
      // LCS should find matches from both candidate sentences
      expect(score).toBeCloseTo(2 / 3);
    });

    test('should correctly distinguish precision from recall', () => {
      // Short candidate, long reference - tests that P and R are not swapped
      // candidate: "the cat" (2 words), reference: "the cat sat" (3 words)
      // LCS: "the cat" (2 words)
      // Correct: Recall = 2/3 (ref coverage), Precision = 2/2 = 1 (candidate precision)
      const shortCand = 'the cat';
      const longRef = 'the cat sat';
      // With beta=Infinity (pure recall), should return recall = 2/3
      const recallScore = l(shortCand, longRef, { beta: Number.POSITIVE_INFINITY });
      expect(recallScore).toBeCloseTo(2 / 3, 5);
    });
  });
});
