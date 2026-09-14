import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { lcsIndices } from '../src/lcs';
import * as rouge from '../src/rouge';

const bracketPairs = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['<', '>'],
] as const;
const geographicAcronyms = ['U.S.', 'U.S.A.', 'E.U.'];
const nonFiniteNumbers = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
const unsafeInteger = Number.MAX_SAFE_INTEGER + 1;
const invalidNGramSizes = [...nonFiniteNumbers, -1, 0, 1.5, unsafeInteger];
const invalidMaxSkips = [Number.NaN, Number.NEGATIVE_INFINITY, -1, 0.5, 1.5];
const invalidBetas = [Number.NaN, Number.NEGATIVE_INFINITY, -1];

function legacyLcsIndices(a: string[], b: string[]): number[] {
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      lengths[i][j] =
        a[i - 1] === b[j - 1]
          ? lengths[i - 1][j - 1] + 1
          : Math.max(lengths[i - 1][j], lengths[i][j - 1]);
    }
  }

  const indices: number[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      indices.push(j - 1);
      i--;
      j--;
    } else if (lengths[i - 1][j] > lengths[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return indices.reverse();
}

function expectBundledScriptToPass(script: string, timeout: number, nodeArgs: string[] = []): void {
  const bundled = buildSync({
    entryPoints: [join(__dirname, '../src/rouge.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    write: false,
  }).outputFiles[0].text;
  const child = spawnSync(process.execPath, nodeArgs, {
    input: `${bundled}\n${script}`,
    encoding: 'utf8',
    timeout,
  });
  if (child.error) {
    throw child.error;
  }
  if (child.status !== 0 || child.stderr !== '' || child.stdout !== 'ok') {
    throw new Error(
      `Bundled script failed: ${JSON.stringify({ status: child.status, stderr: child.stderr, stdout: child.stdout })}`,
    );
  }
}

describe('Utility Functions', () => {
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

  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;
    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test('should return empty array for empty input', () => {
      expect(ss('')).toEqual([]);
    });

    // Golden Rule tests from https://github.com/diasks2/pragmatic_segmenter
    // =====================================================================

    test.each([
      [
        '016',
        'I work for the U.S. Government in Virginia.',
        ['I work for the U.S. Government in Virginia.'],
      ],
      [
        '031',
        '1.) The first item 2.) The second item',
        ['1.) The first item', '2.) The second item'],
      ],
      ['033', '1) The first item 2) The second item', ['1) The first item', '2) The second item']],
      ['035', '1. The first item 2. The second item', ['1. The first item', '2. The second item']],
      [
        '036',
        '1. The first item. 2. The second item.',
        ['1. The first item.', '2. The second item.'],
      ],
      [
        '037',
        '• 9. The first item • 10. The second item',
        ['• 9. The first item', '• 10. The second item'],
      ],
      [
        '038',
        '⁃9. The first item ⁃10. The second item',
        ['⁃9. The first item', '⁃10. The second item'],
      ],
      [
        '039',
        'a. The first item b. The second item c. The third list item',
        ['a. The first item', 'b. The second item', 'c. The third list item'],
      ],
      [
        '046',
        'Thoreau argues that by simplifying one’s life, “the laws of the universe will appear less complex. . . .”',
        [
          'Thoreau argues that by simplifying one’s life, “the laws of the universe will appear less complex. . . .”',
        ],
      ],
      [
        '048',
        'Omitted words end in a period . . . . Next sentence.',
        ['Omitted words end in a period . . . .', 'Next sentence.'],
      ],
      [
        '049',
        'I never meant that.... She left the store.',
        ['I never meant that....', 'She left the store.'],
      ],
      [
        '050',
        "I wasn’t really ... well, what I mean...see . . . what I'm saying, the thing is . . . I didn’t mean it.",
        [
          "I wasn’t really ... well, what I mean...see . . . what I'm saying, the thing is . . . I didn’t mean it.",
        ],
      ],
      [
        '051',
        'One further habit which was somewhat weakened . . . was that of combining words into self-interpreting compounds. . . . The practice was not abandoned. . . .',
        [
          'One further habit which was somewhat weakened . . . was that of combining words into self-interpreting compounds.',
          '. . . The practice was not abandoned. . . .',
        ],
      ],
      [
        '052',
        'Hello world.Today is Tuesday.Mr. Smith went to the store and bought 1,000.That is a lot.',
        [
          'Hello world.',
          'Today is Tuesday.',
          'Mr. Smith went to the store and bought 1,000.',
          'That is a lot.',
        ],
      ],
    ] as const)('matches upstream English Golden Rule #%s', (_rule, input, expected) => {
      expect(ss(input)).toEqual(expected);
    });

    test('continues segmenting sentences inside numbered list items', () => {
      expect(ss('1. First sentence. Another sentence. 2. Second item.')).toEqual([
        '1. First sentence.',
        'Another sentence.',
        '2. Second item.',
      ]);
      expect(ss('1. See section 2. Details follow. 2. Actual item.')).toEqual([
        '1. See section 2.',
        'Details follow.',
        '2. Actual item.',
      ]);
    });

    test('keeps name initials inside numbered list items', () => {
      expect(ss('1. J. Smith will attend 2. A. Brown will attend')).toEqual([
        '1. J. Smith will attend',
        '2. A. Brown will attend',
      ]);
    });

    test('keeps name initials inside lettered list items', () => {
      expect(ss('a. J. Smith will attend b. A. Brown will attend')).toEqual([
        'a. J. Smith will attend',
        'b. A. Brown will attend',
      ]);
    });

    test('recognizes quoted and bracketed list-item starts', () => {
      expect(ss('1. "First item" 2. "Second item"')).toEqual([
        '1. "First item"',
        '2. "Second item"',
      ]);
      expect(ss('1. (First item) 2. (Second item)')).toEqual([
        '1. (First item)',
        '2. (Second item)',
      ]);
    });

    test('recognizes list markers without depending on item capitalization', () => {
      const input = '1. The first item 2. The second item';
      const expected = ['1. The first item', '2. The second item'];
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test('recognizes list markers after document indentation', () => {
      expect(ss('  1. The first item 2. The second item')).toEqual([
        '1. The first item',
        '2. The second item',
      ]);
    });

    test('keeps four-dot boundaries invariant under case folding', () => {
      expect(segmentCaseNeutrally('First.... Second.')).toEqual(['First....', 'Second.']);
      expect(segmentCaseNeutrally('first.... second.')).toEqual(['first....', 'second.']);
    });

    test('keeps unspaced boundaries invariant under case folding', () => {
      expect(segmentCaseNeutrally('Hello world.Today is Tuesday.')).toEqual([
        'Hello world.',
        'Today is Tuesday.',
      ]);
      expect(segmentCaseNeutrally('hello world.today is tuesday.')).toEqual([
        'hello world.',
        'today is tuesday.',
      ]);
    });

    test('keeps uppercase email domain labels inside their address', () => {
      expect(ss('Mail Jane.Doe@example.COM for help.')).toEqual([
        'Mail Jane.Doe@example.COM for help.',
      ]);
    });

    test('splits adjacent sentences after email addresses', () => {
      expect(ss('Contact me@example.com.Next sentence.')).toEqual([
        'Contact me@example.com.',
        'Next sentence.',
      ]);
    });

    test.each(['Visit example.COM for help.', 'Visit https://example.COM/path today.'])(
      'keeps uppercase hostname labels inside %s',
      (input) => {
        expect(ss(input)).toEqual([input]);
      },
    );

    test('keeps mixed-case hostnames invariant under case folding', () => {
      const input = 'Visit example.Com for help.';
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each(['?', '!'])('keeps uppercase URL components after a %s separator', (separator) => {
      const input = `Visit https://example.com${separator}Next=value for details.`;
      expect(ss(input)).toEqual([input]);
    });

    test.each([
      ['The build failed.App restarted.', ['The build failed.', 'App restarted.']],
      ['The service stopped.Dev investigated.', ['The service stopped.', 'Dev investigated.']],
      [
        'Visit https://example.com. Then it failed.App restarted.',
        ['Visit https://example.com.', 'Then it failed.', 'App restarted.'],
      ],
    ])('does not mistake an unspaced sentence for a hostname: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
    });

    test.each(['He earned a Ph.D in physics.', 'Open README.MD before continuing.'])(
      'keeps dotted identifiers inside a sentence: %s',
      (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      },
    );

    test('keeps bracketed references inside their sentence', () => {
      expect(ss('He wrote (see Fig.[2] for details). Next.')).toEqual([
        'He wrote (see Fig.[2] for details).',
        'Next.',
      ]);
    });

    test('keeps parenthesized page references inside their sentence', () => {
      const input = 'See p.(10) for details.';
      expect(ss(input)).toEqual([input]);
    });

    test.each([
      ['Hello world."Next sentence."', ['Hello world.', '"Next sentence."']],
      ["Hello world.'Next sentence.'", ['Hello world.', "'Next sentence.'"]],
      ['Hello world.(Next sentence.)', ['Hello world.', '(Next sentence.)']],
      ['Hello world.(2 people agreed.)', ['Hello world.', '(2 people agreed.)']],
      ['Hello world.[2 people agreed.]', ['Hello world.', '[2 people agreed.]']],
      ['Hello world."2 people agreed."', ['Hello world.', '"2 people agreed."']],
    ])('keeps opening delimiters with adjacent sentence starts in %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
    });

    test('does not merge incompatible geographic-acronym continuations', () => {
      expect(ss('The treaty applies in the E.U. Congress meets tomorrow.')).toEqual([
        'The treaty applies in the E.U.',
        'Congress meets tomorrow.',
      ]);
    });

    test.each([
      ['Use etc.Today is Tuesday.', ['Use etc.', 'Today is Tuesday.']],
      ['He moved to the U.S.Today is Tuesday.', ['He moved to the U.S.', 'Today is Tuesday.']],
      ['Are you ready?Yes, I am.', ['Are you ready?', 'Yes, I am.']],
      ['Are any left?2 remain.', ['Are any left?', '2 remain.']],
      ['Stop!Run now.', ['Stop!', 'Run now.']],
      ['Stop!2 people stayed.', ['Stop!', '2 people stayed.']],
    ])('recognizes adjacent terminal boundaries in %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
    });

    test.each([
      ['"Next sentence."', '"Next sentence."'],
      ['(Next sentence.)', '(Next sentence.)'],
      ['2 people agreed.', '2 people agreed.'],
    ])('retains a spaced-ellipsis boundary before %s', (start, expected) => {
      expect(ss(`Omitted words . . . . ${start}`)).toEqual(['Omitted words . . . .', expected]);
    });

    test('should split simple periods', () => {
      expect(ss('Hello World. My name is Jonas.')).toEqual(['Hello World.', 'My name is Jonas.']);
    });

    test('treats NEL as whitespace after sentence terminators', () => {
      expect(ss('Alpha.\u0085Beta.')).toEqual(['Alpha.', 'Beta.']);
    });

    test.each([
      ['astral uppercase', '\u{10400}', true],
      ['astral lowercase', '\u{10428}', false],
      ['titlecase', 'ǅ', true],
      ['Roman numeral', 'Ⅰ', true],
      ['circled uppercase', 'Ⓐ', true],
      ['mapping-less uppercase', '𝐀', true],
      ['mapping-less lowercase', '𝐚', false],
    ])('classifies %s sentence starts', (_label, character, defaultBoundary) => {
      const input = `Use etc. ${character} begins.`;
      const sentences = ['Use etc.', `${character} begins.`];
      expect(ss(input)).toEqual(defaultBoundary ? sentences : [input]);
      expect(segmentCaseNeutrally(input)).toEqual(sentences);
    });

    test('recognizes titlecase letters across line wraps', () => {
      expect(ss('ǅuro\ncontinued.')).toEqual(['ǅuro continued.']);
    });

    test.each([
      ['Use etc. Another sentence.', ['Use etc.', 'Another sentence.']],
      ['use etc. another sentence.', ['use etc.', 'another sentence.']],
    ])('segments %j without changing its text', (input, expected) => {
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      'we need etc. and more animals.',
      'at 8 a.m. and later we left.',
      'i lived in calif. and moved east.',
      'they worked at acme co. at noon.',
      'she wrote "hello." then left.',
    ])('keeps lowercase sentence continuations case-neutrally: %s', (input) => {
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test('should match lowercase-equivalent Unicode abbreviations case-neutrally', () => {
      const mixedCase = 'Da\u212a.\nNext.';
      const lowerCase = mixedCase.toLowerCase();
      expect(ss(mixedCase)).toEqual(['Da\u212a.', 'Next.']);
      expect(segmentCaseNeutrally(mixedCase)).toEqual(['Da\u212a.', 'Next.']);
      expect(segmentCaseNeutrally(lowerCase)).toEqual(['dak.', 'next.']);
    });

    test('should preserve gate exceptions in case-neutral quoted continuations', () => {
      expect(segmentCaseNeutrally('"Mt." Next stop.')).toEqual(['"Mt." Next stop.']);
      expect(segmentCaseNeutrally('"mt." next stop.')).toEqual(['"mt." next stop.']);
    });

    test.each([
      ['He answered "No." In fact, he left.', ['He answered "No."', 'In fact, he left.']],
      ['He said "No." But I left.', ['He said "No."', 'But I left.']],
      ['He said "No." But John left.', ['He said "No."', 'But John left.']],
      ['He said "No." And the manager agreed.', ['He said "No."', 'And the manager agreed.']],
      ['He said "No." And we left.', ['He said "No."', 'And we left.']],
      ['He said "No." In time, we left.', ['He said "No."', 'In time, we left.']],
      ['She paused. "Then we begin."', ['She paused.', '"Then we begin."']],
    ])('retains capitalized sentence starts after closing delimiters in %s', (input, expected) => {
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test('keeps abbreviation continuations invariant under case folding', () => {
      const input = 'Use etc. And more animals.';
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test('keeps independent abbreviation continuations invariant under case folding', () => {
      const input = 'Use etc. In fact, this is common.';
      const expected = ['Use etc.', 'In fact, this is common.'];
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test('recognizes independent clauses with noun subjects after abbreviations', () => {
      const input = 'Use etc. But John left.';
      const expected = ['Use etc.', 'But John left.'];
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['smiled', 'laughed', 'danced', 'recovered', 'reads'])(
      'recognizes independent noun-subject clauses without a verb whitelist: %s',
      (verb) => {
        const input = `Use etc. But John ${verb}.`;
        const expected = ['Use etc.', `But John ${verb}.`];
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test.each([
      'After that, John smiled.',
      'Because he was late, John hurried.',
      'While we waited, John arrived.',
      'At noon, John left.',
      'On Monday, work resumed.',
      'With little warning, it ended.',
      'By noon, we returned.',
      'From there, everyone left.',
      'To begin, we agreed.',
      'As expected, it worked.',
      'In July, we moved.',
      'For example, John laughed.',
    ])('recognizes independent sentence-initial clauses: %s', (continuation) => {
      const input = `The list includes cats, dogs, etc. ${continuation}`;
      const expected = ['The list includes cats, dogs, etc.', continuation];
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['because', 'while', 'after', 'before', 'although', 'unless', 'until', 'when'])(
      'keeps subordinating continuation %s inside the sentence',
      (conjunction) => {
        const input = `we chose acme co. ${conjunction} it was reliable.`;
        expect(segmentCaseNeutrally(input)).toEqual(ss(input));
      },
    );

    test.each(['\n', '\r\n', '\r'])(
      'keeps lowercase quote continuations after uncased starts across %j',
      (lineBreak) => {
        expect(segmentCaseNeutrally(`2020 saw "hello."${lineBreak}then left.`)).toEqual([
          '2020 saw "hello." then left.',
        ]);
        expect(segmentCaseNeutrally(`2020 saw <hello.>${lineBreak}then left.`)).toEqual([
          '2020 saw <hello.> then left.',
        ]);
      },
    );

    test('retains line boundaries after numeric headings', () => {
      expect(segmentCaseNeutrally('2020 report\nand sales rose.')).toEqual([
        '2020 report',
        'and sales rose.',
      ]);
    });

    test.each(['\u212a', '\u0130', 'I\u0307\u0323', 'I\u093e', 'I\u20dd', '\u{10400}\u0307'])(
      'should treat combining marks as part of a case-neutral initial: %s',
      (initial) => {
        const firstSentence = `Albert ${initial}.`;
        const text = `${firstSentence} Jones left.`;
        const lowerCase = text.toLowerCase();
        expect(segmentCaseNeutrally(text)).toEqual([firstSentence, 'Jones left.']);
        expect(segmentCaseNeutrally(lowerCase)).toEqual([
          firstSentence.toLowerCase(),
          'jones left.',
        ]);
      },
    );

    test.each([
      ['We chose option A. Next step.', ['We chose option A.', 'Next step.']],
      ['We chose option A. 10 people agreed.', ['We chose option A.', '10 people agreed.']],
    ])('splits the ambiguous initial in %j', (input, expected) => {
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['10', '(10)', '#10'])(
      'retains the page-number continuation %s case-neutrally',
      (continuation) => {
        const input = `Please turn to P. ${continuation} for details.`;
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      },
    );

    test('retains an unterminated page number case-neutrally', () => {
      expect(segmentCaseNeutrally('Please turn to P. 10')).toEqual(['Please turn to P. 10']);
    });

    test.each(['$10', '-10', '"10"', '10abc', '(10)abc'])(
      'should not treat %s as a page number',
      (continuation) => {
        expect(segmentCaseNeutrally(`First P. ${continuation} follows.`)).toEqual([
          'First P.',
          `${continuation} follows.`,
        ]);
      },
    );

    test('should split end-of-sentence question marks', () => {
      expect(ss('What is your name? My name is Jonas.')).toEqual([
        'What is your name?',
        'My name is Jonas.',
      ]);
    });

    test('should split end-of-sentence exclamation marks', () => {
      expect(ss('There it is! I found it.')).toEqual(['There it is!', 'I found it.']);
    });

    test('should not split singleton uppercase abbreviations', () => {
      expect(ss('My name is Jonas E. Smith.')).toEqual(['My name is Jonas E. Smith.']);
    });

    test('should not split singleton lowercase abbreviations', () => {
      expect(ss('Please turn to p. 55.')).toEqual(['Please turn to p. 55.']);
    });

    test('should not split two letter lowercase abbreviations in the middle of a sentence', () => {
      expect(ss('Were Jane and co. at the party?')).toEqual(['Were Jane and co. at the party?']);
    });

    test('should not split two letter uppercase abbreviations in the middle of a sentence', () => {
      expect(ss('They closed the deal with Pitt, Briggs & Co. at noon.')).toEqual([
        'They closed the deal with Pitt, Briggs & Co. at noon.',
      ]);
    });

    test('should split two letter lowercase abbreviations at the end of a sentence', () => {
      expect(ss("Let's ask Jane and co. They should know.")).toEqual([
        "Let's ask Jane and co.",
        'They should know.',
      ]);
    });

    test.each(['\n', '\r\n', '\r'])(
      'keeps a terminal abbreviation boundary across %j',
      (lineBreak) => {
        const input = `Use etc.${lineBreak}Next sentence.`;
        expect(ss(input)).toEqual(['Use etc.', 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual(['Use etc.', 'Next sentence.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(['use etc.', 'next sentence.']);
      },
    );

    test.each(['\t', '\u00a0'])(
      'normalizes horizontal whitespace after abbreviations: %j',
      (separator) => {
        expect(ss(`We use etc.${separator}and more.`)).toEqual(['We use etc. and more.']);
        expect(ss(`Dr.${separator}Jones arrived.`)).toEqual(['Dr. Jones arrived.']);
      },
    );

    test.each(['\n', '\r\n', '\r'])(
      'preserves wrapped honorifics and abbreviation exceptions across %j',
      (lineBreak) => {
        expect(ss(`Dr.${lineBreak}Jones arrived.`)).toEqual(['Dr. Jones arrived.']);
        expect(ss(`Use e.g.${lineBreak}Examples.`)).toEqual(['Use e.g. Examples.']);
      },
    );

    test.each(['"Next sentence."', '(Next sentence.)', '[Next sentence.]'])(
      'recognizes opening punctuation after a wrapped abbreviation: %s',
      (nextSentence) => {
        expect(ss(`Use etc.\n${nextSentence}`)).toEqual(['Use etc.', nextSentence]);
      },
    );

    test.each([
      "He described 'the students' Acme Co.\nInternational project' today.",
      "He described 'the students' favorite Acme Co.\nInternational project' today.",
      "He called it 'Success' Before we use etc.\nNext sentence.",
      "He called it 'Success' before we use etc.\nNext sentence.",
    ])('keeps possessive quote state invariant under case folding: %s', (input) => {
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        segmentCaseNeutrally(input).map((sentence) => sentence.toLowerCase()),
      );
      for (const score of [rouge.n, rouge.s, rouge.l]) {
        expect(score(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
      }
    });

    test.each(['Jan.', 'Calif.', 'P.M.', 'E.g.', 'Latest 3.5 Co.', 'Rd.'])(
      'keeps protected periods inside possessive quotes: %s',
      (abbreviation) => {
        const input = `She reviewed 'the students' ${abbreviation}\nInternational report' today.`;
        const expected = `She reviewed 'the students' ${abbreviation} International report' today.`;
        expect(ss(input)).toEqual([expected]);
        expect(segmentCaseNeutrally(input)).toEqual([expected]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([expected.toLowerCase()]);
      },
    );

    test.each([' ', '\u0085'])('keeps neutral possessives open with whitespace %j', (separator) => {
      expect(
        segmentCaseNeutrally(
          "He described 'the students' Acme Co.\nInternational project' today.".replaceAll(
            ' ',
            separator,
          ),
        ),
      ).toHaveLength(1);
      expect(
        segmentCaseNeutrally("He called it 'Success' before we use etc.\nNext sentence."),
      ).toHaveLength(2);
    });

    test.each([
      "The label 'Success' appears in the report etc.\nNext sentence.",
      "The label 'Success' appears in the report etc.\nThe students' work continues.",
      "The label 'Success' appears in Calif.\nThe students' work continues.",
      "The label 'Success' appeared in Jan.\nThe students' work continues.",
      "He called it 'Success' before the researchers' Co.\nNext sentence.",
      "The label 'Happy days' appears in the report etc.\nNext sentence.",
      "The label 'Success' appears beside 'Failure' in the report etc.\nNext sentence.",
      "The label 'Success' doesn't appear in the report etc.\nNext sentence.",
    ])('closes a quote before an ordinary continuation: %s', (input) => {
      const expected = input.split('\n');
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test('closes single-quoted words ending in s', () => {
      expect(ss("He called it 'Success' before we use etc.\nNext sentence.")).toEqual([
        "He called it 'Success' before we use etc.",
        'Next sentence.',
      ]);
    });

    test.each(['?', '!'])(
      'keeps URL punctuation %s inside a possessive quotation',
      (punctuation) => {
        const input = `She reviewed 'the students' Online https://example.com${punctuation}Next=value Acme Co.\nInternational report' today.`;
        const expected = [input.replaceAll('\n', ' ')];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test('classifies consecutive possessives in a single pass', () => {
      const input = `She reviewed 'the ${"students' ".repeat(10_000)}Acme Co.\nInternational project' today.`;
      expect(segmentCaseNeutrally(input)).toEqual([input.replaceAll('\n', ' ')]);
    });

    test('classifies a million possessives within a small heap', () => {
      expectBundledScriptToPass(
        `
          const input = "A '" + "s' ".repeat(1050000) + "x'.";
          const sentences = module.exports.sentenceSegment(input, { caseNeutral: true });
          if (sentences.length !== 1 || sentences[0] !== input) {
            throw new Error('Possessive segmentation changed');
          }
          process.stdout.write('ok');
        `,
        15_000,
        ['--max-old-space-size=64'],
      );
    }, 20_000);

    test('uses conservative quote pairing when both closing candidates end in s', () => {
      const input = "She reviewed 'the students' Acme Co.\nInternational Success' today.";
      const expected = ["She reviewed 'the students' Acme Co.", "International Success' today."];
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
      for (const score of [rouge.n, rouge.s, rouge.l]) {
        expect(score(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
      }
    });

    test.each(['...', '. . .'])(
      'preserves possessives across protected ellipses: %s',
      (ellipsis) => {
        const input = `She reviewed 'the students' Acme${ellipsis} Holdings Co.\nInternational report' today.`;
        const expected = [input.replaceAll('\n', ' ')];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test('closes single-quoted spans after their opening fragment', () => {
      expect(
        ss("We invested in 'Acme Co.\nInternational Holdings' before we use etc.\nNext sentence."),
      ).toEqual([
        "We invested in 'Acme Co. International Holdings' before we use etc.",
        'Next sentence.',
      ]);
    });

    test('does not treat comparison operators as opening delimiters', () => {
      expect(ss('The result was x < 5 and we use etc.\nNext sentence.')).toEqual([
        'The result was x < 5 and we use etc.',
        'Next sentence.',
      ]);
    });

    test.each(['\n', '\r\n', '\r'])(
      'does not split abbreviations inside wrapped parentheses across %j',
      (lineBreak) => {
        const input = `We invested in (Acme Co.${lineBreak}International Holdings) today.`;
        expect(ss(input)).toEqual(['We invested in (Acme Co. International Holdings) today.']);
        expect(segmentCaseNeutrally(input)).toEqual([
          'We invested in (Acme Co. International Holdings) today.',
        ]);
      },
    );

    test('keeps wrapped place abbreviations invariant under case folding', () => {
      const input = 'He moved to Calif.\nNext year.';
      expect(segmentCaseNeutrally(input)).toEqual(['He moved to Calif.', 'Next year.']);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
        'he moved to calif.',
        'next year.',
      ]);
      expect(segmentCaseNeutrally(input)).toEqual(
        segmentCaseNeutrally(input.replaceAll('\n', ' ')),
      );
    });

    test.each(['\n', '\r\n', '\r'])(
      'does not split abbreviations inside wrapped single quotes across %j',
      (lineBreak) => {
        const input = `We invested in 'Acme Co.${lineBreak}International Holdings' today.`;
        expect(ss(input)).toEqual(["We invested in 'Acme Co. International Holdings' today."]);
      },
    );

    test.each([
      [
        "We invested—'Acme Co.\nInternational Holdings'—today.",
        "We invested—'Acme Co. International Holdings'—today.",
      ],
      [
        "He described 'the students' Acme Co.\nInternational project' today.",
        "He described 'the students' Acme Co. International project' today.",
      ],
      [
        "He described 'the students' favorite Acme Co.\nInternational project' today.",
        "He described 'the students' favorite Acme Co. International project' today.",
      ],
      [
        'We invested in (score > 5, Acme Co.\nInternational Holdings) today.',
        'We invested in (score > 5, Acme Co. International Holdings) today.',
      ],
      [
        'We noted (the symbol ")" then Acme Co.\nInternational Holdings) today.',
        'We noted (the symbol ")" then Acme Co. International Holdings) today.',
      ],
    ])('keeps wrapped abbreviations inside punctuation-aware delimiters: %s', (input, expected) => {
      expect(ss(input)).toEqual([expected]);
    });

    test('should split two letter uppercase abbreviations at the end of a sentence', () => {
      expect(ss('They closed the deal with Pitt, Briggs & Co. It closed yesterday.')).toEqual([
        'They closed the deal with Pitt, Briggs & Co.',
        'It closed yesterday.',
      ]);
    });

    test('should not split two letter (prepositive) abbreviations', () => {
      expect(ss('I can see Mt. Fuji from here.')).toEqual(['I can see Mt. Fuji from here.']);
    });

    test('should not split two letter (prepositive & postpositive) abbreviations', () => {
      expect(ss("St. Michael's Church is on 5th st. near the light.")).toEqual([
        "St. Michael's Church is on 5th st. near the light.",
      ]);
    });

    test('should not split possessive two letter abbreviations', () => {
      expect(ss("That is JFK Jr.'s book.")).toEqual(["That is JFK Jr.'s book."]);
    });

    test('should not split multi-period abbreviations in the middle of a sentence', () => {
      expect(ss('I visited the U.S.A. last year.')).toEqual(['I visited the U.S.A. last year.']);
    });

    test('should not split multi-period abbreviations at the end of a sentence', () => {
      expect(ss('I live in the E.U. How about you?')).toEqual([
        'I live in the E.U.',
        'How about you?',
      ]);
    });

    test('should split U.S. as sentence boundary', () => {
      expect(ss('I live in the U.S. How about you?')).toEqual([
        'I live in the U.S.',
        'How about you?',
      ]);
      expect(ss('(I live in the U.S.) How about you?')).toEqual([
        '(I live in the U.S.)',
        'How about you?',
      ]);
    });

    test.each(geographicAcronyms)('allows a proper name after %s', (acronym) => {
      const first = `I live in the ${acronym}`;
      const second = 'Alice lives in Canada.';
      expect(ss(`${first} ${second}`)).toEqual([first, second]);
    });

    test('should not split U.S. as non-sentence boundary', () => {
      expect(ss('I have lived in the U.S. for 20 years.')).toEqual([
        'I have lived in the U.S. for 20 years.',
      ]);
    });

    test.each([
      'U.S. Government',
      'The U.S. Government policy.',
      'E.U. Commission',
      'U.S.A. Today',
    ])('preserves acronym tokens across boundaries in %s', (input) => {
      expect(ss(input).flatMap(rouge.treeBankTokenize)).toEqual(rouge.treeBankTokenize(input));
    });

    const abbreviatedNames = ['Mt. Fuji', 'The (U.S.) Government issued a statement.'];
    test.each(abbreviatedNames)('keeps abbreviated names in %s', (input) => {
      expect(ss(input)).toEqual([input]);
    });

    test('should not split numbers as a non-sentence boundary', () => {
      expect(ss('She has $100.00 in her bag.')).toEqual(['She has $100.00 in her bag.']);
    });

    test('should split numbers as a sentence boundary', () => {
      expect(ss('She has $100.00. It is in her bag.')).toEqual([
        'She has $100.00.',
        'It is in her bag.',
      ]);
    });

    test('should not split parenthetical inside sentence', () => {
      expect(
        ss(
          'He teaches science (He previously worked for 5 years as an engineer.) at the local University.',
        ),
      ).toEqual([
        'He teaches science (He previously worked for 5 years as an engineer.) at the local University.',
      ]);
    });

    test('should split email addresses as a sentence boundary', () => {
      expect(ss('Her email is Jane.Doe@example.com. I sent her an email.')).toEqual([
        'Her email is Jane.Doe@example.com.',
        'I sent her an email.',
      ]);
    });

    test('should split web addresses as a sentence boundary', () => {
      expect(
        ss(
          'The site is: https://www.example.50.com/new-site/awesome_content.html. Please check it out.',
        ),
      ).toEqual([
        'The site is: https://www.example.50.com/new-site/awesome_content.html.',
        'Please check it out.',
      ]);
    });

    test('should not split single quotations inside sentence', () => {
      expect(ss("She turned to him, 'This is great.' she said.")).toEqual([
        "She turned to him, 'This is great.' she said.",
      ]);
    });

    test('should keep closing double quotes with their sentence', () => {
      expect(ss('He said... "what?" Next.')).toEqual(['He said... "what?"', 'Next.']);
      expect(ss('He said "hello." Then left.')).toEqual(['He said "hello."', 'Then left.']);
      expect(ss('"Hello!" "Goodbye!"')).toEqual(['"Hello!"', '"Goodbye!"']);
      expect(ss('(Stop.) "Next."')).toEqual(['(Stop.)', '"Next."']);
      expect(ss('He moved to the "U.S." How about you?')).toEqual([
        'He moved to the "U.S."',
        'How about you?',
      ]);
      expect(ss('(He said "Stop.") Next came rain.')).toEqual([
        '(He said "Stop.")',
        'Next came rain.',
      ]);
    });

    test.each([
      ['He said "Stop." 123 starts here.', ['He said "Stop."', '123 starts here.']],
      ['He said "Stop!" 123 starts here.', ['He said "Stop!"', '123 starts here.']],
      ['He said "Stop?" 123 starts here.', ['He said "Stop?"', '123 starts here.']],
      ['He said "Stop." 3.14 was measured.', ['He said "Stop."', '3.14 was measured.']],
      ['"Stop." ١٢٣ starts here.', ['"Stop."', '١٢٣ starts here.']],
      ['(Stop!) 123 starts here.', ['(Stop!)', '123 starts here.']],
    ])('should split numeric sentence starts after closing delimiters in %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    const sentenceContinuations = [
      'Use "e.g." here.',
      '"Dr." is a title.',
      '"U.S." is an abbreviation.',
      'She wrote "etc.", then left.',
      'She wrote "etc." , then left.',
      'She wrote "etc."; then left.',
      'She wrote "etc.": more would follow.',
      'She wrote "hello." then left.',
      'She repeated "Stop." 3 times.',
      'She repeated "Stop." 3 TIMES.',
      'She watched "Monsters, Inc." 3 times.',
      'She worked at "Acme Inc." 3 days a week.',
      'She mentioned "U.S." 2 years ago.',
      'She quoted "No." 100% correctly.',
      'The label was "Hello!" 100 times larger.',
      'The result was (surprisingly!) 100% accurate.',
      'The result was (surprisingly!) -- completely accurate.',
      'The result was (surprisingly!) $100.',
      'The winner was (surprisingly!) Alice Smith.',
      'The winner was (Surprisingly!) Alice Smith.',
      'The winner was ((surprisingly!)) Alice Smith.',
      'The winner was (she said "Wow!") Alice Smith.',
    ];
    test.each(sentenceContinuations)('keeps continuations in %s', (input) => {
      expect(ss(input)).toEqual([input]);
    });

    test.each(bracketPairs)('keeps closing %s%s with its sentence', (open, close) => {
      const sentence = `${open}Nobody noticed.${close}`;
      const spaced = `${open} Nobody noticed. ${close}`;
      expect(ss(`${sentence} Next came rain.`)).toEqual([sentence, 'Next came rain.']);
      expect(ss(`${spaced} Next came rain.`)).toEqual([spaced, 'Next came rain.']);
      expect(ss(`${sentence} then left.`)).toEqual([`${sentence} then left.`]);
      expect(ss(`${spaced} then left.`)).toEqual([`${spaced} then left.`]);
      const nested = `He said "${open}Stop. ${close} "`;
      expect(ss(`${nested} Next.`)).toEqual([nested, 'Next.']);
    });

    test('should split double exclamation points', () => {
      expect(ss('Hello!! Long time no see.')).toEqual(['Hello!!', 'Long time no see.']);
    });

    test('should split double question marks', () => {
      expect(ss('Hello?? Who is there?')).toEqual(['Hello??', 'Who is there?']);
    });

    test('should split double punctuation (exclamation point + question mark)', () => {
      expect(ss('Hello!? Is that you?')).toEqual(['Hello!?', 'Is that you?']);
    });

    test('should split double punctuation (question mark + exclamation point)', () => {
      expect(ss('Hello?! Is that you?')).toEqual(['Hello?!', 'Is that you?']);
    });

    test('should not split errant newlines in the middle of sentences (PDF)', () => {
      expect(ss('This is a sentence\ncut off in the middle because pdf.')).toEqual([
        'This is a sentence cut off in the middle because pdf.',
      ]);
    });

    test('should not split errant newlines in the middle of sentences', () => {
      expect(ss('It was a cold \nnight in the city.')).toEqual([
        'It was a cold night in the city.',
      ]);
    });

    test('should split lower case list separated by newline', () => {
      expect(ss('features\ncontact manager\nevents, activities\n')).toEqual([
        'features',
        'contact manager',
        'events, activities',
      ]);
    });

    const lineBreaks = ['\n', '\r\n', '\r'];
    test.each(lineBreaks)('should split sentences across %j', (lineBreak) => {
      expect(ss(`Alpha.${lineBreak}Beta.${lineBreak}Gamma.`)).toEqual([
        'Alpha.',
        'Beta.',
        'Gamma.',
      ]);
    });

    test.each(lineBreaks)('should split lists across %j', (lineBreak) => {
      expect(ss(`alpha${lineBreak}beta${lineBreak}gamma`)).toEqual(['alpha', 'beta', 'gamma']);
    });

    test.each(lineBreaks)('should join every sentence wrap across %j', (lineBreak) => {
      expect(ss(`The quick${lineBreak}brown${lineBreak}fox jumps.`)).toEqual([
        'The quick brown fox jumps.',
      ]);
    });

    test('should ignore blank separator chunks', () => {
      expect(ss('\nAlpha.\r\n \t\nBeta.\n')).toEqual(['Alpha.', 'Beta.']);
      expect(ss('alpha\n\n \n beta\n')).toEqual(['alpha', 'beta']);
    });

    test('should preserve text before an unterminated final fragment', () => {
      expect(ss('We chose option A. Next step')).toEqual(['We chose option A.', 'Next step']);
      expect(ss('Use Plan A. Next step')).toEqual(['Use Plan A.', 'Next step']);
      expect(ss('We visited D.C. Today')).toEqual(['We visited D.C.', 'Today']);
    });

    test.each(lineBreaks)('should join line-wrapped name initials across %j', (lineBreak) => {
      expect(ss(`Did you see Albert I.${lineBreak}Jones yesterday?`)).toEqual([
        'Did you see Albert I. Jones yesterday?',
      ]);
    });

    test.each(lineBreaks)('should consume wrapped name fragments once across %j', (lineBreak) => {
      expect(ss(`I met${lineBreak}Albert\tI.${lineBreak}Jones at${lineBreak}Acme.`)).toEqual([
        'I met Albert I. Jones at Acme.',
      ]);
      expect(ss(`I met${lineBreak}Albert\tI.${lineBreak}van der${lineBreak}Meer.`)).toEqual([
        'I met Albert I. van der Meer.',
      ]);
    });

    test('should handle a standalone initialism', () => {
      expect(ss('D.C. Next.')).toEqual(['D.C.', 'Next.']);
    });

    test('should match abbreviation punctuation literally', () => {
      expect(ss('I ate an egg. Tomorrow is Monday.')).toEqual([
        'I ate an egg.',
        'Tomorrow is Monday.',
      ]);
      expect(ss('She ate ice. We left.')).toEqual(['She ate ice.', 'We left.']);
      expect(ss('Use e.g. Examples.')).toEqual(['Use e.g. Examples.']);
      expect(ss('That is i.e. An example.')).toEqual(['That is i.e. An example.']);
    });

    test('should split geo-coordinate as a sentence boundary', () => {
      expect(ss('You can find it at N°. 1026.253.553. That is where the treasure is.')).toEqual([
        'You can find it at N°. 1026.253.553.',
        'That is where the treasure is.',
      ]);
    });

    test('should not split named entities with an exclamation point', () => {
      expect(ss('She works at Yahoo! in the accounting department.')).toEqual([
        'She works at Yahoo! in the accounting department.',
      ]);
    });

    test('should correctly handle I as a sentence boundary and I as an abbreviation', () => {
      expect(ss('We make a good team, you and I. Did you see Albert I. Jones yesterday?')).toEqual([
        'We make a good team, you and I.',
        'Did you see Albert I. Jones yesterday?',
      ]);
    });

    test('should not split ellipsis at end of quotation', () => {
      expect(
        ss(
          'Thoreau argues that by simplifying one\'s life, "the laws of the universe will appear less complex...."',
        ),
      ).toEqual([
        'Thoreau argues that by simplifying one\'s life, "the laws of the universe will appear less complex...."',
      ]);
    });

    test('should not split ellipsis with square brackets', () => {
      expect(ss('"Bohr [...] used the analogy of parallel stairways [...]" (Smith 55).')).toEqual([
        '"Bohr [...] used the analogy of parallel stairways [...]" (Smith 55).',
      ]);
    });

    test.each(['5 stars', '2 days', '3 weeks', '10 months', '20 points'])(
      'keeps numeric quote continuations together: %s',
      (quantity) => {
        const input = `She rated "Wow!" ${quantity}.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      },
    );

    test('retains genuine numeric sentence boundaries after quotes', () => {
      expect(ss('"Stop." 123 starts here.')).toEqual(['"Stop."', '123 starts here.']);
      expect(ss('She said "Stop." 2 days passed.')).toEqual(['She said "Stop."', '2 days passed.']);
      expect(ss('She said "Stop." 5 stars appeared.')).toEqual([
        'She said "Stop."',
        '5 stars appeared.',
      ]);
    });

    test('recognizes Treebank closing quotes after bracketed sentences', () => {
      expect(ss("He said ``(Stop.)'' Next.")).toEqual(["He said ``(Stop.)''", 'Next.']);
      expect(ss("He said ''(Stop.)'' Next.")).toEqual(["He said ''(Stop.)''", 'Next.']);
    });

    // ReDoS regression tests - ensure pathological inputs complete quickly
    // Using 500ms threshold to account for CI environment variability
    describe('ReDoS prevention', () => {
      const TIMEOUT_MS = 500;

      test('segments large spaced-ellipsis runs within a constrained heap', () => {
        expectBundledScriptToPass(
          `
            const summary = '. '.repeat(600000) + '.';
            const sentences = module.exports.sentenceSegment(summary);
            if (sentences.length !== 1 || sentences[0] !== summary) {
              throw new Error('Spaced-ellipsis content changed');
            }
            process.stdout.write('ok');
          `,
          15_000,
          ['--max-old-space-size=64'],
        );
      }, 20_000);

      test('streams large list-marker runs within a constrained heap', () => {
        expectBundledScriptToPass(
          `
            const summary = '1. Item '.repeat(400000);
            const sentences = module.exports.sentenceSegment(summary);
            if (sentences.length !== 400000 || sentences[0] !== '1. Item') {
              throw new Error('List-marker segmentation changed');
            }
            process.stdout.write('ok');
          `,
          20_000,
          ['--max-old-space-size=64'],
        );
      }, 25_000);

      test('should segment abbreviation chains within a small heap', () => {
        expectBundledScriptToPass(
          `
          for (const [fragment, normalized] of [['Dr. ', 'Dr. '], ['e.g. ', 'e.g. '], ['Dr.\\n', 'Dr. ']]) {
            const summary = fragment.repeat(5000) + 'End.';
            const sentences = module.exports.sentenceSegment(summary);
            if (sentences.length !== 1 || sentences[0] !== normalized.repeat(5000) + 'End.') {
              throw new Error('Sentence content changed');
            }
            if (module.exports.l(summary, 'unmatched') !== 0) {
              throw new Error('Unexpected ROUGE-L match');
            }
          }
          process.stdout.write('ok');
        `,
          15_000,
          ['--max-old-space-size=64'],
        );
      });

      test('tracks enclosing delimiters without rescanning wrapped abbreviation chains', () => {
        expectBundledScriptToPass(
          `
            const content = Array.from({ length: 4000 }, (_, index) => 'A' + index + ' etc.\\n').join('');
            const summary = 'Intro (' + content + 'Tail) done.';
            const sentences = module.exports.sentenceSegment(summary);
            if (sentences.length !== 1 || !sentences[0].endsWith('Tail) done.')) {
              throw new Error('Wrapped abbreviation segmentation changed');
            }
            process.stdout.write('ok');
          `,
          3000,
          ['--max-old-space-size=64'],
        );
      }, 10_000);

      test('should handle long strings without sentence terminators quickly', () => {
        const input = 'a'.repeat(64_000);
        const start = Date.now();
        const sentences = ss(input);
        const elapsed = Date.now() - start;
        expect(sentences).toEqual([input]);
        expect(elapsed).toBeLessThan(TIMEOUT_MS);
      });

      test('should trim long chunks without rescanning internal spaces', () => {
        const input = `prefix${' '.repeat(64_000)}suffix.`;
        const start = Date.now();
        const sentences = ss(`  ${input}  `);
        const elapsed = Date.now() - start;
        expect(sentences).toEqual([input]);
        expect(elapsed).toBeLessThan(TIMEOUT_MS);
      });

      test('should handle many dots quickly', () => {
        const input = '.'.repeat(10_000);
        const start = Date.now();
        ss(input);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(TIMEOUT_MS);
      });

      test('should handle repeated patterns quickly', () => {
        const input = 'word. '.repeat(1000);
        const start = Date.now();
        ss(input);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(TIMEOUT_MS);
      });

      test('should handle long string with many spaces quickly', () => {
        const input = `${' '.repeat(10_000)}text. more text.`;
        const start = Date.now();
        ss(input);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(TIMEOUT_MS);
      });

      test('should handle many consecutive exclamation marks quickly', () => {
        // Specifically tests CodeQL alert #1 scenario
        const input = `${'!'.repeat(10_000)}`;
        const start = Date.now();
        ss(input);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(TIMEOUT_MS);
      });

      test('should handle mixed punctuation repetitions quickly', () => {
        const input = `${'!?'.repeat(5000)}`;
        const start = Date.now();
        ss(input);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(TIMEOUT_MS);
      });
    });

    // Additional edge case tests for branch coverage
    describe('edge cases', () => {
      test('should handle input with no sentence terminators', () => {
        expect(ss('just some text without any ending')).toEqual([
          'just some text without any ending',
        ]);
      });

      test('should retain unmatched fragments around line breaks', () => {
        expect(ss('intro\nAlpha. Beta.\ntail')).toEqual(['intro', 'Alpha.', 'Beta.', 'tail']);
      });

      test('should handle whitespace-only input', () => {
        // Whitespace gets trimmed to empty string, so no chunks are added to acc
        // Preserve the single-sentence fallback for whitespace-only input.
        expect(ss('   ')).toEqual(['   ']);
        expect(ss('\t\t')).toEqual(['\t\t']);
        expect(ss('\r\n')).toEqual(['\r\n']);
      });

      test('should handle abbreviation followed by lowercase text', () => {
        // Uses 'etc.' which is in ABBR_COMMON
        expect(ss('There are cats, dogs, etc. and more animals.')).toEqual([
          'There are cats, dogs, etc. and more animals.',
        ]);
      });

      test('should handle single letter abbreviation at sentence boundary', () => {
        expect(ss('Please see p. 10 for details.')).toEqual(['Please see p. 10 for details.']);
      });

      test('should handle mid-sentence ellipsis', () => {
        expect(ss('He said.. and then continued.')).toEqual(['He said.. and then continued.']);
        expect(ss('Wait... what?')).toEqual(['Wait... what?']);
        expect(ss('Wait...  what?')).toEqual(['Wait... what?']);
        expect(ss('Wait...\twhat?')).toEqual(['Wait...\twhat?']);
        expect(ss('Wait...what?')).toEqual(['Wait...what?']);
      });

      test.each(lineBreaks)('joins wrapped ellipses across %j', (lineBreak) => {
        expect(ss(`Wait...${lineBreak}what?`)).toEqual(['Wait... what?']);
        expect(ss(`Wait...${lineBreak}what? Next step`)).toEqual(['Wait... what?', 'Next step']);
      });

      test.each(lineBreaks)('keeps wrapped closing quotes (%j)', (lineBreak) => {
        expect(ss(`He said "Stop.${lineBreak}" Next.`)).toEqual(['He said "Stop. "', 'Next.']);
        expect(ss(`He said "Stop.${lineBreak}"`)).toEqual(['He said "Stop. "']);
        expect(ss(`(He said "Stop.${lineBreak}") Next.`)).toEqual(['(He said "Stop. ")', 'Next.']);
      });
    });
  });

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
    test('should return false for lowercase input with interspesed capitals', () => {
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
});

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
    test('should let custom generators define short-token behavior', () => {
      const nGram = jest.fn((): string[] => ['custom gram']);
      expect(n('one', 'one', { n: 2, nGram })).toBe(1);
      expect(nGram.mock.calls).toEqual([
        [['one'], 2],
        [['one'], 2],
      ]);
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

    test('snapshots reusable tokenizer buffers before tokenizing the reference', () => {
      const buffer: string[] = [];
      const tokenizer = (input: string): string[] => {
        buffer.length = 0;
        buffer.push(input);
        return buffer;
      };
      expect(n('candidate', 'reference', { tokenizer })).toBe(0);
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

    test('should correctly compute ROUGE-N score with custom beta', () => {
      // With beta=0, F-score equals precision
      // 3 matching bigrams out of 4 candidate bigrams = 3/4
      expect(n(cand, refs[0], { n: 2, beta: 0 })).toBe(3 / 4);
    });
    test('should return 0 for no matches', () => {
      expect(n(cand, refs[1], { n: 2, beta: 0 })).toBe(0);
    });
  });

  describe('ROUGE-S', () => {
    const { s } = rouge;

    test.each(invalidMaxSkips)('rejects maxSkip=%s before callbacks', (maxSkip) => {
      const skipBigram = jest.fn((): string[] => []);
      expect(() => s('a b', 'c d', { maxSkip, skipBigram })).toThrow(RangeError);
      expect(skipBigram).not.toHaveBeenCalled();
    });

    const ref = 'police killed the gunman';
    const cands = ['police kill the gunman', 'the gunman kill police', 'the gunman police killed'];

    test('should throw RangeError for empty candidate', () => {
      expect(() => s('', ref, undefined as any)).toThrow(RangeError);
    });
    test('should throw RangeError for empty ref', () => {
      expect(() => s(cands[0], '', undefined as any)).toThrow(RangeError);
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
    test('should let custom generators define short-token behavior', () => {
      const skipBigram = jest.fn((): string[] => ['custom gram']);
      expect(s('one', 'one', { skipBigram })).toBe(1);
      expect(skipBigram.mock.calls).toEqual([
        [['one'], Number.POSITIVE_INFINITY],
        [['one'], Number.POSITIVE_INFINITY],
      ]);
    });

    test('should return 0 for summaries with zero overlap', () => {
      expect(s('banana yoghurt', ref, undefined as any)).toBe(0);
    });

    test('should snapshot reusable custom skip-bigram arrays', () => {
      const scratch: string[] = [];
      const skipBigram = (tokens: string[], maxSkip: number): string[] => {
        scratch.splice(0, scratch.length, tokens.slice(0, maxSkip + 1).join(' '));
        return scratch;
      };
      expect(s('alpha one', 'beta two', { maxSkip: 1, skipBigram })).toBe(0);
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

    test('still invokes a custom skip-bigram callback for identical summaries', () => {
      const skipBigram = jest.fn(() => ['custom']);
      expect(s('a b', 'a b', { skipBigram })).toBe(1);
      expect(skipBigram).toHaveBeenCalledTimes(2);
    });

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

  describe('ROUGE-L', () => {
    const { l } = rouge;

    const ref = 'police killed the gunman';
    const cands = ['police kill the gunman', 'the gunman kill police', 'the gunman police killed'];

    test('preserves reordered sentence boundaries across NEL separators', () => {
      expect(l('Alpha.\u0085Beta.', 'Beta.\u0085Alpha.')).toBe(1);
    });

    test('should preserve word separation after an ellipsis for custom tokenizers', () => {
      const tokenizer = (input: string): string[] => input.split(/\s+/);
      expect(l('what?', 'Wait... what?', { tokenizer })).toBeCloseTo(2 / 3);
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
