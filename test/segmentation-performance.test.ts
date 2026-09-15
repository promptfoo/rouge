import * as rouge from '../src/rouge';
import { expectBundledScriptToPass } from './helpers';

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    describe('ReDoS prevention', () => {
      const TIMEOUT_MS = 500;

      test('scans recovered combining-mark prefixes without backtracking', () => {
        const input = `I${'\u0301'.repeat(16_000)}/aaaaaaa.X`;
        const started = Date.now();
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(Date.now() - started).toBeLessThan(TIMEOUT_MS);
      });

      test('scans differently ordered combining marks without quadratic normalization', () => {
        const input = `A${'\u0315\u0316'.repeat(32_000)}.X`;
        const started = Date.now();
        expect(segmentCaseNeutrally(input).join('')).toBe(input);
        expect(Date.now() - started).toBeLessThan(TIMEOUT_MS);
      });

      test('streams repeated marked clusters within a constrained heap', () => {
        expectBundledScriptToPass(
          `
            const summary = 'A\\u0303'.repeat(4_000_000) + '.X';
            const sentences = module.exports.sentenceSegment(summary, { caseNeutral: true });
            if (sentences.join('') !== summary) {
              throw new Error('Marked-cluster content changed');
            }
            process.stdout.write('ok');
          `,
          20_000,
          ['--max-old-space-size=80'],
        );
      }, 25_000);

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
  });
});

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test('classifies a million smart possessives within a small heap', () => {
      expectBundledScriptToPass(
        `
          const input = 'A ‘' + 's’ '.repeat(1050000) + 'x’.';
          const sentences = module.exports.sentenceSegment(input, { caseNeutral: true });
          if (sentences.length !== 1 || sentences[0] !== input) {
            throw new Error('Smart possessive segmentation changed');
          }
          process.stdout.write('ok');
        `,
        15_000,
        ['--max-old-space-size=64'],
      );
    }, 20_000);

    test('scans one long URL punctuation run without repeated suffix lookahead', () => {
      const first = 'She asked “Acme Co.';
      const second = `Which https://example.com/path${'.?!'.repeat(20_000)}query was it?”`;
      expect(ss(`${first}\n${second}`)).toEqual([first, second]);
      expect(segmentCaseNeutrally(`${first}\n${second}`)).toEqual([first, second]);
    }, 5000);

    test('scans a long leading delimiter run once before checking a question starter', () => {
      const first = `${'('.repeat(100_000)}Which ‘Stop.’ did she quote?${')'.repeat(100_000)}`;
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
    }, 5000);

    test('scans a long attached citation when locating a scoped question', () => {
      const first = 'She said “Use etc.';
      const second = `Which answer was ‘What?’${'²'.repeat(20_000)}”`;
      expect(ss(`${first}\n${second}`)).toEqual([first, second]);
      expect(segmentCaseNeutrally(`${first}\n${second}`)).toEqual([first, second]);
    }, 5000);

    test('advances source scopes across repeated paired questions', () => {
      const sentences = ['She asked “Acme Co.', 'Which ‘Stop.’ did she quote?”', 'Next.'];
      const input = `${`${sentences[0]}\n${sentences[1]} ${sentences[2]} `.repeat(3000)}`.trimEnd();
      const expected = Array.from({ length: 3000 }, () => sentences).flat();
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test('reuses scoped lookahead across adjacent quoted questions', () => {
      const sentence = 'Which "what?"';
      const input = `${`${sentence} `.repeat(5000)}`.trimEnd();
      const expected = Array.from({ length: 5000 }, () => sentence);
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test('indexes a long quoted question within a constrained JavaScript heap', () => {
      expectBundledScriptToPass(
        `
          const first = 'She asked “Acme Co.';
          const second = 'Which ‘' + 'word '.repeat(1400000) + 'Stop.’ did she quote?”';
          const input = first + '\\n' + second;
          const sentences = module.exports.sentenceSegment(input, { caseNeutral: true });
          if (sentences.length !== 2 || sentences[0] !== first || sentences[1] !== second) {
            throw new Error('Long scoped question boundaries changed');
          }
          process.stdout.write('ok');
        `,
        15_000,
        ['--max-old-space-size=64'],
      );
    }, 20_000);

    test.each(['https://example.com/', 'http://example.com/', 'WWW.example.com/'])(
      'retains question and URL boundaries beyond a long %s prefix',
      (prefix) => {
        const first = 'She said “Use etc.';
        const question = `Which ${prefix}${'path'.repeat(100)}.part?`;
        const second = `${question}”`;
        const input = `${first}\n${second}`;
        expect(ss(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
        const parenthetical = `He joined “Acme Co.” (It closed.) ${question}`;
        const expected = ['He joined “Acme Co.”', '(It closed.)', question];
        expect(ss(parenthetical)).toEqual(expected);
        expect(segmentCaseNeutrally(parenthetical)).toEqual(expected);
      },
    );

    test('scans many URL path periods once while finding a question terminal', () => {
      const first = 'She said “Use etc.';
      const second = `Which https://example.com/${'path.'.repeat(20_000)}part?”`;
      const input = `${first}\n${second}`;
      expect(ss(input)).toEqual([first, second]);
      expect(segmentCaseNeutrally(input)).toEqual([first, second]);
    }, 5000);

    test('shares source question lookahead across repeated parenthetical candidates', () => {
      const input = `${'“Acme Co.” (Mr.) Whose Mr. '.repeat(5000)}?`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    }, 5000);

    test('advances cached source terminals after separate parenthetical questions', () => {
      const sentences = ['He joined “Acme Co.”', '(It closed.)', 'Which Mr. Smith?'];
      const input = `${`${sentences.join(' ')} `.repeat(1000)}`.trimEnd();
      const expected = Array.from({ length: 1000 }, () => sentences).flat();
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test('reuses question terminals across many provisional abbreviation chunks', () => {
      const first = 'She asked “Acme Co.';
      const second = 'Which Mr. Smith?”';
      const count = 5000;
      const input = `${`${first}\n${second} `.repeat(count)}`.trimEnd();
      const expected = Array.from({ length: count }, () => [first, second]).flat();
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test('shares spaced-ellipsis protection across many cached question ranges', () => {
      const first = 'She said “Use etc.';
      const second = 'Which one . . .?”';
      const input = `${`${first}\n${second} `.repeat(5000)}`.trimEnd();
      const expected = Array.from({ length: 5000 }, () => [first, second]).flat();
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test('scans a long numeric citation once before the next smart quotation', () => {
      const first = `‘U.S.’${'²'.repeat(20_000)}`;
      const second = '‘Next.’';
      expect(ss(first + second)).toEqual([first, second]);
      expect(segmentCaseNeutrally(first + second)).toEqual([first, second]);
    }, 5000);
  });
});
