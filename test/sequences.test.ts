import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { lcsIndices } from '../src/lcs';
import * as rouge from '../src/rouge';
import {
  expectBundledScriptToPass,
  invalidMaxSkips,
  invalidNGramSizes,
  legacyLcsIndices,
} from './helpers';

describe('intersection', () => {
  const ins = rouge.intersection;

  test('should return empty array for two empty inputs', () => {
    expect(ins([], [])).toEqual([]);
  });
  test('should return empty array for first empty input', () => {
    expect(ins([], ['2'])).toEqual([]);
  });
  test('should return empty array for second empty input', () => {
    expect(ins(['2'], [])).toEqual([]);
  });

  test('should return singleton value of singleton array', () => {
    expect(ins(['2'], ['2'])).toEqual(['2']);
  });
  test('should return identical value of identical arrays', () => {
    expect(ins(['1', '2', '3'], ['1', '2', '3'])).toEqual(['1', '2', '3']);
  });

  test('should return ["2"] for ["1", "2", "3"] and ["2", "4", "6"]', () => {
    expect(ins(['1', '2', '3'], ['2', '4', '6'])).toEqual(['2']);
  });
  test('should return ["2", "3"] for ["1", "2", "3"] and ["2", "3", "6"]', () => {
    expect(ins(['1', '2', '3'], ['2', '3', '6'])).toEqual(['2', '3']);
  });
  test('should retain set semantics for repeated elements', () => {
    expect(ins(['a', 'a', 'b'], ['a', 'a', 'a'])).toEqual(['a']);
  });
  test('should return ["1", "2", "3"] for ["1", "2", "3"] and ["1", "2", "3", "6"]', () => {
    expect(ins(['1', '2', '3'], ['1', '2', '3', '6'])).toEqual(['1', '2', '3']);
  });
});

