import * as rouge from '../src/rouge';

describe('Utility Functions', () => {
  describe('jackKnife', () => {
    const jk = rouge.jackKnife;

    const cands = ['a', 'ab', 'abc', 'abcd'];

    const ref = 'abcd';

    const evalFunc = (a: string, b: string): number => a.length + b.length;

    const statTest = (input: number[]): number => input.reduce((a, b) => a + b);

    test('should throw RangeError when less than 2 candidates are provided', () => {
      expect(() => jk(['a'], ref, evalFunc)).toThrow(RangeError);
    });

    test('should return the correct result using default statistical test', () => {
      expect(jk(cands, ref, evalFunc)).toBe(7.75);
    });

    test('should return the correct result using alternative test', () => {
      expect(jk(cands, ref, evalFunc, statTest)).toBe(31);
    });

    test('should preserve leave-one-out maxima and score each candidate once', () => {
      const scorer = jest.fn((candidate: string): number => Number(candidate));
      const statistic = jest.fn(() => 0);

      expect(jk(['4', '3', '2'], ref, scorer, statistic)).toBe(0);
      expect(statistic).toHaveBeenCalledWith([3, 4, 4]);
      expect(scorer.mock.calls).toEqual([
        ['4', ref],
        ['3', ref],
        ['2', ref],
      ]);
    });

    test('should preserve NaN propagation in leave-one-out maxima', () => {
      const statistic = jest.fn(() => 0);
      jk(['nan', '3', '1'], ref, (candidate) => Number(candidate), statistic);
      expect(statistic).toHaveBeenCalledWith([3, Number.NaN, Number.NaN]);
    });

    test('should handle large candidate sets without quadratic resampling', () => {
      const candidates = Array.from({ length: 50_000 }, (_, index) => String(index));
      expect(jk(candidates, ref, () => 1)).toBe(1);
    });

    test('should adapt multiple references without reversing an asymmetric scorer', () => {
      const candidate = 'a';
      const references = ['a b', 'a c d', 'a b c d e'];
      const recall = jest.fn((summary: string, reference: string): number =>
        rouge.n(summary, reference, { beta: Number.POSITIVE_INFINITY }),
      );

      expect(
        jk(references, candidate, (reference, summary) => recall(summary, reference)),
      ).toBeCloseTo(4 / 9, 15);
      expect(recall.mock.calls).toEqual(references.map((reference) => [candidate, reference]));

      // Direct callbacks retain the documented candidate-first orientation.
      expect(jk(references, candidate, recall)).toBe(1);
    });
  });
});
