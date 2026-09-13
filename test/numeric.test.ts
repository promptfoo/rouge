import * as rouge from '../src/rouge';
import { invalidBetas, nonFiniteNumbers, unsafeInteger } from './helpers';

describe('fact', () => {
  const { fact } = rouge;

  test.each([-1, 1.5, 171, Number.NaN, Number.POSITIVE_INFINITY])(
    'should throw RangeError for invalid input %p',
    (input) => {
      expect(() => fact(input)).toThrow(RangeError);
    },
  );

  test.each([
    [0, 1],
    [1, 1],
    [5, 120],
    [20, 2_432_902_008_176_640_000],
    [98, 9.426_890_448_883_248e153],
    [170, 7.257_415_615_308_004e306],
  ])('should compute %i!', (input, expected) => {
    expect(fact(input)).toBe(expected);
  });
});

describe('comb2', () => {
  const { comb2 } = rouge;

  test.each([1, ...nonFiniteNumbers, 2.5, unsafeInteger])(
    'should reject invalid item count %s',
    (value) => {
      expect(() => comb2(value)).toThrow(RangeError);
    },
  );
  test('should reject results that exceed the safe integer range', () => {
    expect(() => comb2(134_217_729)).toThrow(RangeError);
  });

  test('should return 1 for C(2,2)', () => {
    expect(comb2(2)).toBe(1);
  });
  test('should return 45 for C(10,2)', () => {
    expect(comb2(10)).toBe(45);
  });
  test('should return 499500 for C(1000,2)', () => {
    expect(comb2(1000)).toBe(499_500);
  });
  test('should return the largest safe boundary result', () => {
    expect(comb2(134_217_728)).toBe(9_007_199_187_632_128);
  });
});

describe('arithmeticMean', () => {
  const am = rouge.arithmeticMean;

  test('should throw RangeError for empty array', () => {
    expect(() => am([])).toThrow(RangeError);
  });

  test('should return singleton value of singleton array', () => {
    expect(am([5])).toBe(5);
  });
  test('should return value of homogeneous array', () => {
    expect(am([5, 5, 5])).toBe(5);
  });

  test('should return 2 for [1, 2, 3]', () => {
    expect(am([1, 2, 3])).toBe(2);
  });
  test('should return 2.5 for [1, 2, 3, 4]', () => {
    expect(am([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('fMeasure', () => {
  const fm = rouge.fMeasure;

  test.each(nonFiniteNumbers)('should reject non-finite precision and recall %s', (value) => {
    expect(() => fm(value, 0.5)).toThrow(RangeError);
    expect(() => fm(0.5, value)).toThrow(RangeError);
  });

  test.each(invalidBetas)('should reject invalid beta %s even with no matches', (beta) => {
    expect(() => fm(0, 0, beta)).toThrow(RangeError);
  });

  const largeBetas = [1e154, 1e200, Number.MAX_VALUE];
  test.each(largeBetas)('should stay finite for large finite beta %s', (beta) => {
    expect(fm(1, 0.5, beta)).toBeCloseTo(0.5);
    expect(fm(0.5, 1, beta)).toBeCloseTo(1);
    expect(fm(0, 0.5, beta)).toBe(0);
    expect(fm(0.5, 0, beta)).toBe(0);
  });

  test('should not underflow the precision-recall product', () => {
    expect(fm(1e-200, 2e-200) / 1e-200).toBeCloseTo(4 / 3);
    expect(fm(1e-200, 1e-200, 2)).toBe(1e-200);
    expect(fm(1e-300, 0.5, 1e200)).toBe(0.5);
  });

  test('should preserve denominator ratios involving subnormal inputs', () => {
    expect(fm(Number.MIN_VALUE, 2e-124, 1e100) / 1e-124).toBeCloseTo(1.423_685_637_8, 9);
    expect(fm(2e-124, Number.MIN_VALUE, 1e-100) / 1e-124).toBeCloseTo(1.423_685_637_8, 9);
    expect(fm(Number.MIN_VALUE, 1, 1e161)).toBeCloseTo(0.047_080_479_817_375_9, 14);
    expect(fm(Number.MIN_VALUE, 1, Number.MAX_VALUE)).toBe(1);
    expect(fm(1, Number.MIN_VALUE, 2)).toBe(Number.MIN_VALUE);
  });

  const scoreBoundsCases = [
    [1.737_610_985_955_693e-134, 1, 1.884_479_164_656_194_7e105],
    [0.8, 0.799_999_999_999_999_9, 2.5],
  ];
  test.each(scoreBoundsCases)('bounds F-beta (%p, %p, %p)', (p, r, beta) => {
    for (const score of [fm(p, r, beta), fm(r, p, 1 / beta)]) {
      expect(score).toBeGreaterThanOrEqual(Math.min(p, r));
      expect(score).toBeLessThanOrEqual(Math.max(p, r));
    }
  });

  test('should throw RangeError for OOB precision input', () => {
    expect(() => fm(10, 0.5)).toThrow(RangeError);
  });
  test('should throw RangeError for OOB recall input', () => {
    expect(() => fm(0.5, 10)).toThrow(RangeError);
  });
  test('should throw RangeError for OOB beta input', () => {
    expect(() => fm(0.5, 0.75, -1)).toThrow(RangeError);
  });

  test('should return pure recall when beta is Infinity', () => {
    expect(fm(0.5, 0.75, Number.POSITIVE_INFINITY)).toBe(0.75);
  });
  test.each([0, -0])('uses precision for beta=%p', (beta) => {
    expect(fm(0.5, 0.75, beta)).toBe(0.5);
    expect(fm(Number.MIN_VALUE, 1, beta)).toBe(Number.MIN_VALUE);
  });
  test('should correctly compute F1 score (beta=1)', () => {
    expect(fm(0.5, 0.75, 1)).toBeCloseTo(0.6, 15);
  });
  test('should correctly compute F2 score (beta=2, favors recall)', () => {
    // F2 = (1 + 4) * P * R / (4 * P + R) = 5 * 0.5 * 0.75 / (2 + 0.75) = 1.875 / 2.75
    expect(fm(0.5, 0.75, 2)).toBeCloseTo(1.875 / 2.75, 10);
  });
  test('should correctly compute F0.5 score (beta=0.5, favors precision)', () => {
    // F0.5 = (1 + 0.25) * P * R / (0.25 * P + R) = 1.25 * 0.5 * 0.75 / (0.125 + 0.75)
    expect(fm(0.5, 0.75, 0.5)).toBeCloseTo((1.25 * 0.5 * 0.75) / 0.875, 10);
  });
  test('should return 0 when both precision and recall are 0', () => {
    expect(fm(0, 0, 1)).toBe(0);
  });
  test('should return 0 when precision is 0', () => {
    expect(fm(0, 0.5, 1)).toBe(0);
  });
  test('should return 0 when recall is 0', () => {
    expect(fm(0.5, 0, 1)).toBe(0);
  });
  test('should return 0 when beta=0 and recall=0 (edge case denominator=0)', () => {
    // When beta=0, denominator = 0*p + r = r. If r=0, denominator=0
    expect(fm(0.5, 0, 0)).toBe(0);
  });
});