describe('lcs', () => {
  const { lcs } = rouge;

  test('should return empty array for empty first input', () => {
    expect(lcs([], ['1'])).toEqual([]);
  });
  test('should return empty array for empty second input', () => {
    expect(lcs(['1'], [])).toEqual([]);
  });
  test('should return empty array for unique inputs', () => {
    expect(lcs(['1'], ['2'])).toEqual([]);
  });
  test('should return singleton value for singleton inputs', () => {
    expect(lcs(['1'], ['1'])).toEqual(['1']);
  });

  test('should return ["1", "1"] for ["1", "1"] and ["2", "1", "1", "3"]', () => {
    expect(lcs(['1', '1'], ['2', '1', '1', '3'])).toEqual(['1', '1']);
  });
  test('should return ["2", "3"] for ["1", "2", "3"] and ["2", "3", "5"]', () => {
    expect(lcs(['1', '2', '3'], ['2', '3', '5'])).toEqual(['2', '3']);
  });
  test('should preserve its choice when multiple longest subsequences exist', () => {
    expect(lcs(['a', 'b'], ['b', 'a'])).toEqual(['b']);
  });
  test('should preserve legacy reference-position choices', () => {
    const sequences: string[][] = [[]];
    for (let length = 1; length <= 5; length++) {
      for (let bits = 0; bits < 2 ** length; bits++) {
        sequences.push(Array.from({ length }, (_, index) => ((bits >> index) & 1 ? 'b' : 'a')));
      }
    }

    for (const candidate of sequences) {
      for (const reference of sequences) {
        expect(lcsIndices(candidate, reference)).toEqual(legacyLcsIndices(candidate, reference));
      }
    }
  });
  test('should return ["w1", "w3", "w5"] for ["w1", "w2", "w3", "w4", "w5"] and ["w1", "w3", "w8", "w9", "w5"]', () => {
    expect(lcs(['w1', 'w2', 'w3', 'w4', 'w5'], ['w1', 'w3', 'w8', 'w9', 'w5'])).toEqual([
      'w1',
      'w3',
      'w5',
    ]);
  });

  test('should process long token sequences within a small heap', () => {
    const bundled = buildSync({
      entryPoints: [join(__dirname, '../src/rouge.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      write: false,
    }).outputFiles[0].text;
    const script = `${bundled}
          const tokens = Array.from({ length: 4000 }, (_, index) => \`token-\${index}\`);
          const result = module.exports.lcs(tokens, tokens);
          if (result.length !== tokens.length || result[0] !== tokens[0] || result.at(-1) !== tokens.at(-1)) {
            throw new Error('LCS content changed');
          }
          process.stdout.write('ok');
        `;
    const child = spawnSync(process.execPath, ['--max-old-space-size=64'], {
      input: script,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(child.error).toBeUndefined();
    expect({ status: child.status, stderr: child.stderr }).toEqual({
      status: 0,
      stderr: '',
    });
    expect(child.stdout).toBe('ok');
  }, 30_000);
});

describe('nGram', () => {
  const { nGram } = rouge;
  const data = ['a', 'b', 'c', 'd'];

  test('should throw RangeError for invalid ngram size', () => {
    expect(() => nGram(data, 5)).toThrow(RangeError);
  });

  test.each(invalidNGramSizes)('should reject invalid ngram size %s', (size) => {
    expect(() => nGram(data, size)).toThrow(RangeError);
  });

  test("should return ['a', 'b', 'c', 'd'] for n = 1", () => {
    expect(nGram(data, 1)).toEqual(['a', 'b', 'c', 'd']);
  });
  test("should return ['a b', 'b c', 'c d'] for n = 2", () => {
    expect(nGram(data)).toEqual(['a b', 'b c', 'c d']);
  });

  test('should retain readable public gram strings for multiword tokens', () => {
    expect(nGram(['new york', 'city'])).toEqual(['new york city']);
    expect(nGram(['new', 'york city'])).toEqual(['new york city']);
  });
  test("should return ['a b c', 'b c d'] for n = 3", () => {
    expect(nGram(data, 3)).toEqual(['a b c', 'b c d']);
  });
  test("should return ['a b c d'] for n = 4", () => {
    expect(nGram(data, 4)).toEqual(['a b c d']);
  });

  test('should pad only the start of the string', () => {
    expect(nGram(data, 4, { start: true })).toEqual([
      '<S> <S> <S> a',
      '<S> <S> a b',
      '<S> a b c',
      'a b c d',
    ]);
  });
  test('should pad only the end of the string', () => {
    expect(nGram(data, 4, { end: true })).toEqual([
      'a b c d',
      'b c d <S>',
      'c d <S> <S>',
      'd <S> <S> <S>',
    ]);
  });
  test('should pad both the start and end of the string', () => {
    expect(nGram(data, 4, { start: true, end: true })).toEqual([
      '<S> <S> <S> a',
      '<S> <S> a b',
      '<S> a b c',
      'a b c d',
      'b c d <S>',
      'c d <S> <S>',
      'd <S> <S> <S>',
    ]);
  });
  test('should change the padding word', () => {
    expect(nGram(data, 4, { start: true, val: '<UNK>' })).toEqual([
      '<UNK> <UNK> <UNK> a',
      '<UNK> <UNK> a b',
      '<UNK> a b c',
      'a b c d',
    ]);
  });

  test('should default undefined padding fields without changing false', () => {
    expect(nGram(data, 2, { start: true, end: false, val: undefined })).toEqual([
      '<S> a',
      'a b',
      'b c',
      'c d',
    ]);
    expect(nGram(data, 2, { start: undefined, end: undefined })).toEqual(nGram(data, 2));
  });

  test('should apply requested padding before validating short inputs', () => {
    const oneToken = ['a'];
    expect(nGram(oneToken, 2, { start: true })).toEqual(['<S> a']);
    expect(nGram(oneToken, 2, { end: true })).toEqual(['a <S>']);
    expect(nGram([], 2, { start: true, end: true })).toEqual(['<S> <S>']);
    expect(oneToken).toEqual(['a']);
  });

  test('should still reject short inputs when padding is insufficient', () => {
    expect(() => nGram([], 2, { start: true })).toThrow(RangeError);
  });

  test('should reject impossible padding before allocation', () => {
    expect(() => nGram([], 1_000_000_000, { start: true })).toThrow(RangeError);
  });

  test('should reject excessive two-sided padding before materialization', () => {
    expect(() => nGram([], 1_000_000_000, { start: true, end: true })).toThrow(
      /materialization limit/,
    );
  });

  test('should reject excessive unpadded n-gram materialization', () => {
    const tokens = new Array<string>(2000).fill('a');
    expect(() => nGram(tokens, 1000)).toThrow(/materialization limit/);
  });

  test('should include joining spaces in the materialization limit', () => {
    expect(() => nGram(new Array<string>(1999).fill('a'), 1000)).toThrow(/materialization limit/);
  });

  test('should preserve sparse token arrays', () => {
    expect(nGram(new Array<string>(2), 2)).toEqual([' ']);
    const tokens = new Array<string>(3);
    tokens[0] = 'a';
    tokens[2] = 'c';
    expect(nGram(tokens, 2)).toEqual(['a ', ' c']);
  });
});

describe('skipBigram', () => {
  const sb = rouge.skipBigram;

  const data = ['a', 'b', 'c', 'd'];
  const result = ['a b', 'a c', 'a d', 'b c', 'b d', 'c d'];

  test('should throw RangeError for inputs with insufficient words', () => {
    expect(() => sb(['a'])).toThrow(RangeError);
  });

  test.each(invalidMaxSkips)('should reject invalid maxSkip %s', (maxSkip) => {
    expect(() => sb(data, maxSkip)).toThrow(RangeError);
  });

  test('should return the correct result', () => {
    expect(sb(data)).toEqual(result);
  });

  test('should retain readable public skip-bigram strings for multiword tokens', () => {
    expect(sb(['new york', 'city'])).toEqual(['new york city']);
    expect(sb(['new', 'york city'])).toEqual(['new york city']);
  });

  test('should return all pairs with default maxSkip (Infinity)', () => {
    expect(sb(data, Number.POSITIVE_INFINITY)).toEqual(result);
  });

  test('should return only adjacent pairs with maxSkip=1', () => {
    expect(sb(data, 1)).toEqual(['a b', 'b c', 'c d']);
  });

  test('should return pairs within skip distance of 2', () => {
    expect(sb(data, 2)).toEqual(['a b', 'a c', 'b c', 'b d', 'c d']);
  });

  test('should return pairs within skip distance of 3', () => {
    expect(sb(data, 3)).toEqual(['a b', 'a c', 'a d', 'b c', 'b d', 'c d']);
  });

  test('rejects excessive pair counts before materializing bigrams', () => {
    expect(() => sb(new Array<string>(1600).fill('a'))).toThrow(/materialization limit/);
  });

  test('accounts for long token values in the materialization limit', () => {
    expect(() => sb(['a'.repeat(500_000), 'b'.repeat(500_000)])).toThrow(/materialization limit/);
    expect(sb(['a'.repeat(500_000), 'b'.repeat(500_000)], 0)).toEqual([]);
  });

  test('rejects oversized inputs within a constrained heap', () => {
    expectBundledScriptToPass(
      `
          try {
            module.exports.skipBigram(new Array(1600).fill('token'));
            throw new Error('Oversized skip-bigrams were accepted');
          } catch (error) {
            if (!(error instanceof RangeError) || !/materialization limit/.test(error.message)) {
              throw error;
            }
          }
          process.stdout.write('ok');
        `,
      10_000,
      ['--max-old-space-size=32'],
    );
  }, 10_000);
});
