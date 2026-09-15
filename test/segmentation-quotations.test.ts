import * as rouge from '../src/rouge';
import { bracketPairs, expectBundledScriptToPass } from './helpers';

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test.each([
      'The Giants vs. the Tigers won.',
      'The Giants vs. Tigers won.',
      'The Giants VS. Tigers won.',
      'The Giants vs. Boston Celtics, which was televised.',
      'Android vs. Windows is common.',
    ])('keeps the standard versus abbreviation inside %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test('preserves independent sentences after a terminal versus abbreviation', () => {
      const input = 'The standard abbreviation is vs. Today we compare, the full word is clearer.';
      const expected = [
        'The standard abbreviation is vs.',
        'Today we compare, the full word is clearer.',
      ];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['Tomorrow is clearer.', 'Alice explained the term.'])(
      'preserves ordinary sentence starts after a terminal versus abbreviation: %s',
      (continuation) => {
        const input = `The standard abbreviation is vs. ${continuation}`;
        const expected = ['The standard abbreviation is vs.', continuation];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each(['"This is clearer."', '(This is clearer.)'])(
      'preserves delimited sentences after a terminal versus abbreviation: %s',
      (continuation) => {
        const first = 'The abbreviation is vs.';
        expect(ss(`${first} ${continuation}`)).toEqual([first, continuation]);
        expect(segmentCaseNeutrally(`${first} ${continuation}`)).toEqual([first, continuation]);
      },
    );

    test.each(['\n\n', '\r\n\r\n', '\r\r', '\n            \n'])(
      'preserves paragraph boundaries after versus across %j',
      (separator) => {
        const first = 'The Giants vs.';
        const next = 'Boston Celtics, which was televised.';
        expect(ss(`${first}${separator}${next}`)).toEqual([first, next]);
        expect(segmentCaseNeutrally(`${first}${separator}${next}`)).toEqual([first, next]);
      },
    );

    test.each(['vs.', 'v.s.'])(
      'preserves wrapped lowercase comparisons with %s',
      (abbreviation) => {
        for (const separator of ['\n', '\r\n', '\r']) {
          const first = `android ${abbreviation}`;
          const next = 'Windows is common.';
          for (const segment of [ss, segmentCaseNeutrally]) {
            expect(segment(`${first}${separator}${next}`)).toEqual([`${first} ${next}`]);
            expect(segment(`${first}${separator}${separator}${next}`)).toEqual([first, next]);
          }
        }
        for (const segment of [ss, segmentCaseNeutrally]) {
          expect(segment(`Intro line\nThe Giants ${abbreviation}\n\nBoston Celtics won.`)).toEqual([
            `Intro line The Giants ${abbreviation}`,
            'Boston Celtics won.',
          ]);
        }
      },
    );

    test.each(['vs', 'v.s.'])(
      'keeps question and exclamation terminals after %s distinct from abbreviation periods',
      (abbreviation) => {
        for (const terminal of ['?', '!']) {
          const first = `He asked "${abbreviation}${terminal}"`;
          for (const next of ['Alice replied.', '123 people replied.', 'Alice returned.']) {
            for (const segment of [ss, segmentCaseNeutrally]) {
              expect(segment(`${first} ${next}`)).toEqual(
                next === 'Alice replied.' ? [`${first} ${next}`] : [first, next],
              );
            }
          }
        }
      },
    );

    test('releases legacy dotted versus question and exclamation suffixes', () => {
      for (const terminal of ['?', '!']) {
        const first = `He asked "v.s${terminal}"`;
        for (const next of ['Alice replied.', 'Alice returned.', '123 people replied.']) {
          for (const segment of [ss, segmentCaseNeutrally]) {
            expect(segment(`${first} ${next}`)).toEqual(
              next === 'Alice replied.' ? [`${first} ${next}`] : [first, next],
            );
          }
        }
      }
    });

    test.each(['Senate', 'Commission', 'Government'])(
      'preserves wrapped geographic continuation %s after non-titlecase starts',
      (continuation) => {
        for (const prefix of ['2026', 'recent']) {
          const first = `${prefix} U.S.`;
          const next = `${continuation} elections begin.`;
          for (const separator of ['\n', '\r\n', '\r']) {
            for (const segment of [ss, segmentCaseNeutrally]) {
              expect(segment(`${first}${separator}${next}`)).toEqual([`${first} ${next}`]);
              expect(segment(`${first}${separator}${separator}${next}`)).toEqual([first, next]);
            }
          }
        }
      },
    );

    test('retains parenthetical company-name continuations', () => {
      const input = 'We invested in Acme Co. (International Holdings) last year.';
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each([' ', '\n\n', ''])(
      'preserves a completed quotation containing versus before %j',
      (separator) => {
        const first = 'He wrote "vs."';
        const next = 'Alice explained the term.';
        expect(ss(`${first}${separator}${next}`)).toEqual([first, next]);
        expect(segmentCaseNeutrally(`${first}${separator}${next}`)).toEqual([first, next]);
      },
    );

    test('preserves terminal versus in an ASCII single quotation', () => {
      const first = "He wrote 'vs.'";
      const next = 'Alice explained the term.';
      for (const separator of [' ', '\n\n']) {
        expect(ss(`${first}${separator}${next}`)).toEqual([first, next]);
        expect(segmentCaseNeutrally(`${first}${separator}${next}`)).toEqual([first, next]);
      }
    });

    test.each(['vs.', 'v.s.'])(
      'preserves numeric sentence starts after a completed %s quotation',
      (abbreviation) => {
        for (const quote of ['"', "'"]) {
          const first = `He wrote ${quote}${abbreviation}${quote}`;
          const next = '123 started.';
          for (const segment of [ss, segmentCaseNeutrally]) {
            for (const separator of [' ', '\n\n']) {
              expect(segment(`${first}${separator}${next}`)).toEqual([first, next]);
            }
            expect(segment(`${first} 2 days passed.`)).toEqual([first, '2 days passed.']);
            for (const continuation of ['100 times correctly.', '100% correctly.']) {
              const input = `${first} ${continuation}`;
              expect(segment(input)).toEqual([input]);
            }
          }
        }
      },
    );

    test('preserves pronoun sentence starts that share spelling with acronyms', () => {
      const first = 'The abbreviation vs.';
      const next = 'It is clearer.';
      expect(ss(`${first} ${next}`)).toEqual([first, next]);
      expect(segmentCaseNeutrally(`${first} ${next}`)).toEqual([first, next]);
      expect(segmentCaseNeutrally(`${first} ${next}`.toLowerCase())).toEqual([
        first.toLowerCase(),
        next.toLowerCase(),
      ]);
    });

    test.each(['vs.', 'v.s.'])(
      'keeps quoted %s inside its still-open surrounding bracket',
      (abbreviation) => {
        for (const [opening, closing] of [
          ['(', ')'],
          ['[(', ')]'],
        ]) {
          for (const next of ['Examples followed', '123 followed', 'This happened']) {
            const input = `He noted ${opening}"${abbreviation}" ${next}${closing} today.`;
            expect(ss(input)).toEqual([input]);
            expect(segmentCaseNeutrally(input)).toEqual([input]);
            const singleQuoted = input.replaceAll('"', "'");
            expect(ss(singleQuoted)).toEqual([singleQuoted]);
            expect(segmentCaseNeutrally(singleQuoted)).toEqual([singleQuoted]);
          }
          const first = `${opening}He wrote "${abbreviation}"${closing}`;
          const next = 'Examples followed.';
          expect(ss(`${first} ${next}`)).toEqual([first, next]);
          expect(segmentCaseNeutrally(`${first} ${next}`)).toEqual([first, next]);
          const embedded = `He wrote ${opening}"${abbreviation}"${closing}`;
          expect(ss(`${embedded} ${next}`)).toEqual([embedded, next]);
          expect(segmentCaseNeutrally(`${embedded} ${next}`)).toEqual([embedded, next]);
          const singleQuoted = embedded.replaceAll('"', "'");
          expect(ss(`${singleQuoted} ${next}`)).toEqual([singleQuoted, next]);
          expect(segmentCaseNeutrally(`${singleQuoted} ${next}`)).toEqual([singleQuoted, next]);
        }
      },
    );

    test.each(['vs.', 'v.s.'])(
      'resets standalone bracket context after a terminal versus statement: %s',
      (abbreviation) => {
        const first = `The abbreviation is ${abbreviation}`;
        for (const [open, close] of bracketPairs) {
          const second = `${open}This is clearer.${close}`;
          expect(ss(`${first} ${second} Alice replied.`)).toEqual([
            first,
            second,
            'Alice replied.',
          ]);
          expect(segmentCaseNeutrally(`${first} ${second} Alice replied.`)).toEqual([
            first,
            second,
            'Alice replied.',
          ]);
          expect(segmentCaseNeutrally(`${first} ${second} Alice replied.`.toLowerCase())).toEqual([
            first.toLowerCase(),
            second.toLowerCase(),
            'alice replied.',
          ]);
        }
      },
    );

    test.each(['vs.', 'v.s.'])(
      'keeps paragraph-separated comparisons inside an open bracket: %s',
      (abbreviation) => {
        for (const [open, close] of bracketPairs) {
          for (const separator of ['\n\n', '\r\n\r\n', '\n \n']) {
            const input = `He noted ${open}Linux ${abbreviation}${separator}Windows${close} today.`;
            const expected = `He noted ${open}Linux ${abbreviation} Windows${close} today.`;
            expect(ss(input)).toEqual([expected]);
            expect(segmentCaseNeutrally(input)).toEqual([expected]);
          }
        }
        expect(ss(`He wrote ${abbreviation}\n\nWindows changed.`)).toEqual([
          `He wrote ${abbreviation}`,
          'Windows changed.',
        ]);
      },
    );

    test.each(['vs.', 'v.s.'])(
      'ignores quoted bracket characters when releasing a versus boundary: %s',
      (abbreviation) => {
        for (const [open, close] of bracketPairs) {
          const input = `He noted ${open}"${abbreviation}${close}" Examples followed${close} today.`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          const first = `He wrote ${open}"${abbreviation}"${close}`;
          expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
        }
      },
    );

    test.each(['vs.', 'v.s.'])(
      'keeps quoted literal brackets inside a plain-single versus phrase: %s',
      (abbreviation) => {
        for (const [open, close] of bracketPairs) {
          const input = `He noted ${open}'${abbreviation}${close}' Examples followed${close} today.`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          const first = `He wrote ${open}'${abbreviation}'${close}`;
          expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
        }
        const first = `He wrote '${abbreviation}'`;
        expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
      },
    );

    test.each([
      "The authors' notes (vs.) stayed together.",
      "She said 'can't (vs.) stay' today.",
      "She said 'The students' notes (vs.) stayed' today.",
      'He said "The value [...]" Next sentence.',
    ])('preserves apostrophe and omission context beside plain-single brackets: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each(["The '90s (vs.) remained.", "'Tis (vs.) today."])(
      'keeps an unpaired leading elision separate from a later independent quote: %s',
      (first) => {
        const second = "He said 'No.'";
        expect(ss(`${first} ${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
      },
    );

    test.each(['vs.', 'v.s.'])(
      'keeps provisional geographic abbreviation and bracket attachment conservative: %s',
      (abbreviation) => {
        const input = `I live in the U.S. (He wrote ${abbreviation}) Alice replied.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      },
    );

    test.each(['vs.', 'v.s.'])(
      'retains embedded brackets after provisional abbreviation boundaries: %s',
      (abbreviation) => {
        for (const separator of [' ', '\n']) {
          for (const [open, close] of bracketPairs) {
            for (const input of [
              `The guide says e.g.${separator}${open}use ${abbreviation}${close} Examples follow.`,
              `We use Acme Co.${separator}${open}printed ${abbreviation}${close} rather than versus.`,
            ]) {
              const expected = input.replaceAll('\n', ' ');
              expect(ss(input)).toEqual([expected]);
              // Preserve the existing neutral line-wrap boundary after ordinary abbreviations.
              const neutral =
                input.startsWith('We use') && separator === '\n' ? input.split('\n') : [expected];
              expect(segmentCaseNeutrally(input)).toEqual(neutral);
              expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
                neutral.map((sentence) => sentence.toLowerCase()),
              );
            }
            const first = 'He wrote it.';
            const second = `${open}He wrote ${abbreviation}${close}`;
            expect(ss(`${first} ${second} Alice explained.`)).toEqual([
              first,
              second,
              'Alice explained.',
            ]);
            expect(segmentCaseNeutrally(`${first} ${second} Alice explained.`)).toEqual([
              first,
              second,
              'Alice explained.',
            ]);
          }
        }
      },
    );

    test('folds Unicode abbreviations when retaining embedded bracket context', () => {
      for (const name of ['Kan', 'Kan', 'kan']) {
        const input = `We use ${name}. (printed v.s.) rather than versus.`;
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      }
    });

    test.each([1, 3])('ignores an angle quotation closer after %i backslashes', (count) => {
      const input = `He noted <"literal ${'\\'.repeat(count)}" > sign" and "v.s." Examples followed> today.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each([2, 4])('accepts an angle quotation closer after %i backslashes', (count) => {
      const first = `He noted <"literal ${'\\'.repeat(count)}" >.`;
      const second = 'He wrote "v.s."';
      const third = 'Examples followed.';
      expect(ss(`${first} ${second} ${third}`)).toEqual([first, second, third]);
      expect(segmentCaseNeutrally(`${first} ${second} ${third}`)).toEqual([first, second, third]);
    });

    test.each(['vs.', 'v.s.'])(
      'attaches spaced Treebank quotation closure after %s',
      (abbreviation) => {
        for (const separator of [' ', '\n']) {
          const first = `He wrote \`\`${abbreviation}${separator}''`;
          for (const second of ['Alice explained.', '"Alice explained."']) {
            const input = `${first} ${second}`;
            const expected = [first.replaceAll('\n', ' '), second];
            expect(ss(input)).toEqual(expected);
            expect(segmentCaseNeutrally(input)).toEqual(expected);
            expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
              expected.map((sentence) => sentence.toLowerCase()),
            );
          }
        }
      },
    );

    test.each(['vs.', 'v.s.'])(
      'releases terminal %s after a completed standalone bracket',
      (abbreviation) => {
        for (const [opening, closing] of [
          ['(', ')'],
          ['[', ']'],
          ['{', '}'],
          ['<', '>'],
        ]) {
          const first = `${opening}He wrote ${abbreviation}${closing}`;
          for (const next of ['Alice replied.', '123 people replied.']) {
            for (const segment of [ss, segmentCaseNeutrally]) {
              expect(segment(`${first} ${next}`)).toEqual([first, next]);
            }
          }
        }
      },
    );

    test.each(['vs.', 'v.s.'])(
      'distinguishes angle delimiters from comparisons before quoted %s',
      (abbreviation) => {
        for (const comparison of ['x < 5', 'x<5', 'x<y']) {
          const first = `The score was ${comparison}.`;
          const second = `He wrote "${abbreviation}"`;
          for (const segment of [ss, segmentCaseNeutrally]) {
            expect(segment(`${first} ${second} Alice replied.`)).toEqual([
              first,
              `${second} Alice replied.`,
            ]);
            expect(segment(`${first} He showed ">". ${second} Alice replied.`)).toEqual([
              first,
              'He showed ">".',
              `${second} Alice replied.`,
            ]);
            expect(segment(`${first} ${second} Alice returned.`)).toEqual([
              first,
              second,
              'Alice returned.',
            ]);
            expect(segment(`${first} He showed ">". ${second} Alice returned.`)).toEqual([
              first,
              'He showed ">".',
              second,
              'Alice returned.',
            ]);
          }
        }
        for (const [opening, closing] of [
          ['<', '>'],
          ['< ', ' >'],
          ['<[(', ')]>'],
        ]) {
          const input = `He noted ${opening}"${abbreviation}" Examples followed${closing} today.`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
        }
      },
    );

    test.each([
      ['"', '"'],
      ["'", "'"],
      ['“', '”'],
      ['‘', '’'],
      ['«', '»'],
      ['``', "''"],
      ["''", "''"],
    ])('ignores quoted angle marks inside %s%s', (opening, closing) => {
      const first = `${opening}literal < > sign${closing}.`;
      const second = 'He wrote "vs."';
      for (const segment of [ss, segmentCaseNeutrally]) {
        expect(segment(`${first} ${second} Alice replied.`)).toEqual([
          first,
          `${second} Alice replied.`,
        ]);
        expect(segment(`${first} ${second} Alice returned.`)).toEqual([
          first,
          second,
          'Alice returned.',
        ]);
        const input = `He noted <${opening}literal > sign${closing} and "vs." Examples followed> today.`;
        expect(segment(input)).toEqual([input]);
      }
    });

    test.each(['Rock‘n', 'Rock’n', "Rock'n", 'Café’s'])(
      'keeps word-internal apostrophes outside angle quotation state: %s',
      (word) => {
        const input = `${word} sign <"vs." Examples followed> today.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        const quoted = `He noted <"${word} > sign" and "vs." Examples followed> today.`;
        expect(ss(quoted)).toEqual([quoted]);
        expect(segmentCaseNeutrally(quoted)).toEqual([quoted]);
      },
    );

    test('retains Unicode-folded abbreviations before numeric quote continuations', () => {
      const input = 'He said "Kan." 2 people remained.';
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each(['vs.', 'v.s.'])(
      'applies the same terminal and comparison rules to %s',
      (abbreviation) => {
        const first = `The abbreviation is ${abbreviation}`;
        const next = 'Today is clearer.';
        const comparison = `The Giants ${abbreviation} Boston Celtics, which was televised.`;
        const quoted = `He wrote "${abbreviation}"`;
        const paragraph = `The Giants ${abbreviation}`;
        for (const segment of [ss, segmentCaseNeutrally]) {
          expect(segment(`${first} ${next}`)).toEqual([first, next]);
          expect(segment(comparison)).toEqual([comparison]);
          expect(segment(`${quoted} Alice explained.`)).toEqual([quoted, 'Alice explained.']);
          expect(segment(`${paragraph}\n\nBoston Celtics won.`)).toEqual([
            paragraph,
            'Boston Celtics won.',
          ]);
        }
      },
    );

    test.each(['Government', 'Army', 'Navy', 'Military', 'Congress'])(
      'retains the existing unspaced geographic continuation %s',
      (continuation) => {
        const input = `The U.S.${continuation} acted.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      },
    );

    test.each(['Senate', 'Commission'])('keeps U.S. %s inside its sentence', (continuation) => {
      const input = `The U.S. ${continuation} voted.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each(['Senate', 'Commission'])(
      'preserves wrapped and unspaced boundaries around U.S. %s',
      (continuation) => {
        for (const separator of ['\n', '\r\n', '\r']) {
          const wrapped = `The U.S.${separator}${continuation} voted.`;
          const normalized = `The U.S. ${continuation} voted.`;
          expect(ss(wrapped)).toEqual([normalized]);
          expect(segmentCaseNeutrally(wrapped)).toEqual([normalized]);
        }

        const unspaced = `I live in the U.S.${continuation} meets tomorrow.`;
        expect(ss(unspaced)).toEqual(['I live in the U.S.', `${continuation} meets tomorrow.`]);
        expect(segmentCaseNeutrally(unspaced)).toEqual([
          'I live in the U.S.',
          `${continuation} meets tomorrow.`,
        ]);

        const quoted = `The U.S.\n"${continuation} reconvenes."`;
        expect(ss(quoted)).toEqual(['The U.S.', `"${continuation} reconvenes."`]);
        expect(segmentCaseNeutrally(quoted)).toEqual(['The U.S.', `"${continuation} reconvenes."`]);

        for (const paragraph of ['\n\n', '\r\n\r\n', '\r\r']) {
          const input = `I live in the U.S.${paragraph}${continuation} meets tomorrow.`;
          const expected = ['I live in the U.S.', `${continuation} meets tomorrow.`];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
        }
      },
    );

    test('does not inflate ROUGE-L by splitting geographic noun phrases', () => {
      expect(rouge.l('The U.S. Senate voted.', 'Senate voted The U.S.')).toBeCloseTo(4 / 9);
    });

    test.each([
      [
        'She said “She called it ‘No.’ Alice left.” Next.',
        ['She said “She called it ‘No.’ Alice left.”', 'Next.'],
      ],
      ['“Stop!” Alice said softly. Next.', ['“Stop!” Alice said softly.', 'Next.']],
      ['“Stop!” Alice asked him. Next.', ['“Stop!” Alice asked him.', 'Next.']],
      [
        'She said ‘The dogs’ toys are here. Take them.’ Next.',
        ['She said ‘The dogs’ toys are here. Take them.’', 'Next.'],
      ],
      [
        "She said 'Til tomorrow. We can wait.' Next.",
        ["She said 'Til tomorrow. We can wait.'", 'Next.'],
      ],
    ])('preserves reviewed quotation boundaries: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      'She said ‘He answered “No.” Alice left.’',
      'She said „She called it ‘No.’ Alice left.“',
      'She said “He answered ‘No.’ ”',
      'She said ‘The students’.’',
      'She said ‘John‘s toy broke. Take it.’',
      'She said ‘Use the 1990s’ style. Keep it.’',
      'She said ‘Use the ’90s style. Keep it.’',
      'She said ‘Rock ’n’ roll. Dance.’',
      'She said ‘That U.S.’s policy changed. Go.’',
      'She said ‘Use Acme Co. ‘Twas wisely.’',
      'She said ‘Use Acme Co. ‘em wisely.’',
      'She said ‘Use Acme Co. ‘90s style.’',
      "She said 'Tis the season. We can wait.'",
      "She said '99 was good. We can wait.'",
      '“Stop!” Alice asked him quietly.',
      '“Stop!” Alice said softly.',
    ])('retains paired single-quote context in %s', (quoted) => {
      expect(ss(`${quoted} Next.`)).toEqual([quoted, 'Next.']);
      expect(segmentCaseNeutrally(`${quoted} Next.`)).toEqual([quoted, 'Next.']);
    });

    test.each([
      [
        "She said 'Til tomorrow.\nWe can wait.' Next.",
        ["She said 'Til tomorrow.", "We can wait.'", 'Next.'],
      ],
      [
        'She said ‘The dogs’ toys are here.\nTake them.’ Next.',
        ['She said ‘The dogs’ toys are here.', 'Take them.’', 'Next.'],
      ],
      [
        'She said ‘use Acme Co.\n‘Twas wisely.’ Next.',
        ['She said ‘use Acme Co. ‘Twas wisely.’', 'Next.'],
      ],
      ['‘Twas late. We left.', ['‘Twas late.', 'We left.']],
      ['It happened in ’99. Next event.', ['It happened in ’99.', 'Next event.']],
      ["'Til tomorrow. It's fine.", ["'Til tomorrow.", "It's fine."]],
      ["'Tis fine. She said 'Hello.' Next.", ["'Tis fine.", "She said 'Hello.'", 'Next.']],
      ['The result was ‘(significant)’². Next.', ['The result was ‘(significant)’².', 'Next.']],
    ])('shares quote classification across sentence buffers: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      [
        "She said 'The dogs' toys are here. Take them.' Next.",
        ["She said 'The dogs' toys are here. Take them.'", 'Next.'],
      ],
      ['First.“Next.”', ['First.', '“Next.”']],
      ['First.‘Next.’', ['First.', '‘Next.’']],
      ['First.„Next.“', ['First.', '„Next.“']],
      ['“It ended.” Was Mr. Jones ready? Next.', ['“It ended.”', 'Was Mr. Jones ready?', 'Next.']],
      ['Omitted words . . . . “Next sentence.”', ['Omitted words . . . .', '“Next sentence.”']],
    ])('preserves reviewed quote-family boundaries: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      [
        "She said 'The dogs' owners' toys are here. Take them.' Next.",
        ["She said 'The dogs' owners' toys are here. Take them.'", 'Next.'],
      ],
      [
        "She said 'The dogs' toys are here. Take them.', then left. Next.",
        ["She said 'The dogs' toys are here. Take them.', then left.", 'Next.'],
      ],
      [
        "The answer 'Yes' was accepted. She said 'No.' Next.",
        ["The answer 'Yes' was accepted.", "She said 'No.'", 'Next.'],
      ],
      [
        '“It ended.” Was the U.S. government ready? Next.',
        ['“It ended.”', 'Was the U.S. government ready?', 'Next.'],
      ],
      [
        'The word “No.” was written. Was Alice ready?',
        ['The word “No.” was written.', 'Was Alice ready?'],
      ],
    ])('preserves competing quote and attribution boundaries: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      [
        '"It ended." Was version 3.14 ready? Next.',
        ['"It ended."', 'Was version 3.14 ready?', 'Next.'],
      ],
      [
        '"It ended." Was example.com ready? Next.',
        ['"It ended."', 'Was example.com ready?', 'Next.'],
      ],
      [
        'She said “outer „inner.“ Then left.” Next.',
        ['She said “outer „inner.“ Then left.”', 'Next.'],
      ],
    ])('preserves reviewed question and nested-style boundaries: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      ['He said "Alpha.""2 people agreed."', ['He said "Alpha."', '"2 people agreed."']],
      ['He said "Alpha.""Next."', ['He said "Alpha."', '"Next."']],
      [
        'He said "Alpha.""Two sentences. Really." Next.',
        ['He said "Alpha."', '"Two sentences. Really."', 'Next.'],
      ],
    ])('preserves opening quotes on adjacent quoted sentences: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      ['"It ended." Was Alice\nready? Next.', ['"It ended."', 'Was Alice ready?', 'Next.']],
      ['"It ended." Was Alice... ready? Next.', ['"It ended."', 'Was Alice... ready?', 'Next.']],
      [
        '"It ended." Was Alice . . . ready? Next.',
        ['"It ended."', 'Was Alice . . . ready?', 'Next.'],
      ],
      ["He said 'Stop.'Next. Last.", ["He said 'Stop.'", 'Next.', 'Last.']],
      ['Use etc.\n‘Next sentence.’', ['Use etc.', '‘Next sentence.’']],
      ['“Stop!” “Alice said.” Next.', ['“Stop!”', '“Alice said.”', 'Next.']],
      ['“Alpha.”“Beta.”', ['“Alpha.”', '“Beta.”']],
    ])('retains reviewed continuation boundaries: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      const neutralExpected =
        input === '"It ended." Was Alice... ready? Next.'
          ? ['"It ended." Was Alice...', 'ready?', 'Next.']
          : expected;
      expect(segmentCaseNeutrally(input)).toEqual(neutralExpected);
    });

    test.each(['alice.smith@example.com', 'ALICE.SMITH@EXAMPLE.COM'])(
      'preserves email punctuation in an auxiliary question: %s',
      (address) => {
        const input = `"It ended." Was ${address} ready? Next.`;
        const expected = ['"It ended."', `Was ${address} ready?`, 'Next.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each([
      [
        'He typed "hello. Next sentence. Last one.',
        ['He typed "hello.', 'Next sentence.', 'Last one.'],
      ],
      [
        "He typed 'hello. Next sentence. Last one.",
        ["He typed 'hello.", 'Next sentence.', 'Last one.'],
      ],
      [
        'He typed “hello. Next sentence. Last one.',
        ['He typed “hello.', 'Next sentence.', 'Last one.'],
      ],
      [
        'He typed „hello. Next sentence. Last one.',
        ['He typed „hello.', 'Next sentence.', 'Last one.'],
      ],
      [
        'He typed ``hello. Next sentence. Last one.',
        ['He typed ``hello.', 'Next sentence.', 'Last one.'],
      ],
      [
        "The answer 'Yes' worked. It was 5' tall. Next.",
        ["The answer 'Yes' worked.", "It was 5' tall.", 'Next.'],
      ],
      [
        "The answer 'Yes' worked. It was 5' Tall. Next.",
        ["The answer 'Yes' worked.", "It was 5' Tall.", 'Next.'],
      ],
      [
        'She said „He answered “No.” Then left.“ Next.',
        ['She said „He answered “No.” Then left.“', 'Next.'],
      ],
      ["He said 'Alpha.''Beta.'", ["He said 'Alpha.'", "'Beta.'"]],
      ["She said 'Til tomorrow.'Next.", ["She said 'Til tomorrow.'", 'Next.']],
      [
        "She said 'The dogs' owners were born in 2020.' Next.",
        ["She said 'The dogs' owners were born in 2020.'", 'Next.'],
      ],
    ])('shares confirmed quotation pairs across boundary consumers: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      [
        'She said “First. Then „inner.“ Finally left.” Next.',
        ['She said “First. Then „inner.“ Finally left.”', 'Next.'],
      ],
      [
        '"It ended." Was “First. Then „inner.“ Finally left.”? Next.',
        ['"It ended."', 'Was “First. Then „inner.“ Finally left.”?', 'Next.'],
      ],
    ])('retains an English outer pair across a German closing mark: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('recovers many unmatched quote openers without repeated closer searches', () => {
      const first = `He typed ${'“ '.repeat(20_000)}Done.`;
      const input = `${first} Next.`;
      expect(ss(input)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
    }, 5000);

    test.each([
      [
        '“Stop!” Aloud, she read the transcript. Next.',
        ['“Stop!”', 'Aloud, she read the transcript.', 'Next.'],
      ],
      ['He said “Stop!” aloud, said Alice. Next.', ['He said “Stop!” aloud, said Alice.', 'Next.']],
      ['He said “Stop!” aloud to her. Next.', ['He said “Stop!” aloud to her.', 'Next.']],
      [
        "She said 'First. It was 5' tall. Take it.' Next.",
        ["She said 'First. It was 5' tall. Take it.'", 'Next.'],
      ],
      [
        "He said 'The dogs' owners stood 5' tall. Take it.' Next.",
        ["He said 'The dogs' owners stood 5' tall. Take it.'", 'Next.'],
      ],
      [
        "He wrote '5' on the card. She said 'First. Last.' Next.",
        ["He wrote '5' on the card.", "She said 'First. Last.'", 'Next.'],
      ],
      [
        "He said 'It was 𝟝' tall. Next thought.' Last.",
        ["He said 'It was 𝟝' tall. Next thought.'", 'Last.'],
      ],
      ["He said ``Stop.'' ``Next.''", ["He said ``Stop.''", "``Next.''"]],
      ["He said ``Stop.''``Next.''", ["He said ``Stop.''", "``Next.''"]],
      ["He said ``Stop.'' \n``Was Alice ready?''", ["He said ``Stop.''", "``Was Alice ready?''"]],
      ["He said ``Stop.'' `Next.'", ["He said ``Stop.'' `Next.'"]],
    ])('retains reviewed quotation and attribution distinctions: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['https://example.com/', 'www.example.com/'])(
      'retains long URL context in quotation and ordinary scans: %s',
      (prefix) => {
        const url = `${prefix}${'a'.repeat(400)}.Example`;
        const input = `"It ended." Was ${url} ready? Next.`;
        const expected = ['"It ended."', `Was ${url} ready?`, 'Next.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(ss(`See ${url}. Next.`)).toEqual([`See ${url}.`, 'Next.']);
      },
    );

    test.each([
      ["He said ``She said 'No.''' Next.", ["He said ``She said 'No.'''", 'Next.']],
      [
        "He said ``She said 'The dogs' owners stayed.''' Next.",
        ["He said ``She said 'The dogs' owners stayed.'''", 'Next.'],
      ],
      ["He said ``Stop.'''Next.'", ["He said ``Stop.''", "'Next.'"]],
      ["He said ``Stop.'' 'Next.'", ["He said ``Stop.''", "'Next.'"]],
      [
        "The answer 'Yes' was accepted. He wrote '$5. Next.' Last.",
        ["The answer 'Yes' was accepted.", "He wrote '$5. Next.'", 'Last.'],
      ],
      [
        "'Til tomorrow. He wrote '$5. Next.' Last.",
        ["'Til tomorrow.", "He wrote '$5. Next.'", 'Last.'],
      ],
      ["Use etc.\n``Next sentence.''", ['Use etc.', "``Next sentence.''"]],
      ["Use etc.\n`Next sentence.'", ["Use etc. `Next sentence.'"]],
    ])('preserves reviewed Treebank and symbol-opening contexts: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['He said "', 'He said ("', 'He said ["', 'He said <"', '"'])(
      'preserves a truncated tokenizer opener in opening context: %s',
      (input) => {
        expect(rouge.treeBankTokenize(input).at(-1)).toBe('``');
      },
    );

    test.each([
      ["He said '``Alpha.'' Beta.' Next.", ["He said '``Alpha.'' Beta.'", 'Next.']],
      ["He said '``Alpha.''' Next.", ["He said '``Alpha.'''", 'Next.']],
      ["He said ``'Alpha.''' Next.", ["He said ``'Alpha.'''", 'Next.']],
      ["He said ``'Alpha.' Beta.'' Next.", ["He said ``'Alpha.' Beta.''", 'Next.']],
      ["He said ``Alpha. '' Next.", ["He said ``Alpha. ''", 'Next.']],
      ["He said ``Alpha.\n'' Next.", ["He said ``Alpha. ''", 'Next.']],
      [
        "The answer 'Yes' was accepted. '$5. Next.' Last.",
        ["The answer 'Yes' was accepted.", "'$5. Next.'", 'Last.'],
      ],
    ])('uses actual quote endpoint families for both nesting orders: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      ['She said "First. Then ‘inner’"Next.', ['She said "First. Then ‘inner’"Next.']],
      ["She said 'First. Then “inner”'Next.", ["She said 'First. Then “inner”'Next."]],
      ['She said "First. Then ‘inner’ "Next.', ['She said "First. Then ‘inner’ "Next.']],
      ['She said "First. Then (‘inner’)"Next.', ['She said "First. Then (‘inner’)"Next.']],
      ['She said "First. Then \'inner\'"Next.', ['She said "First. Then \'inner\'"Next.']],
      ["She said 'First. Then ``inner'''Next.", ["She said 'First. Then ``inner'''Next."]],
      [
        'She said "First. Then ‘inner’ word "Next. Last." End.',
        ['She said "First.', 'Then ‘inner’ word "Next. Last."', 'End.'],
      ],
      [
        '"It ended." Was https://example.com/valid valid? Next.',
        ['"It ended."', 'Was https://example.com/valid valid?', 'Next.'],
      ],
      [
        '"It ended." Was https://example.com/dir./file valid? Next.',
        ['"It ended."', 'Was https://example.com/dir./file valid?', 'Next.'],
      ],
      [
        '"It ended." Was https://example.com/dir..//file valid? Next.',
        ['"It ended."', 'Was https://example.com/dir..//file valid?', 'Next.'],
      ],
      [
        '"It ended." Was https://example.com/dir.?key=value valid? Next.',
        ['"It ended."', 'Was https://example.com/dir.?key=value valid?', 'Next.'],
      ],
      [
        '"It ended." Was https://example.com/dir.#section valid? Next.',
        ['"It ended."', 'Was https://example.com/dir.#section valid?', 'Next.'],
      ],
      [
        '"It ended." Was https://example.com/dir.;value valid? Next.',
        ['"It ended."', 'Was https://example.com/dir.;value valid?', 'Next.'],
      ],
      [
        '"It ended." Was https://example.com/dir._value valid? Next.',
        ['"It ended."', 'Was https://example.com/dir._value valid?', 'Next.'],
      ],
      [
        '"It ended." Was https://example.com/dir.%20value valid? Next.',
        ['"It ended."', 'Was https://example.com/dir.%20value valid?', 'Next.'],
      ],
    ])('retains paired inner closers and URL path context: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('keeps paired-inner recovery linear across repeated quotations', () => {
      const sentence = 'She said "First. Then ‘inner’"Next.';
      const input = new Array(4000).fill(sentence).join(' ');
      expect(ss(input)).toEqual(new Array(4000).fill(sentence));
      expect(segmentCaseNeutrally(input)).toEqual(new Array(4000).fill(sentence));
    }, 5000);

    test('keeps URL punctuation lookahead linear across a long path', () => {
      const question = `Was https://example.com/${'dir./'.repeat(8000)}file valid?`;
      const input = `"It ended." ${question} Next.`;
      const expected = ['"It ended."', question, 'Next.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test.each([
      ['1. «First. Second.» 2. «Third.»', ['1. «First. Second.»', '2. «Third.»']],
      ['1. ‹First. Second.› 2. ‹Third.›', ['1. ‹First. Second.›', '2. ‹Third.›']],
      ['1. “First. Second.” 2. “Third.”', ['1. “First. Second.”', '2. “Third.”']],
      [
        'He said «First. Then “inner.” Last.» Next.',
        ['He said «First. Then “inner.” Last.»', 'Next.'],
      ],
      [
        'He said ‹First. Then ‘inner.’ Last.› Next.',
        ['He said ‹First. Then ‘inner.’ Last.›', 'Next.'],
      ],
      ['He said «First. Second.»«Next.»', ['He said «First. Second.»', '«Next.»']],
      ['He said ‹First. Second.› ‹Next.›', ['He said ‹First. Second.›', '‹Next.›']],
      ['Use etc.\n«Next sentence.»', ['Use etc.', '«Next sentence.»']],
      ['Use etc.\n‹Next sentence.›', ['Use etc.', '‹Next sentence.›']],
      ['«It ended.» Was «Why?» Next.', ['«It ended.»', 'Was «Why?»', 'Next.']],
      ['‹It ended.› Was ‹Why?› Next.', ['‹It ended.›', 'Was ‹Why?›', 'Next.']],
      [
        'The word “No.” was documented at https://example.com/?%20x today. Next.',
        ['The word “No.” was documented at https://example.com/?%20x today.', 'Next.'],
      ],
      [
        'The word “No.” was documented at https://example.com/?&key=value today. Next.',
        ['The word “No.” was documented at https://example.com/?&key=value today.', 'Next.'],
      ],
      [
        'The word “No.” was documented at https://example.com/?=value today. Next.',
        ['The word “No.” was documented at https://example.com/?=value today.', 'Next.'],
      ],
      [
        'The word “No.” was documented at https://example.com/?#section today. Next.',
        ['The word “No.” was documented at https://example.com/?#section today.', 'Next.'],
      ],
      [
        'The word “No.” was documented at https://example.com/?/path today. Next.',
        ['The word “No.” was documented at https://example.com/?/path today.', 'Next.'],
      ],
      [
        '“It ended.” Was https://example.com/?%20x valid? Next.',
        ['“It ended.”', 'Was https://example.com/?%20x valid?', 'Next.'],
      ],
      [
        '“It ended.” Was https://example.com/valid? Next.',
        ['“It ended.”', 'Was https://example.com/valid?', 'Next.'],
      ],
      [
        "He said 'Tis done. The value is 5' aloud. Next.",
        ["He said 'Tis done. The value is 5' aloud.", 'Next.'],
      ],
      [
        "He said 'Tis done. It was 5' tall. Take it.' Next.",
        ["He said 'Tis done. It was 5' tall. Take it.'", 'Next.'],
      ],
      ["He wrote 'Tis 5' on the card. Next.", ["He wrote 'Tis 5' on the card.", 'Next.']],
      ['He said "First. Then «inner»"Next.', ['He said "First. Then «inner»"Next.']],
      ["He said 'First. Then ‹inner›'Next.", ["He said 'First. Then ‹inner›'Next."]],
      ["He said «First. Then 'inner.'» Next.", ["He said «First. Then 'inner.'»", 'Next.']],
      ["He said ‹First. Then 'inner.'› Next.", ["He said ‹First. Then 'inner.'›", 'Next.']],
      [
        'He said «First. Then ‹Inner. Next.› Last.» End.',
        ['He said «First. Then ‹Inner. Next.› Last.»', 'End.'],
      ],
      [
        '«Unmatched. Next. «Paired. Last.» End.',
        ['«Unmatched.', 'Next.', '«Paired. Last.»', 'End.'],
      ],
      [
        '‹Unmatched. Next. ‹Paired. Last.› End.',
        ['‹Unmatched.', 'Next.', '‹Paired. Last.›', 'End.'],
      ],
    ])(
      'retains guillemet families, URL queries and numeric-ending quotations: %s',
      (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test('keeps both guillemet endpoint families linear across repeated mixed quotations', () => {
      const sentence = 'He said «First. Then ‹Inner. Next.› Last.»';
      const input = new Array(3000).fill(sentence).join(' ');
      const expected = new Array(3000).fill(sentence);
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test('keeps URL query punctuation lookahead linear across a long token', () => {
      const url = `https://example.com/${'?%20x'.repeat(8000)}`;
      const sentence = `The word “No.” was documented at ${url} today.`;
      expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
    }, 5000);

    test.each([
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
      ['<', '>'],
    ])(
      'distinguishes inline bracket questions from entire auxiliary arguments: %s',
      (open, close) => {
        for (const inner of ['was it?', '“was it?”']) {
          const sentence = `The word “No.” was documented ${open}${inner}${close} yesterday.`;
          expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
          expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
          expect(segmentCaseNeutrally(`${sentence} Next.`.toLowerCase())).toEqual([
            sentence.toLowerCase(),
            'next.',
          ]);
        }
        const question = `Was ${open}it?${close}`;
        expect(ss(`“It ended.” ${question}`)).toEqual(['“It ended.”', question]);
        expect(segmentCaseNeutrally(`“It ended.” ${question}`)).toEqual(['“It ended.”', question]);
        // The existing bracket scanner keeps the trailing prose with this question.
        expect(ss(`“It ended.” ${question} Next.`)).toEqual(['“It ended.”', `${question} Next.`]);
        expect(segmentCaseNeutrally(`“It ended.” ${question} Next.`)).toEqual([
          '“It ended.”',
          `${question} Next.`,
        ]);
      },
    );

    test.each([
      'The word “No.” was documented at (https://example.com/? ) today.',
      'The word “No.” was documented (“was ) it?”) yesterday.',
      'The word “No.” was documented (“was ( it?”) yesterday.',
      'The word “No.” was documented ([was it?]) yesterday.',
      'The word “No.” was documented ([was it?}) yesterday.',
    ])('keeps bracket context outside paired literal quotations: %s', (sentence) => {
      expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
    });

    test.each([
      ['“It ended.” Was ((it?))', ['“It ended.”', 'Was ((it?))']],
      ['“It ended.” Was (“it?”)', ['“It ended.”', 'Was (“it?”)']],
      ['“It ended.” Was Alice asking (really?)', ['“It ended.”', 'Was Alice asking (really?)']],
      ['“It ended.” Was “(it?” Next.', ['“It ended.”', 'Was “(it?”', 'Next.']],
      ['“It ended.” Was “it)?” Next.', ['“It ended.”', 'Was “it)?”', 'Next.']],
    ])(
      'retains genuine enclosure-ended questions and quoted literal brackets: %s',
      (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each([
      "She said 'Rock 'n' roll. Dance.'",
      "She said 'Rock 'N' roll. Dance.'",
      "She said 'Rock 'n' roll with the dogs' music. Dance.'",
      'She said ‘Rock ’n’ roll. Dance.’',
      "He said 'n'.",
      'He said ‘n’.',
      "She said 'The letter 'n' means something. Take it.'",
    ])('retains paired n elisions and explicit quoted letters: %s', (sentence) => {
      expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
    });

    test('scans repeated bracketed questions and paired n elisions once', () => {
      const sentence = `The word “No.” was documented ${'(was it?) '.repeat(8000)}yesterday.`;
      expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      const quoted = `She said 'Rock ${"'n' roll. ".repeat(8000)}Dance.'`;
      expect(ss(`${quoted} Next.`)).toEqual([quoted, 'Next.']);
      expect(segmentCaseNeutrally(`${quoted} Next.`)).toEqual([quoted, 'Next.']);
    }, 5000);

    test('keeps question lookahead linear across many nested brackets', () => {
      const question = `Was ${'('.repeat(8000)}it?${')'.repeat(8000)}`;
      expect(ss(`“It ended.” ${question}`)).toEqual(['“It ended.”', question]);
      expect(segmentCaseNeutrally(`“It ended.” ${question}`)).toEqual(['“It ended.”', question]);
    }, 5000);

    test.each([
      "isn't",
      'isn’t',
      "aren't",
      "wasn't",
      'weren’t',
      "hasn't",
      "haven't",
      "hadn't",
      "can't",
      'can’t',
      'cannot',
      "won't",
      'won’t',
      "wouldn't",
      "couldn't",
      "shouldn't",
      "mustn't",
    ])('keeps contracted auxiliary predicates with their quoted subject: %s', (auxiliary) => {
      const sentence = `The word “No.” ${auxiliary} be used.`;
      expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`.toLowerCase())).toEqual([
        sentence.toLowerCase(),
        'next.',
      ]);
    });

    test.each([
      "Isn't it clear?",
      "Isn't Alice there?",
      "Wasn't “Dr.” Smith there?",
      'Can’t it work?',
      "Won't it work?",
      'Isn’t (it?)',
    ])('keeps genuine contracted questions separate: %s', (question) => {
      expect(ss(`“It ended.” ${question}`)).toEqual(['“It ended.”', question]);
      expect(segmentCaseNeutrally(`“It ended.” ${question}`)).toEqual(['“It ended.”', question]);
    });

    test.each(['(', '[', '{', '<'])('uses the full contracted auxiliary before %s', (open) => {
      const close = { '(': ')', '[': ']', '{': '}', '<': '>' }[open];
      const sentence = `The word “No.” wasn't used ${open}was it?${close} yesterday.`;
      expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      const question = `Isn’t ${open}it?${close}`;
      expect(segmentCaseNeutrally(`“It ended.” ${question}`)).toEqual(['“It ended.”', question]);
    });

    test.each(['B.', 'B!', 'U.S.', 'B....'])(
      'recognizes a completed quoted predicate before another auxiliary: %s',
      (label) => {
        const sentence = `The answer “A.” was “${label}”`;
        const expected = [sentence, 'Was it?', 'Next.'];
        expect(ss(`${sentence} Was it? Next.`)).toEqual(expected);
        expect(segmentCaseNeutrally(`${sentence} Was it? Next.`)).toEqual(expected);
        expect(segmentCaseNeutrally(`${sentence} Was it? Next.`.toLowerCase())).toEqual(
          expected.map((part) => part.toLowerCase()),
        );
        expect(segmentCaseNeutrally(sentence)).toEqual([sentence]);
      },
    );

    test.each(['B.', 'U.S.', 'Why!'])(
      'retains the existing neutral label ambiguity inside a question: %s',
      (label) => {
        const question = `Was “${label}” valid?`;
        expect(ss(`“It ended.” ${question} Next.`)).toEqual(['“It ended.”', question, 'Next.']);
        // An arbitrary following word is not new evidence that the quote ends the predicate.
        expect(segmentCaseNeutrally(`“It ended.” ${question} Next.`)).toEqual([
          '“It ended.”',
          `Was “${label}”`,
          'valid?',
          'Next.',
        ]);
      },
    );

    test.each(['B..', 'B...'])(
      'does not promote a quoted short ellipsis to a declarative terminal: %s',
      (label) => {
        const sentence = `The answer “A.” was “${label}”`;
        expect(ss(`${sentence} Was it? Next.`)).toEqual([sentence, 'Was it?', 'Next.']);
        expect(segmentCaseNeutrally(`${sentence} Was it? Next.`)).toEqual([
          'The answer “A.”',
          `was “${label}”`,
          'Was it?',
          'Next.',
        ]);
      },
    );

    test('advances cached terminals across repeated quoted titles and completed predicates', () => {
      const question = `Wasn't ${'“Dr.” '.repeat(8000)}Smith there?`;
      expect(ss(`“It ended.” ${question} Next.`)).toEqual(['“It ended.”', question, 'Next.']);
      expect(segmentCaseNeutrally(`“It ended.” ${question} Next.`)).toEqual([
        '“It ended.”',
        question,
        'Next.',
      ]);
      const pair = 'The answer “A.” was “B.” Was it?';
      expect(segmentCaseNeutrally(`${pair} `.repeat(2000))).toEqual(
        Array.from({ length: 2000 }, () => ['The answer “A.” was “B.”', 'Was it?']).flat(),
      );
    }, 5000);

    test.each([
      'Til tomorrow',
      'twere wise',
      'twill pass',
      'twould help',
      'round the corner',
      'cause it matters',
      'cos it matters',
      'bout time',
      'neath the bridge',
      'fore dawn',
      'tween the trees',
      'gainst the wall',
      'cept the last',
      'twenties music',
    ])('retains every established inner leading elision after a real terminal: %s', (phrase) => {
      const sentence = `She said ‘Wait. ‘${phrase}.’`;
      expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`.toLowerCase())).toEqual([
        sentence.toLowerCase(),
        'next.',
      ]);
      expect(ss(`${sentence}Next.`)).toEqual([sentence, 'Next.']);
    });

    test('retains leading-elision recovery and its existing outer-span precedence', () => {
      const recovered = '‘Til tomorrow. She said ‘Twas strange. Really.’ Next.';
      const expected = ['‘Til tomorrow.', 'She said ‘Twas strange. Really.’', 'Next.'];
      expect(ss(recovered)).toEqual(expected);
      expect(segmentCaseNeutrally(recovered)).toEqual(expected);
      // With a non-elision outer opener, the recognized inner elision retains that span.
      const ambiguous = '‘Unmatched intro. She said ‘Til tomorrow. We can wait.’';
      expect(ss(`${ambiguous} Next.`)).toEqual([ambiguous, 'Next.']);
      expect(segmentCaseNeutrally(`${ambiguous} Next.`)).toEqual([ambiguous, 'Next.']);
      const numeric = 'She said ‘Wait. ‘90s music.’';
      expect(ss(`${numeric} Next.`)).toEqual([numeric, 'Next.']);
      expect(segmentCaseNeutrally(`${numeric} Next.`)).toEqual([numeric, 'Next.']);
    });

    test('keeps repeated full-vocabulary elision classification bounded', () => {
      const sentence = `She said ‘${'Wait. ‘Til tomorrow. '.repeat(8000)}Done.’`;
      expect(ss(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
      expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual([sentence, 'Next.']);
    }, 5000);

    test('recognizes astral digits before measurement apostrophes', () => {
      const input = "The answer 'Yes' worked. It was 𝟝' tall. Next.";
      const expected = ["The answer 'Yes' worked.", "It was 𝟝' tall.", 'Next.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      [
        '‘Til tomorrow. He said ‘Twas strange. Really.’ Next.',
        ['‘Til tomorrow.', 'He said ‘Twas strange. Really.’', 'Next.'],
      ],
      [
        "The word 'news' after Alice is useful. She said 'No.' Next.",
        ["The word 'news' after Alice is useful.", "She said 'No.'", 'Next.'],
      ],
      ["She said 'First. Dogs'² Next sentence.", ["She said 'First. Dogs'² Next sentence."]],
      ["She said 'First. Dogs'𝟚 Next sentence.", ["She said 'First. Dogs'𝟚 Next sentence."]],
    ])('preserves reviewed elision and closing-context distinctions: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['regarding Alice', 'concerning Alice', 'Alice Smith selected'])(
      'closes s-ending words without guessing possessives from following word casing: %s',
      (continuation) => {
        const input = `The word 'news' ${continuation} is useful. She said 'No.' Next.`;
        const expected = [`The word 'news' ${continuation} is useful.`, "She said 'No.'", 'Next.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((text) => text.toLowerCase()),
        );
      },
    );

    test.each([
      ["'", "'"],
      ['‘', '’'],
    ])(
      'does not confirm an elision-led opener with an unrelated possessive %s',
      (opening, closing) => {
        const input = `${opening}Til tomorrow. The dogs${closing} toys Alice bought. Next.`;
        const expected = [
          `${opening}Til tomorrow.`,
          `The dogs${closing} toys Alice bought.`,
          'Next.',
        ];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((text) => text.toLowerCase()),
        );
      },
    );

    test.each([
      ["'", "'"],
      ['‘', '’'],
    ])('confirms elision-led quotes around interior possessives %s', (opening, closing) => {
      const quoted = `She said ${opening}Til the dogs${closing} toys were packed. Take them.${closing}`;
      expect(ss(`${quoted} Next.`)).toEqual([quoted, 'Next.']);
      expect(segmentCaseNeutrally(`${quoted} Next.`)).toEqual([quoted, 'Next.']);
    });

    test.each([
      ["She said 'First. In '99 we left.' Next.", ["She said 'First. In '99 we left.'", 'Next.']],
      ["She said 'First. (Dogs)'² Next sentence.", ["She said 'First. (Dogs)'² Next sentence."]],
    ])('distinguishes numeric elisions from quotation footnotes: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      [
        'He typed "hello. Next sentence says "Stop." Last.',
        ['He typed "hello.', 'Next sentence says "Stop."', 'Last.'],
      ],
      [
        'He typed "hello. Next sentence says "‘Stop.’" Last.',
        ['He typed "hello.', 'Next sentence says "‘Stop.’"', 'Last.'],
      ],
      ['"Alpha. "Next.', ['"Alpha. "', 'Next.']],
      ['"‘No.’ "Next.', ['"‘No.’ "', 'Next.']],
      ['"Alpha "Next." Last.', ['"Alpha "Next."', 'Last.']],
    ])(
      'recovers a later double opener while retaining terminal-led closers: %s',
      (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each([
      [
        '"It ended." Was Alice asking "Really?" Next.',
        ['"It ended."', 'Was Alice asking "Really?"', 'Next.'],
      ],
      ['"It ended." Was Alice asking "Really?"', ['"It ended."', 'Was Alice asking "Really?"']],
      [
        '"It ended." Was Alice asking “First. Really?” Next.',
        ['"It ended."', 'Was Alice asking “First. Really?”', 'Next.'],
      ],
      [
        '"It ended." Was Alice asking ``Really?\'\' Next.',
        ['"It ended."', "Was Alice asking ``Really?''", 'Next.'],
      ],
      [
        '"It ended." Was Alice asking “Really?” 2 people replied.',
        ['"It ended."', 'Was Alice asking “Really?”', '2 people replied.'],
      ],
      [
        '"It ended." Was Alice asking “She said ‘Really?’” Next.',
        ['"It ended."', 'Was Alice asking “She said ‘Really?’”', 'Next.'],
      ],
    ])(
      'recognizes a quoted question at the end of its surrounding question: %s',
      (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each([
      '"Hello." was the title of "Really?" as she remembered it. Next.',
      '"Hello." was the title of “What? he asked” in the book. Next.',
    ])('keeps internal quoted questions inside a continued predicate: %s', (input) => {
      const boundary = input.lastIndexOf(' Next.');
      expect(ss(input)).toEqual([input.slice(0, boundary), 'Next.']);
      expect(segmentCaseNeutrally(input)).toEqual([input.slice(0, boundary), 'Next.']);
    });

    test.each([
      [
        "He typed 'hello. Next says 'Stop.' Last.",
        ["He typed 'hello.", "Next says 'Stop.'", 'Last.'],
      ],
      [
        "He typed 'hello. Next says '“Stop.”' Last.",
        ["He typed 'hello.", "Next says '“Stop.”'", 'Last.'],
      ],
      ["She said 'First. In '99 we left.' Next.", ["She said 'First. In '99 we left.'", 'Next.']],
    ])('recovers later single openers while preserving inner elisions: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      ['He wrote <"First. Next.">', ['He wrote <"First. Next.">']],
      ['She said "Outer.‘Inner.’ End." Next.', ['She said "Outer.‘Inner.’ End."', 'Next.']],
      [
        'She said "Outer (Inner.)Next. End." Next.',
        ['She said "Outer (Inner.)Next. End."', 'Next.'],
      ],
      ['She said "First."Next.', ['She said "First."', 'Next.']],
      ['She said "First."‘Next.’', ['She said "First."', '‘Next.’']],
    ])('requires pending quote closure before an unspaced boundary: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('recovers repeated unmatched single openers with bounded context state', () => {
      const fragment = "He typed 'word.";
      const input = `${`${fragment} `.repeat(10_000)}He said 'Stop.' Last.`;
      const expected = [...new Array<string>(10_000).fill(fragment), "He said 'Stop.'", 'Last.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test('recovers repeated unmatched straight openers in a single pass', () => {
      const fragment = 'He typed "word.';
      const input = `${`${fragment} `.repeat(10_000)}He said "Stop." Last.`;
      const expected = [...new Array<string>(10_000).fill(fragment), 'He said "Stop."', 'Last.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }, 5000);

    test('recovers after an abbreviation possessive without changing neutral abbreviation policy', () => {
      const input = "That is JFK Jr.'s book. Next.";
      expect(ss(input)).toEqual(["That is JFK Jr.'s book.", 'Next.']);
      // Preserve the baseline's neutral abbreviation boundary, but do not hold the remaining document open.
      expect(segmentCaseNeutrally(input)).toEqual(['That is JFK Jr.', "'s book.", 'Next.']);
    });

    test('finds an auxiliary question beyond its paired inner quotation', () => {
      const input = '"It ended." Was "No." the answer? Next.';
      expect(ss(input)).toEqual(['"It ended."', 'Was "No." the answer?', 'Next.']);
      // The existing neutral continuation policy still splits a lower-case clause after a quote.
      expect(segmentCaseNeutrally(input)).toEqual([
        '"It ended."',
        'Was "No."',
        'the answer?',
        'Next.',
      ]);
    });

    test.each(['"hello."', '“hello.”', '‘hello.’', '„hello.“'])(
      'applies the existing quoted line-wrap continuation rule to %s',
      (quoted) => {
        const input = `2020 saw ${quoted}\nthen left.`;
        expect(ss(input)).toEqual([`2020 saw ${quoted}`, 'then left.']);
        expect(segmentCaseNeutrally(input)).toEqual([`2020 saw ${quoted} then left.`]);
      },
    );

    test('preserves Unicode-folded abbreviations at quotation boundaries', () => {
      for (const input of [
        'He said "Kan." 2 people remained.',
        '"It ended." Was Kan. ready? Next.',
      ]) {
        expect(segmentCaseNeutrally(input).map((sentence) => sentence.toLowerCase())).toEqual(
          segmentCaseNeutrally(input.toLowerCase()),
        );
      }
    });

    test('pairs consecutive elision candidates independently', () => {
      const input = "'Til tomorrow. He said 'Twas strange. Really.' Next.";
      const expected = ["'Til tomorrow.", "He said 'Twas strange. Really.'", 'Next.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('pairs elision quotations before Unicode next-line separators', () => {
      const input = "She said 'Til tomorrow. We can wait.'\u0085Next.";
      const expected = ["She said 'Til tomorrow. We can wait.'", 'Next.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      "She said 'First! Second!' aloud.",
      'She said "First! Second!" aloud.',
      "'Well?' she thought, 'First! Second!' aloud.",
    ])('keeps internal sentence punctuation inside quoted spans: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each([
      ['She said ‘First. Second.’ Next.', ['She said ‘First. Second.’', 'Next.']],
      ['She said ‘It’s fine. Really.’ Next.', ['She said ‘It’s fine. Really.’', 'Next.']],
    ])('keeps curly single quotations intact in %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('does not mistake apostrophe-prefixed decades for opening quotations', () => {
      expect(
        ss(
          "I wrote this in the 'nineties. It has four sentences. This is the third, isn't it? And this is the last",
        ),
      ).toEqual([
        "I wrote this in the 'nineties.",
        'It has four sentences.',
        "This is the third, isn't it?",
        'And this is the last',
      ]);
    });

    test.each([
      ["'Tis the season. It is cold.", ["'Tis the season.", 'It is cold.']],
      ["'twas late. We left.", ["'twas late.", 'We left.']],
      ["'Til tomorrow. We can wait.", ["'Til tomorrow.", 'We can wait.']],
      ["'round the bend. We continued.", ["'round the bend.", 'We continued.']],
      ["It happened in '99. Next event.", ["It happened in '99.", 'Next event.']],
      ["She told 'em to leave. They refused.", ["She told 'em to leave.", 'They refused.']],
      ["She said 'cause it rained. We stayed.", ["She said 'cause it rained.", 'We stayed.']],
    ])('does not interpret apostrophe-led contractions as quotations: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      [
        'She said "She answered “No.” Then left." Next.',
        ['She said "She answered “No.” Then left."', 'Next.'],
      ],
      [
        "She said 'She answered “No.” Then left.' Next.",
        ["She said 'She answered “No.” Then left.'", 'Next.'],
      ],
      ['He said "First. “Second.” Then." Next.', ['He said "First. “Second.” Then."', 'Next.']],
    ])('retains outer quotations around nested curly quotations: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      [
        'She said "He answered \'No.\'" Next. Last.',
        ['She said "He answered \'No.\'"', 'Next.', 'Last.'],
      ],
      [
        "She said “He answered 'No.'” Next. Last.",
        ["She said “He answered 'No.'”", 'Next.', 'Last.'],
      ],
    ])('closes an inner single quote before its outer quotation: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('keeps a spaced outer closing quotation after an inner closer', () => {
      const input = 'She said "He answered \'No.\' " Next. Last.';
      const expected = ['She said "He answered \'No.\' "', 'Next.', 'Last.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('keeps spaced single closing quotations with their sentence', () => {
      const input = "He said 'Stop. ' Next.";
      const expected = ["He said 'Stop. '", 'Next.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('closes s-ending quotations before capitalized continuations', () => {
      const input = "The response 'Yes' Alice selected was accepted. Bob objected.";
      const expected = ["The response 'Yes' Alice selected was accepted.", 'Bob objected.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['in English', 'on Monday', 'from Alice'])(
      'closes s-ending quoted words before %s',
      (continuation) => {
        const input = `The word 'news' ${continuation} is useful. Next sentence.`;
        const expected = [`The word 'news' ${continuation} is useful.`, 'Next sentence.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each([
      ['“Alpha.” Beta.', ['“Alpha.”', 'Beta.']],
      ['She said “First! Second!” Next she left.', ['She said “First! Second!”', 'Next she left.']],
      [
        'Er sagte „Hallo.“ Dann ging er. Nächster Satz.',
        ['Er sagte „Hallo.“', 'Dann ging er.', 'Nächster Satz.'],
      ],
    ])('keeps curly closing quotations with their sentence in %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('keeps independent reporting-verb sentences separate', () => {
      const input = '"It ended." He said nothing afterward. Next.';
      const expected = ['"It ended."', 'He said nothing afterward.', 'Next.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
      expect(segmentCaseNeutrally('"It ended." Nothing was said. Next.')).toEqual([
        '"It ended."',
        'Nothing was said.',
        'Next.',
      ]);
    });

    test.each(['Was it really over?', 'Was Alice ready?', 'Is John ready?', 'Can anyone help?'])(
      'keeps auxiliary-led question %s separate from preceding quotations',
      (question) => {
        const input = `"It ended." ${question} Next.`;
        const expected = ['"It ended."', question, 'Next.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test('keeps long auxiliary-led questions separate from preceding quotations', () => {
      const question = `Was Alice ${'really '.repeat(50)}ready?`;
      const input = `"It ended." ${question} Next.`;
      expect(ss(input)).toEqual(['"It ended."', question, 'Next.']);
      expect(segmentCaseNeutrally(input)).toEqual(['"It ended."', question, 'Next.']);
    });

    test('keeps proper-name dialogue attributions with the quotation', () => {
      const input = '“Stop!” Alice said. Next.';
      const expected = ['“Stop!” Alice said.', 'Next.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
      expect(segmentCaseNeutrally('"Stop!" said Alice. Next.')).toEqual([
        '"Stop!" said Alice.',
        'Next.',
      ]);
      expect(segmentCaseNeutrally('The word “No.” was written. Next.')).toEqual([
        'The word “No.” was written.',
        'Next.',
      ]);
    });

    test('keeps curly-quoted list markers attached to their items', () => {
      const input = '1. “Alpha.” 2. “Beta.”';
      const expected = ['1. “Alpha.”', '2. “Beta.”'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('scores reordered curly-quoted reference sentences correctly', () => {
      expect(rouge.l('Beta “Alpha.”', '“Alpha.” Beta.')).toBeCloseTo(4 / 5);
    });

    test.each([' ', '\n'])(
      'closes Treebank quotations before a following quoted sentence across %j',
      (separator) => {
        const input = `He said \`\`Stop.''${separator}"Next."`;
        expect(ss(input)).toEqual(["He said ``Stop.''", '"Next."']);
        expect(segmentCaseNeutrally(input)).toEqual(["He said ``Stop.''", '"Next."']);
      },
    );

    test.each([',', ';', ':', ')', ']'])(
      'retains an unmatched EOF quote as a closing tokenizer mark after %s',
      (punctuation) => {
        expect(rouge.treeBankTokenize(`hello${punctuation}"`).at(-1)).toBe("''");
        expect(rouge.treeBankTokenize(`hello${punctuation}"world"`).slice(-3)).toEqual([
          '``',
          'world',
          "''",
        ]);
      },
    );

    describe('ReDoS prevention', () => {
      const TIMEOUT_MS = 500;

      test('rejects uninterrupted verb-first attribution subjects without backtracking', () => {
        const input = `"Stop." said ${'a'.repeat(700)}#`;
        const started = Date.now();
        expect(ss(input)).toEqual([input]);
        expect(Date.now() - started).toBeLessThan(TIMEOUT_MS);
      });

      test('tracks unmatched angle openers within a constrained heap', () => {
        expectBundledScriptToPass(
          `
            const summary = '<'.repeat(7000000) + 'word ">"';
            const sentences = module.exports.sentenceSegment(summary);
            if (sentences.length !== 1 || sentences[0] !== summary) {
              throw new Error('Unmatched angle content changed');
            }
            process.stdout.write('ok');
          `,
          30_000,
          ['--max-old-space-size=64'],
        );
      }, 35_000);

      test('short-circuits known URLs before searching question suffixes for email', () => {
        expectBundledScriptToPass(
          `
            const input = '"Dr." Is ' + 'https://a.b/'.repeat(30000) + 'valid?';
            for (const caseNeutral of [false, true]) {
              const sentences = module.exports.sentenceSegment(input, { caseNeutral });
              if (sentences.join(' ') !== input) throw new Error('URL content changed');
            }
            process.stdout.write('ok');
          `,
          5000,
        );
      }, 10_000);

      test('scans repeated quoted abbreviations before a question once', () => {
        expectBundledScriptToPass(
          `
            const input = '"Dr." Is Dr. '.repeat(20000) + 'Ready?';
            const sentences = module.exports.sentenceSegment(input);
            if (sentences.join(' ') !== input) throw new Error('Quotation content changed');
            process.stdout.write('ok');
          `,
          5000,
        );
      }, 10_000);
    });
  });
});

describe('versus delimiters across wrapped prose', () => {
  test.each(['vs.', 'v.s.'])('keeps an embedded %s parenthesis across wraps', (abbreviation) => {
    for (const separator of [' ', '\n', '\r\n', '\r']) {
      const input = `The label is${separator}(${abbreviation}) not versus.`;
      const expected = [`The label is (${abbreviation}) not versus.`];
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual(expected);
        expect(
          rouge.sentenceSegment(`First sentence.\n(He wrote ${abbreviation}) Alice replied.`, {
            caseNeutral,
          }),
        ).toEqual(['First sentence.', `(He wrote ${abbreviation})`, 'Alice replied.']);
      }
    }
  });

  test.each(['\n\n', '\r\n\r\n', '\r\r', '\n \t\n'])(
    'retains standalone parentheses after a blank paragraph: %j',
    (separator) => {
      const input = `Preface${separator}(He wrote vs.) Alice replied.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
          'Preface (He wrote vs.)',
          'Alice replied.',
        ]);
      }
    },
  );

  test.each(["'Tis", "'Twas", "'90s", '‘Tis', '‘Twas'])(
    'retains angle context after an unpaired apostrophe in %s',
    (prefix) => {
      const input = `${prefix} a note: <"v.s." Examples followed> today.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
    },
  );

  test.each([
    ["'Tis", "'No.'"],
    ["'Twas", "'No.'"],
    ["'99", "'No.'"],
    ['‘Tis', '‘No.’'],
    ['‘Twas', '‘No.’'],
    ['‘99', '‘No.’'],
  ])('does not pair %s with a later independent quotation', (prefix, quotation) => {
    const input = `${prefix} <team "vs." Examples followed> He said ${quotation}`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test.each([
    "'Tis > odd'",
    "'99 > odd'",
    '‘Tis > odd’',
    '‘𝒜’s > value’',
    "``literal > sign''",
    "''literal > sign''",
  ])('keeps matched quotation spans inside an angle literal: %s', (quote) => {
    const input = `He noted <${quote} and "vs." Examples followed> today.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test('retains the existing paired-angle interpretation across prose', () => {
    const input = 'The score was x < 5. He wrote "vs." Alice replied > 3.';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
        'The score was x < 5.',
        'He wrote "vs." Alice replied > 3.',
      ]);
    }
  });

  test('preserves a padded matched elision quotation at end of input', () => {
    const input = "'Tis < a note > '";
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test('preserves deeply nested angle literals through position-stack growth', () => {
    const input = `${'<'.repeat(80)}"vs." Examples followed${'>'.repeat(80)} today.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test('bounds searches for repeated unmatched quotation openers', () => {
    expectBundledScriptToPass(
      `
        const summary = '‘'.repeat(250000) + '<"vs." Examples followed> today.';
        const sentences = module.exports.sentenceSegment(summary);
        if (sentences.length !== 1 || sentences[0] !== summary) {
          throw new Error('Unmatched quotation content changed');
        }
        process.stdout.write('ok');
      `,
      3000,
    );
  }, 10_000);
});

describe('versus quote context and cached escape validation', () => {
  test.each(['‘literal )’', '“literal )”', '«literal )»'])(
    'ignores brackets in the existing smart quotation forms: %s',
    (quoted) => {
      for (const abbreviation of ['vs.', 'v.s.']) {
        const input = `He noted <${quoted} and "${abbreviation}" Examples followed> today.`;
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        }
      }
    },
  );

  test.each(['vs.', 'v.s.'])(
    'keeps an inner single-quoted label inside the pending double quotation: %s',
    (abbreviation) => {
      const input = `He noted "He wrote '${abbreviation}' Examples followed" today.`;
      const closed = `He noted "He wrote '${abbreviation}'"`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        expect(rouge.sentenceSegment(`${closed} Examples followed.`, { caseNeutral })).toEqual([
          closed,
          'Examples followed.',
        ]);
      }
    },
  );

  test('reuses escape validation for a closer shared by leading elision candidates', () => {
    expectBundledScriptToPass(
      `
        const input = '<' + '‘1 '.repeat(50000) + String.fromCharCode(92).repeat(100000) + '’>';
        const actual = module.exports.sentenceSegment(input);
        if (actual.length !== 1 || actual[0] !== input) throw new Error('Shared closer changed content');
        process.stdout.write('ok');
      `,
      3000,
    );
  }, 10_000);
});

describe('versus inside paired outer quotes and leading elisions', () => {
  test.each(['vs.', 'v.s.'])(
    'keeps inner double-quoted labels inside a pending outer single quotation: %s',
    (abbreviation) => {
      const input = `He noted 'He wrote "${abbreviation}" Examples followed' today.`;
      const completed = `He noted 'He wrote "${abbreviation}"'`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        expect(rouge.sentenceSegment(`${completed} Examples followed.`, { caseNeutral })).toEqual([
          completed,
          'Examples followed.',
        ]);
      }
    },
  );

  test.each(['Cause', 'em', 'til', 'till'])(
    'keeps leading %s elisions from borrowing a later independent quote',
    (elision) => {
      for (const abbreviation of ['vs.', 'v.s.']) {
        const input = `'${elision} a note: <"${abbreviation}" Examples followed> He said 'No.'`;
        const paired = `'${elision} > odd' <"${abbreviation}" Examples followed> today.`;
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
          expect(rouge.sentenceSegment(paired, { caseNeutral })).toEqual([paired]);
        }
      }
    },
  );
});

describe('escape parity in later quotation openers', () => {
  test.each([0, 1, 2, 3, 4])(
    'distinguishes independent ASCII and curly openers after %i backslashes',
    (count) => {
      const slashes = '\\'.repeat(count);
      for (const abbreviation of ['vs.', 'v.s.']) {
        for (const prefix of [
          `'90s <team He said ${slashes}'No.' and "${abbreviation}"`,
          `‘Tis < ${slashes}‘note’ and "${abbreviation}"`,
        ]) {
          const continuation = 'Examples followed> today.';
          const input = `${prefix} ${continuation}`;
          for (const caseNeutral of [false, true]) {
            expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual(
              count % 2 === 0 ? [input] : [prefix, continuation],
            );
          }
        }
      }
    },
  );

  test('does not reinterpret a terminal-adjacent real closer as another opener', () => {
    const first = "'Tis > odd.'";
    const second = '<"v.s." Examples followed> today.';
    const input = `${first} ${second}`;
    expect(rouge.sentenceSegment(input)).toEqual([input]);
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([first, second]);
  });
});

describe('confirmed delimiter boundaries and wrapped final brackets', () => {
  test.each(['vs.', 'v.s.', 'etc.'])(
    'normalizes a wrapped final embedded %s clause',
    (abbreviation) => {
      for (const [opening, closing] of [
        ['(', ')'],
        ['[', ']'],
        ['{', '}'],
        ['<', '>'],
      ]) {
        for (const ending of ['', '   ', '\n']) {
          const input = `The label is\n${opening}${abbreviation}${closing}${ending}`;
          const expected = `The label is ${opening}${abbreviation}${closing}`;
          for (const caseNeutral of [false, true]) {
            expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([expected]);
          }
        }
      }
    },
  );

  test('retains the prior line-break behavior when an outer bracket stays incomplete', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('The label is\n((v.s.)', { caseNeutral })).toEqual([
        'The label is',
        '((v.s.)',
      ]);
      expect(rouge.sentenceSegment('The label is\n(v.s.) next.', { caseNeutral })).toEqual([
        'The label is (v.s.) next.',
      ]);
    }
  });

  test.each(['\n', '\r\n', ' '])(
    'keeps unmatched greater-than markers after the %j boundary',
    (separator) => {
      const input = `First sentence.${separator}> Quoted text.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
          'First sentence.',
          '> Quoted text.',
        ]);
        expect(rouge.sentenceSegment('First sentence.<Quoted text.>', { caseNeutral })).toEqual([
          'First sentence.',
          '<Quoted text.>',
        ]);
      }
      expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
        'first sentence.',
        '> quoted text.',
      ]);
    },
  );

  test.each(['vs.', 'v.s.', 'etc.', 'Jan.', 'U.S.'])(
    'preserves confirmed unspaced delimited boundaries after %s',
    (abbreviation) => {
      const first = `Use ${abbreviation}`;
      const second = '(Alice replied.)';
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(first + second, { caseNeutral })).toEqual([first, second]);
        expect(rouge.sentenceSegment(`${first} ${second}`, { caseNeutral })).toEqual([
          `${first} ${second}`,
        ]);
      }
    },
  );
});

test('preserves literal greater-than marks inside pending quotation spans', () => {
  for (const first of [
    'He said "vs.>"',
    "He said 'v.s.>'",
    'He noted <"v.s.>">',
    'He said "Value.>"',
  ]) {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
    }
  }
});

test.each(['vs.', 'v.s.', 'etc.', 'Jan.', 'U.S.', 'Value.'])(
  'keeps the paired closing apostrophe after %s before an unspaced opener',
  (abbreviation) => {
    for (const caseNeutral of [false, true]) {
      const first = `He wrote '${abbreviation}'`;
      for (const second of ['(Alice replied.)', '[Alice replied.]', '{Alice replied.}']) {
        expect(rouge.sentenceSegment(first + second, { caseNeutral })).toEqual([first, second]);
        expect(rouge.sentenceSegment(`${first} ${second}`, { caseNeutral })).toEqual([
          `${first} ${second}`,
        ]);
        const independent = second.replace('replied', 'returned');
        expect(rouge.sentenceSegment(`${first} ${independent}`, { caseNeutral })).toEqual([
          first,
          independent,
        ]);
      }
      const unpaired = `Use ${abbreviation}(Alice replied.)`;
      expect(rouge.sentenceSegment(unpaired, { caseNeutral })).toEqual([
        `Use ${abbreviation}`,
        '(Alice replied.)',
      ]);
    }
  },
);

describe('literal backticks and normalized versus context', () => {
  test.each(['vs.', 'v.s.'])(
    'keeps angle operators inside single-backtick literals around %s',
    (vs) => {
      for (const caseNeutral of [false, true]) {
        const input = `Use \`a < b\`. He wrote "${vs}" Alice replied > 3.`;
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
          'Use `a < b`.',
          `He wrote "${vs}"`,
          'Alice replied > 3.',
        ]);
        const bracketed = `He noted <\`literal >\` and "${vs}" Examples followed> today.`;
        expect(rouge.sentenceSegment(bracketed, { caseNeutral })).toEqual([bracketed]);
      }
    },
  );

  test.each([
    'He noted <`literal `` >`` code` and "vs." Examples followed> today.',
    'He noted <``literal >\'\' and "vs." Examples followed> today.',
    'He noted <`literal `` >\'\' and "vs." Examples followed> today.',
  ])('distinguishes isolated backticks from the existing Treebank pair in %s', (input) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test.each(['vs.', 'v.s.'])('uses the same normalized following context after %s', (vs) => {
    for (const second of ['(It is clearer.)', '[It is clearer.]', '{It is clearer.}']) {
      const first = `The abbreviation ${vs}`;
      const third = 'Alice replied.';
      const input = `${first} ${second} ${third}`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([first, second, third]);
      }
      expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
        first.toLowerCase(),
        second.toLowerCase(),
        third.toLowerCase(),
      ]);
    }
    const comparison = `Android ${vs} (Windows is common.) mattered.`;
    expect(rouge.sentenceSegment(comparison)).toEqual([comparison]);
    expect(rouge.sentenceSegment(comparison, { caseNeutral: true })).toEqual([comparison]);
  });

  test('scans repeated backtick literals without reusing literal angle operators', () => {
    const first = `Use ${'`a < b` '.repeat(10_000).trimEnd()}.`;
    const input = `${first} He wrote "vs." Alice replied > 3.`;
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([
      first,
      'He wrote "vs."',
      'Alice replied > 3.',
    ]);
  }, 3000);
});

describe('Paired outer quotation context for versus boundaries', () => {
  test.each(['vs.', 'v.s.'])('retains escaped literal brackets around %s', (versus) => {
    for (const slashCount of [1, 3]) {
      const input = `He noted ("literal ${'\\'.repeat(slashCount)}" ) sign" and "${versus}" Examples followed) today.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
    }
  });

  test.each(['vs.', 'v.s.'])(
    'preserves the pending ASCII/Treebank outer quote for %s',
    (versus) => {
      const inputs = [
        `He said "The abbreviation is \`\`${versus} '' Examples" today.`,
        `He said \`\`The abbreviation is "${versus}" Examples'' today.`,
      ];
      for (const input of inputs) {
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        }
      }
    },
  );

  test.each(['vs.', 'v.s.'])(
    'distinguishes paired and unmatched copular %s quotations',
    (versus) => {
      for (const closing of ['"', '']) {
        const first = `He said "The abbreviation is ${versus}`;
        const next = `Alice replied.${closing}`;
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(`${first} ${next}`, { caseNeutral })).toEqual(
            closing ? [`${first} ${next}`] : [first, next],
          );
        }
      }
    },
  );

  test.each([
    ['"', '"'],
    ["'", "'"],
    ['``', "''"],
    ['‘', '’'],
    ['“', '”'],
    ['«', '»'],
  ])('preserves a paragraph inside paired %s%s versus text', (opening, closing) => {
    for (const versus of ['vs.', 'v.s.']) {
      const input = `He said ${opening}Linux ${versus}\n\nWindows${closing} today.`;
      const expected = input.replace(/\s+/g, ' ');
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([expected]);
      }
    }
  });

  test('preserves an unquoted paragraph after versus', () => {
    const first = 'He said Linux vs.';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first}\n\nWindows today.`, { caseNeutral })).toEqual([
        first,
        'Windows today.',
      ]);
    }
  });

  test('keeps quote endpoint metadata aligned across many candidate boundaries', () => {
    const first = 'He said “Linux vs. Windows” today.';
    const input = `${'He said “Linux vs.\n\nWindows” today. '.repeat(5000)}Next.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
        ...new Array(5000).fill(first),
        'Next.',
      ]);
    }
  });
});

describe('Standalone versus pronoun continuations', () => {
  test.each([
    'He-Man',
    'She-Hulk',
    'He‐Man',
    'She–Hulk',
    'Héctor',
    'Héctor',
    'He\u200cMan',
    'ſhe-Hulk',
    'ſhe',
  ])('retains comparison opponent %s', (opponent) => {
    for (const versus of ['vs.', 'v.s.']) {
      const input = `Batman ${versus} ${opponent} won.`;
      expect(rouge.sentenceSegment(input)).toEqual([input]);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([input]);
      expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
        input.toLowerCase(),
      ]);
    }
  });

  test.each(['He won.', "He'll win.", 'He’s ready.', 'They agreed.', 'This is clearer.'])(
    'retains the genuine pronoun continuation %s',
    (next) => {
      for (const versus of ['vs.', 'v.s.']) {
        const first = `Batman ${versus}`;
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(`${first} ${next}`, { caseNeutral })).toEqual([first, next]);
        }
      }
    },
  );
});

describe('Paired single-backtick literals inside versus brackets', () => {
  test.each([
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
    ['<', '>'],
  ])('keeps literal %s%s marks inside the surrounding enclosure', (opening, closing) => {
    for (const versus of ['vs.', 'v.s.']) {
      for (const literal of [opening, closing]) {
        const input = `He noted ${opening}\`literal ${literal}\` and "${versus}" Examples followed${closing} today.`;
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        }
      }
    }
  });

  test('releases a completed surrounding bracket after a paired literal', () => {
    for (const versus of ['vs.', 'v.s.']) {
      const first = `He noted (\`literal )\` and "${versus}")`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`${first} Examples followed.`, { caseNeutral })).toEqual([
          first,
          'Examples followed.',
        ]);
      }
    }
  });

  test('keeps unmatched single backticks under the existing delimiter rules', () => {
    for (const versus of ['vs.', 'v.s.']) {
      const first = `He noted (\`literal ) and "${versus}"`;
      for (const caseNeutral of [false, true]) {
        expect(
          rouge.sentenceSegment(`${first} Examples followed) today.`, { caseNeutral }),
        ).toEqual([first, 'Examples followed) today.']);
      }
    }
  });
});

describe('Single guillemets inside versus brackets', () => {
  test.each([
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
    ['<', '>'],
  ])('keeps quoted %s%s marks separate from the surrounding enclosure', (opening, closing) => {
    for (const versus of ['vs.', 'v.s.']) {
      for (const caseNeutral of [false, true]) {
        for (const literal of [opening, closing]) {
          const input = `He noted ${opening}‹literal ${literal}› and "${versus}" Examples followed${closing} today.`;
          expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        }
        const first = `He noted ${opening}‹literal ${closing}› and "${versus}"${closing}`;
        expect(rouge.sentenceSegment(`${first} Examples followed.`, { caseNeutral })).toEqual([
          first,
          'Examples followed.',
        ]);
      }
    }
  });

  test('keeps unmatched guillemets under the existing delimiter rules', () => {
    for (const versus of ['vs.', 'v.s.']) {
      const first = `He noted (‹literal ) and "${versus}"`;
      for (const caseNeutral of [false, true]) {
        expect(
          rouge.sentenceSegment(`${first} Examples followed) today.`, { caseNeutral }),
        ).toEqual([first, 'Examples followed) today.']);
      }
    }
  });

  test.each([0, 1, 2, 3, 4])(
    'retains paired guillemet openers and closer escape parity with %i backslashes',
    (count) => {
      for (const versus of ['vs.', 'v.s.']) {
        const escaped = '\\'.repeat(count);
        const opening = `He noted (${escaped}‹literal )› and "${versus}"`;
        const closing = `He noted (‹literal ${escaped}› ) remains› and "${versus}"`;
        const tail = 'Examples followed) today.';
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(`${opening} ${tail}`, { caseNeutral })).toEqual([
            `${opening} ${tail}`,
          ]);
          expect(rouge.sentenceSegment(`${closing} ${tail}`, { caseNeutral })).toEqual(
            count % 2 === 0 ? [closing, tail] : [`${closing} ${tail}`],
          );
        }
      }
    },
  );
});

describe('Escaped bracket context before versus boundaries', () => {
  test.each([
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
    ['<', '>'],
  ])('preserves odd/even escape parity for %s%s', (opening, closing) => {
    for (const versus of ['vs.', 'v.s.']) {
      for (const caseNeutral of [false, true]) {
        const odd = `He noted ${opening}literal \\${closing} and "${versus}" Examples followed${closing} today.`;
        expect(rouge.sentenceSegment(odd, { caseNeutral })).toEqual([odd]);
        const first = `He noted ${opening}literal \\\\${closing} and "${versus}"`;
        expect(
          rouge.sentenceSegment(`${first} Examples followed${closing} today.`, { caseNeutral }),
        ).toEqual([first, `Examples followed${closing} today.`]);
      }
    }
  });

  test('bounds escape scans to actual bracket marks', () => {
    const input = `He noted (literal ${'\\'.repeat(40_001)}) and "v.s." Examples followed) today.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });
});

describe('German quotation pairs in versus bracket context', () => {
  test.each([
    '„literal )“',
    '‚literal )‘',
    '„“literal )” remains“',
    '‚‘literal )’ remains‘',
    '„“inner” literal )“',
    '‚‘inner’ literal )‘',
    '“„literal )“ and more”',
    '‘‚literal )‘ and more’',
  ])('preserves the surrounding bracket around %s', (quoted) => {
    for (const versus of ['vs.', 'v.s.']) {
      const input = `He noted (${quoted} and "${versus}" Examples followed) today.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
    }
  });

  test.each(['„literal )“', '‚literal )‘'])(
    'releases completed brackets after %s without borrowing later independent quotes',
    (quoted) => {
      const first = `He noted (${quoted} and "v.s.")`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`${first} He said “Done.”`, { caseNeutral })).toEqual([
          first,
          'He said “Done.”',
        ]);
      }
    },
  );

  test('uses the same quote endpoints in the paired-angle prepass', () => {
    for (const caseNeutral of [false, true]) {
      const input = 'He noted <„“inner” literal >“ and "v.s." Examples followed> today.';
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });
});

describe('Attached quoted literals after a greater-than symbol', () => {
  test.each([
    '<p>"The options are a) Alpha and b) Beta."</p>',
    "<p>'The dogs' options a) Alpha and b) Beta.'</p>",
    "<p>'99 options a) Alpha and b) Beta.'</p>",
    'x >"The options are a) Alpha and b) Beta."',
  ])('keeps list labels inside the quoted literal in %s', (input) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test('retains later ordinary lists after attached quotations', () => {
    const first = '<p>"a) Alpha b) Beta"</p> Options:';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} a) First b) Last.`, { caseNeutral })).toEqual([
        first,
        'a) First',
        'b) Last.',
      ]);
      expect(rouge.sentenceSegment('x >5" a) Alpha b) Beta', { caseNeutral })).toEqual([
        'x >5"',
        'a) Alpha',
        'b) Beta',
      ]);
      expect(
        rouge.sentenceSegment("x >'99, a) Alpha b) Beta. He said 'go'.", { caseNeutral }),
      ).toEqual(["x >'99,", 'a) Alpha', 'b) Beta.', "He said 'go'."]);
    }
  });
});

test('retains numeric hostname components inside right-double quotation marks', () => {
  for (const caseNeutral of [false, true]) {
    for (const input of ['”www.example.com.1”', 'See ”www.example.com.1” Next.']) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  }
});

test('preserves hostname casing and complete-label evidence', () => {
  expect(rouge.sentenceSegment('See example.Com.1 Next.')).toEqual([
    'See example.',
    'Com.1',
    'Next.',
  ]);
  expect(rouge.sentenceSegment('See example.Com.1 Next.', { caseNeutral: true })).toEqual([
    'See example.Com.1 Next.',
  ]);
  expect(rouge.sentenceSegment('See example.Com.org.1 Next.')).toEqual([
    'See example.',
    'Com.org.1 Next.',
  ]);
  expect(rouge.sentenceSegment('See example.company.1 Next.')).toEqual([
    'See example.company.1',
    'Next.',
  ]);
});

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test.each([
      ['“', '”'],
      ['‘', '’'],
    ])('recognizes typographic quotation pairs %s%s without changing text', (open, close) => {
      const first = `${open}Alpha.${close}`;
      const second = `${open}Beta.${close}`;
      expect(ss(`${first} ${second}`)).toEqual([first, second]);
      expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
      expect(rouge.l(`${first} ${second}`, `${second} ${first}`)).toBe(1);
      expect(ss(`We invested in ${open}Acme Co.\nInternational Holdings${close} today.`)).toEqual([
        `We invested in ${open}Acme Co. International Holdings${close} today.`,
      ]);
    });

    test.each(['Class of ’99', 'Rock ’n’ roll', 'The students’ work'])(
      'does not open a quotation for an apostrophe in %s',
      (prefix) => {
        const input = `${prefix} etc.\nNext sentence.`;
        const expected = [`${prefix} etc.`, 'Next sentence.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each(['And go.', 'Before dawn.', 'To work.'])(
      'recognizes a new single-curly quotation beginning with %s',
      (continuation) => {
        const input = `‘First.’ ‘${continuation}’`;
        const expected = ['‘First.’', `‘${continuation}’`];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test.each([
      ['"', '"', '“', '”'],
      ['“', '”', '"', '"'],
      ["'", "'", '‘', '’'],
      ['‘', '’', "'", "'"],
    ])('preserves the outer %s%s quotation around %s%s', (open, close, innerOpen, innerClose) => {
      const input = `We invested in ${open}The ${innerOpen}Acme${innerClose} Co.\nInternational Holdings${close} today.`;
      const expected = `We invested in ${open}The ${innerOpen}Acme${innerClose} Co. International Holdings${close} today.`;
      expect(ss(input)).toEqual([expected]);
      expect(segmentCaseNeutrally(input)).toEqual([expected]);
    });

    test.each(['’Twas the night.', '’99 was a year.'])(
      'recognizes the sentence beginning with %s',
      (sentence) => {
        expect(ss(`“Stop.” ${sentence}`)).toEqual(['“Stop.”', sentence]);
        expect(segmentCaseNeutrally(`“Stop.” ${sentence}`)).toEqual(['“Stop.”', sentence]);
      },
    );

    test.each(['—', '–', ';'])('closes a single-curly quotation before %s', (punctuation) => {
      const first = `The term ‘class’${punctuation}see Acme Co.`;
      expect(ss(`${first}\nNext sentence.`)).toEqual([first, 'Next sentence.']);
      expect(segmentCaseNeutrally(`${first}\nNext sentence.`)).toEqual([first, 'Next sentence.']);
    });

    test('closes spaced smart quotes and nested bracketed quotations', () => {
      expect(ss('He said “Stop. ” Next.')).toEqual(['He said “Stop. ”', 'Next.']);
      expect(ss('He said ‘Stop. ’ Next.')).toEqual(['He said ‘Stop. ’', 'Next.']);
      expect(ss('She said ‘The students’ protest ended. ’ Next.')).toEqual([
        'She said ‘The students’ protest ended. ’',
        'Next.',
      ]);
      expect(ss('He said “The students’ protest. ” Next.')).toEqual([
        'He said “The students’ protest. ”',
        'Next.',
      ]);
      expect(ss('He said “She called ‘Stop.’ ” Next.')).toEqual([
        'He said “She called ‘Stop.’ ”',
        'Next.',
      ]);
      expect(ss('She said ‘Don’t stop. ’ Next.')).toEqual(['She said ‘Don’t stop. ’', 'Next.']);
      expect(ss('She said ‘Rock ’n’ roll! ’ Next.')).toEqual([
        'She said ‘Rock ’n’ roll! ’',
        'Next.',
      ]);
      expect(ss('He said “(Stop.)” Next.')).toEqual(['He said “(Stop.)”', 'Next.']);
      expect(ss('Use etc.\n“Next sentence.”')).toEqual(['Use etc.', '“Next sentence.”']);
      expect(ss('She said “Don’t stop.” Next.')).toEqual(['She said “Don’t stop.”', 'Next.']);
    });

    test('retains smart-single possessives across chunk boundaries', () => {
      const input = '‘The students’ protest at Acme Co.\nInternational Holdings.’';
      const expected = ['‘The students’ protest at Acme Co. International Holdings.’'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      ['The students’ work continues.', ['The students’ work continues.']],
      ['John’s car.', ['John’s car.']],
      [
        'Next sentence. The children’s protest continued.',
        ['Next sentence.', 'The children’s protest continued.'],
      ],
      ['Next sentence. ‘Another.’', ['Next sentence.', '‘Another.’']],
    ] as const)(
      'does not borrow a later apostrophe from %s to close a quotation',
      (continuation, sentences) => {
        const first = 'He called it ‘Success’ before we use etc.';
        const input = `${first}\n${continuation}`;
        const expected = [first, ...sentences];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test('uses conservative boundaries when both smart-single candidates end in s', () => {
      const input = 'She cited ‘The students’ work at Acme Co.\nInternational Holdings’ yesterday.';
      const expected = [
        'She cited ‘The students’ work at Acme Co.',
        'International Holdings’ yesterday.',
      ];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test('closes nested smart quotations before a wrapped abbreviation', () => {
      const first = 'He said “She called ‘Stop.’” before we use etc.';
      expect(ss(`${first}\nNext.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first}\nNext.`)).toEqual([first, 'Next.']);
    });

    test.each(['The U.S.’ Economy grew.', 'The U.S.’s Economy grew.', 'The U.S.’S Economy grew.'])(
      'keeps unquoted abbreviation possessives inside a sentence: %s',
      (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      },
    );

    test.each(["'Twas", "'99"])(
      'preserves line breaks after the straight-apostrophe elision %s',
      (elision) => {
        const first = `${elision} etc.`;
        const input = `${first}\nNext sentence.`;
        expect(ss(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
      },
    );

    test.each([
      ['The “U.S.” Economy grew.', '"'],
      ['the firm “acme co.” grew.', '"'],
      ['The ‘U.S.’ Economy grew.', "'"],
      ['the firm ‘acme co.’ grew.', "'"],
    ])('keeps quoted-abbreviation rules consistent across quote styles: %s', (input, quote) => {
      const straightQuotes = (text: string): string => text.replace(/[“”‘’]/g, quote);
      for (const caseNeutral of [false, true]) {
        for (const text of [input, input.toLowerCase()]) {
          expect(ss(text, { caseNeutral }).map(straightQuotes)).toEqual(
            ss(straightQuotes(text), { caseNeutral }),
          );
        }
      }
    });

    test.each(['Bob left.', 'The office closed.', 'Yesterday was busy.', 'Did it close?'])(
      'retains a sentence after a quoted abbreviation before %s',
      (next) => {
        const first = 'The company is “Acme Co.”';
        const input = `${first} ${next}`;
        expect(ss(input)).toEqual([first, next]);
        expect(segmentCaseNeutrally(input)).toEqual([first, next]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          next.toLowerCase(),
        ]);
      },
    );

    test.each(['Class of ‘99', '‘Twas', '‘Tis'])(
      'does not open an unmatched quotation for the elision %s',
      (elision) => {
        const first = `${elision} etc.`;
        const input = `${first}\nNext sentence. ‘Another.’`;
        const expected = [first, 'Next sentence.', '‘Another.’'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
        expect(ss(`${first}\nNext sentence.`)).toEqual(expected.slice(0, 2));
      },
    );

    test.each(['Class of ‘99', '‘Twas', '‘Tis'])(
      'does not pair leading elision %s with a later ambiguous possessive',
      (leading) => {
        const first = `${leading} at Acme Co.`;
        const second = 'James’ book followed.';
        const input = `${first}\n${second}`;
        expect(ss(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
      },
    );

    test('preserves a paired quotation starting with an abbreviated year', () => {
      const input = 'She said ‘99 etc.\nMore notes.’';
      const expected = ['She said ‘99 etc. More notes.’'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['‘Twas', '‘Tis', '‘em', '‘99', '‘Cause', '‘Til', '‘Till'])(
      'retains an outer quotation around the leading elision %s',
      (elision) => {
        const input = `she said ‘use Acme Co.\n${elision} wisely.’`;
        const expected = [input.replaceAll('\n', ' ')];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test('retains a possessive candidate before a left-curly elision', () => {
      const input = 'she said ‘the students’ project uses Acme Co.\n‘99 materials.’';
      const expected = [input.replaceAll('\n', ' ')];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('does not borrow an unquoted possessive to classify a later year quotation', () => {
      const first = 'The students’ work.';
      const quotation = '‘99 etc.\nMore notes.’';
      const input = `${first} ${quotation}`;
      const expected = [first, quotation.replaceAll('\n', ' ')];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['’Twas', '’Tis', '’em', '’99', '’Cause', '’Til', '’Till'])(
      'retains sentence-initial elision %s inside an outer smart quotation',
      (elision) => {
        const first = 'She said ‘First.';
        const second = `${elision} Acme Co.\nInternational Holdings.’`;
        const input = `${first} ${second} Next.`;
        const expected = [`${first} ${second.replaceAll('\n', ' ')}`, 'Next.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test('keeps a right-curly year elision inside a quotation after a word', () => {
      const first = 'She said ‘Use the ’90s style.';
      const second = 'Keep it.’';
      const input = `${first} ${second} Next.`;
      const expected = [`${first} ${second}`, 'Next.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
      const wrapped = 'She said ‘Use the ’90s Acme Co.\nInternational style.’ Next.';
      const joined = ['She said ‘Use the ’90s Acme Co. International style.’', 'Next.'];
      expect(ss(wrapped)).toEqual(joined);
      expect(segmentCaseNeutrally(wrapped)).toEqual(joined);
    });

    test('attaches the outer closer after a possessive followed by a period', () => {
      const first = 'She said ‘the students’.’';
      const input = `${first} Next.`;
      expect(ss(input)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'next.']);
    });

    test('keeps a possessive before punctuation inside a smart double quotation', () => {
      const first = 'He said “the students’.”';
      const input = `${first} Next.`;
      expect(ss(input)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
    });

    test.each(['.', ',', ';', ':'])(
      'retains a quoted possessive before %s punctuation',
      (punctuation) => {
        const first = `‘That book is James’${punctuation}`;
        const input = `${first} We use Acme Co.\nInternational Holdings.’`;
        const second = 'We use Acme Co. International Holdings.’';
        const expected = [`${first} ${second}`];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test.each([
      ['‘', '’'],
      ['“', '”'],
    ])('preserves independent sentences inside %s%s quotes across a wrap', (open, close) => {
      const first = `${open}I live in the U.S.`;
      for (const question of [
        'How about you?',
        'Was it useful?',
        'Can you help?',
        'Will you help?',
        'Should you help?',
      ]) {
        const second = `${question}${close}`;
        const input = `${first}\n${second}`;
        const expected = [first, second];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
        expect(ss(input.replaceAll('\n', ' '))).toEqual([`${first} ${second}`]);
      }
    });

    test.each(['was founded in 1990.', 'is growing.', 'has expanded.'])(
      'retains a quoted abbreviation wrap before the predicate %s',
      (predicate) => {
        const input = `She said “Acme Co.\n${predicate}”`;
        const expected = [input.replaceAll('\n', ' ')];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test('keeps the conservative name-led wrap rule inside an open quotation', () => {
      const first = '‘I live in the U.S.';
      const second = 'Bob moved away.’';
      const input = `${first}\n${second}`;
      const joined = [`${first} ${second}`];
      expect(ss(input)).toEqual(joined);
      expect(segmentCaseNeutrally(input)).toEqual(joined);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        joined.map((sentence) => sentence.toLowerCase()),
      );
      expect(ss(`${first} ${second}`)).toEqual(joined);
    });

    test.each(['‘Stop. ’', '‘(Stop.) ’'])(
      'attaches a spaced closer before an unspaced sentence after %s',
      (first) => {
        const input = `${first}Next.`;
        expect(ss(input)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'next.']);
      },
    );

    test.each(['Hawai‘i', 'don‘t', 'á‘b', '𝒜‘b'])(
      'does not open a quotation at a word-internal left apostrophe: %s',
      (word) => {
        const first = `${word} etc.`;
        const input = `${first}\nNext sentence.`;
        expect(ss(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          'next sentence.',
        ]);
      },
    );

    test('keeps an outer quotation open through a word-internal left apostrophe', () => {
      const input =
        'She described ‘the students’ Hawai‘i project at Acme Co.\nInternational site’ today.';
      const expected = [
        'She described ‘the students’ Hawai‘i project at Acme Co. International site’ today.',
      ];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      ['The company is “Acme Co.”', 'It closed yesterday.'],
      ['He lives in the “U.S.”', 'How about you?'],
      ['The company is ‘Acme Co.’', 'It closed yesterday.'],
      ['He lives in the ‘U.S.’', 'How about you?'],
    ])('retains a sentence after the quoted abbreviation in %s', (first, second) => {
      const input = `${first} ${second}`;
      const expected = [first, second];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['()', '[]', '{}', '<>'])(
      'retains an unspaced sentence after bracketed smart quotation %s',
      (brackets) => {
        const first = `He said ‘${brackets[0]}Stop.${brackets[1]}’`;
        const input = `${first}Next.`;
        const expected = [first, 'Next.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'next.']);
      },
    );

    test.each(['times', 'Times'])(
      'keeps an unspaced numeric continuation before %s attached to a quote',
      (word) => {
        const input = `He repeated “Stop!”2${word}.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      },
    );

    test.each(['(formerly Smith Inc.)', '(New York branch)'])(
      'retains the parenthetical continuation %s after a quoted abbreviation',
      (continuation) => {
        for (const [open, close] of [
          ['‘', '’'],
          ['“', '”'],
        ]) {
          for (const separator of ['', ' ', '\t']) {
            const input = `He works at ${open}Acme Co.${close}${separator}${continuation} today.`;
            expect(ss(input)).toEqual([input]);
            expect(segmentCaseNeutrally(input)).toEqual([input]);
            expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
          }
        }
      },
    );

    test.each(['He said [“Stop.”] Next.', 'The winner was (she said “Wow!”) Alice Smith.'])(
      'keeps quote-inside-bracket heuristics consistent across quote styles: %s',
      (input) => {
        const straightQuotes = (text: string): string => text.replace(/[“”]/g, '"');
        for (const caseNeutral of [false, true]) {
          expect(ss(input, { caseNeutral }).map(straightQuotes)).toEqual(
            ss(straightQuotes(input), { caseNeutral }),
          );
        }
      },
    );

    test.each([
      ["'", "'"],
      ['‘', '’'],
    ])('recognizes a neutral continuation-word start inside %s%s quotes', (open, close) => {
      const first = 'He said "No."';
      const second = `${open}and more work.${close}`;
      const input = `${first} ${second}`;
      expect(segmentCaseNeutrally(input)).toEqual([first, second]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
        first.toLowerCase(),
        second.toLowerCase(),
      ]);
    });

    test('keeps modifier letters within contraction words', () => {
      const input = 'She said ‘l’ᵃmour at Acme Co.\nInternational Holdings.’';
      const expected = [input.replaceAll('\n', ' ')];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([' ', '\n'])(
      'recognizes a parenthetical sentence after a quoted abbreviation with separator %j',
      (separator) => {
        const first = 'The company is “Acme Co.”';
        for (const second of ['(It closed.)', '(The office closed.)', '(Bob left.)']) {
          expect(ss(`${first}${separator}${second}`)).toEqual([first, second]);
          expect(segmentCaseNeutrally(`${first}${separator}${second}`)).toEqual([first, second]);
          expect(segmentCaseNeutrally(`${first}${separator}${second}`.toLowerCase())).toEqual([
            first.toLowerCase(),
            second.toLowerCase(),
          ]);
          const straightFirst = first.replace(/[“”]/g, '"');
          expect(ss(`${straightFirst}${separator}${second}`)).toEqual([straightFirst, second]);
          expect(segmentCaseNeutrally(`${straightFirst}${separator}${second}`)).toEqual([
            straightFirst,
            second,
          ]);
        }
        const continuation = `${first}${separator}(It owns subsidiaries) today.`;
        expect(ss(continuation)).toEqual([continuation.replaceAll('\n', ' ')]);
        expect(segmentCaseNeutrally(continuation)).toEqual([continuation.replaceAll('\n', ' ')]);
      },
    );

    test.each(['yesterday.', 'with his brother.', 'after the meeting.'])(
      'retains a parenthetical interruption before the outer continuation %s',
      (tail) => {
        for (const [open, close] of [
          ['“', '”'],
          ['‘', '’'],
          ['"', '"'],
        ]) {
          for (const separator of [' ', '\n']) {
            const input = `He joined ${open}Acme Co.${close}${separator}(Was it the right choice?) ${tail}`;
            const expected = input.replaceAll('\n', ' ');
            expect(ss(input)).toEqual([expected]);
            expect(segmentCaseNeutrally(input)).toEqual([expected]);
            expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([expected.toLowerCase()]);
          }
        }
      },
    );

    test.each(['He left.', 'Was it worth it?', 'In fact, he stayed.'])(
      'recognizes a separate parenthetical before the independent sentence %s',
      (third) => {
        const first = 'He joined “Acme Co.”';
        const second = '(Was it the right choice?)';
        const input = `${first} ${second} ${third}`;
        expect(ss(input)).toEqual([first, second, third]);
        expect(segmentCaseNeutrally(input)).toEqual([first, second, third]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          [first, second, third].map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test.each([
      ['“', '”'],
      ['‘', '’'],
    ])('attaches a pending straight single closer before adjacent %s%s', (open, close) => {
      const first = "He said 'Stop.'";
      const second = `${open}Next.${close}`;
      const input = `${first}${second}`;
      expect(ss(input)).toEqual([first, second]);
      expect(segmentCaseNeutrally(input)).toEqual([first, second]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
        first.toLowerCase(),
        second.toLowerCase(),
      ]);
      const nested = `'${open}Beta.${close}'`;
      expect(ss(`Alpha.${nested}`)).toEqual(['Alpha.', nested]);
      expect(segmentCaseNeutrally(`Alpha.${nested}`)).toEqual(['Alpha.', nested]);
    });

    test('requires a paired single quote before attaching a closing apostrophe', () => {
      const unmatched = 'He said Stop.’ Next.';
      const possessive = 'The U.S.’ Economy grew.';
      for (const caseNeutral of [false, true]) {
        expect(ss(unmatched, { caseNeutral })).toEqual([unmatched]);
        expect(ss(possessive, { caseNeutral })).toEqual([possessive]);
        expect(ss('He said ‘Stop.’ Next.', { caseNeutral })).toEqual(['He said ‘Stop.’', 'Next.']);
      }
    });

    test.each(['Stop.”', 'He said "Stop.”'])(
      'retains a stray closing mark with its preceding text: %s',
      (first) => {
        expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
      },
    );

    test.each(['“Stop!” she shouted.', 'He asked “Why?” repeatedly.'])(
      'keeps dialogue-tag heuristics consistent across quote styles: %s',
      (input) => {
        const straightQuotes = (text: string): string => text.replace(/[“”]/g, '"');
        expect(ss(input)).toEqual([input]);
        const expected = segmentCaseNeutrally(straightQuotes(input));
        expect(segmentCaseNeutrally(input).map(straightQuotes)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase()).map(straightQuotes)).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test.each(['6', '𝟞'])('does not use a later %s-feet mark as a quotation closer', (feet) => {
      const first = 'The label ‘Success’ appears in Calif.';
      const second = `The board is ${feet}’ wide.`;
      const input = `${first}\n${second}`;
      expect(ss(input)).toEqual([first, second]);
      expect(segmentCaseNeutrally(input)).toEqual([first, second]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
        first.toLowerCase(),
        second.toLowerCase(),
      ]);
    });

    test.each(['.', '!', '?'])(
      'retains an unspaced sentence after a %s smart closer',
      (terminal) => {
        const first = `He said ‘Stop${terminal}’`;
        const input = `${first}Next sentence.`;
        expect(ss(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          'next sentence.',
        ]);
      },
    );

    test.each([
      ['He said ‘Stop.’', '“Next.”'],
      ['He said “Stop.”', '‘Next.’'],
      ['He said “Stop.”', '“Next.”'],
      ['He said ‘Stop.’', '(Next.)'],
      ['He said ‘Stop.’', '"Next."'],
      ['He said “Stop.”', '"Next."'],
    ])('separates %s from an adjacent delimited sentence', (first, second) => {
      const input = `${first}${second}`;
      const expected = [first, second];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['s', 'S'])('retains the ’%s contraction after a quoted acronym', (contraction) => {
      const input = `‘The U.S.’${contraction} Economy grew.’`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each(['U.S.', 'U.S.A.', 'E.U.'])(
      'preserves a quoted possessive after the acronym %s',
      (acronym) => {
        const input = `‘The ${acronym}’ Economy grew.’`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      },
    );

    test.each(['.', '?', '!'])(
      'recovers an unmatched immediate ASCII closer after %s before whitespace',
      (terminal) => {
        const first = `He left${terminal}"`;
        for (const separator of [' ', '\t', '\n', '\r\n']) {
          const input = `${first}${separator}Next.`;
          expect(ss(input)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'next.']);
        }
      },
    );

    test('retains casing and EOF policy when recovering an unmatched ASCII closer', () => {
      expect(ss('He left." next.')).toEqual(['He left." next.']);
      expect(ss('He left."')).toEqual(['He left."']);
      expect(segmentCaseNeutrally('He left."')).toEqual(['He left."']);
      const input = 'He left." Next Co.\nHe stayed.';
      const expected = ['He left."', 'Next Co.', 'He stayed.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      ['He left."Next."', ['He left.', '"Next."']],
      ['He left. "Next."', ['He left.', '"Next."']],
      ['He said "Stop." Next.', ['He said "Stop."', 'Next.']],
      ['He said “Stop.”" Next."', ['He said “Stop.”" Next."']],
      ['He said "Stop?"²" Next."', ['He said "Stop?"²', '" Next."']],
      ['He said "Stop?"²"2 people agreed."', ['He said "Stop?"²', '"2 people agreed."']],
    ])('preserves pending closers and subsequent openers in %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((part) => part.toLowerCase()),
      );
    });

    test.each(['First.', '“First.”', '‘First.’', '"First."'])(
      'recognizes an adjacent Treebank opener after %s',
      (first) => {
        const second = "``Next.''";
        expect(ss(first + second)).toEqual([first, second]);
        expect(segmentCaseNeutrally(first + second)).toEqual([first, second]);
        expect(segmentCaseNeutrally((first + second).toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
      },
    );

    test.each(["`Next.'", "```Next.'''"])(
      'does not treat the unsupported backtick run %s as a paired opener',
      (tail) => {
        const input = `First.${tail}`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      },
    );

    test('preserves casing and numeric policy after an adjacent Treebank opener', () => {
      expect(ss("First.``next.''")).toEqual(["First.``next.''"]);
      expect(ss("First.``2 people agreed.''")).toEqual(['First.', "``2 people agreed.''"]);
      expect(segmentCaseNeutrally("First.``2 people agreed.''")).toEqual([
        'First.',
        "``2 people agreed.''",
      ]);
      const company = "We use Acme Co.``International Holdings.''";
      expect(ss(company)).toEqual([company]);
      expect(segmentCaseNeutrally(company)).toEqual([company]);
      expect(segmentCaseNeutrally(company.toLowerCase())).toEqual([company.toLowerCase()]);
    });

    test.each([
      ['‘', '’'],
      ['“', '”'],
    ])('carries %s%s quotation state across sentences', (open, close) => {
      const input = `${open}First. We use Acme Co.\nInternational Holdings.${close}`;
      const expected = [input.replaceAll('\n', ' ')];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });
  });
});

describe('Quotation continuation ownership across parser features', () => {
  test('retains a separated year elision inside a confirmed quotation', () => {
    const first = 'She said ‘First. ’99 Acme Co. International Holdings.’';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
      expect(rouge.sentenceSegment('‘U.S.’12‘Next.’', { caseNeutral })).toEqual([
        '‘U.S.’12',
        '‘Next.’',
      ]);
      expect(rouge.sentenceSegment('She said ‘First.’[99] Next.', { caseNeutral })).toEqual([
        'She said ‘First.’[99]',
        'Next.',
      ]);
    }
  });

  test('keeps auxiliary lookahead inside the same confirmed elision span', () => {
    const first = 'She said ‘"No." Was Alpha. ’99 Beta? Next.’';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Tail.`, { caseNeutral })).toEqual([first, 'Tail.']);
    }
  });

  test.each([
    ['‘', '’'],
    ['“', '”'],
  ])('does not let a title override an independent attached parenthetical %s%s', (open, close) => {
    const title = `He said ${open}Dr.${close}`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${title}(Bob left.)`, { caseNeutral })).toEqual([
        title,
        '(Bob left.)',
      ]);
      const inline = `${title}(the physician) yesterday.`;
      expect(rouge.sentenceSegment(inline, { caseNeutral })).toEqual([inline]);
      const name = `${title}“Smith”.`;
      expect(rouge.sentenceSegment(name, { caseNeutral })).toEqual([name]);
    }
  });

  test('preserves the one-word tail ambiguity only when case is ignored', () => {
    const input = 'He said “Dr.”(It closed.) Done.';
    expect(rouge.sentenceSegment(input)).toEqual(['He said “Dr.”', '(It closed.)', 'Done.']);
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([input]);
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('He said “Dr.”(It closed.) Bob left.', { caseNeutral })).toEqual(
        ['He said “Dr.”', '(It closed.)', 'Bob left.'],
      );
    }
  });

  test('keeps contiguous alphanumeric tails distinct from grouped citations', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('“Stop?”2Next.', { caseNeutral })).toEqual(['“Stop?”2Next.']);
      expect(rouge.sentenceSegment('“Stop?”[2]Next.', { caseNeutral })).toEqual([
        '“Stop?”[2]',
        'Next.',
      ]);
    }
  });

  test('checks ellipsis boundaries in the prospective question scope', () => {
    const prefix = 'She asked “Acme Co.';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${prefix}\nWhich Alpha... Next?”`, { caseNeutral })).toEqual([
        `${prefix} Which Alpha... Next?”`,
      ]);
      expect(
        rouge.sentenceSegment(`${prefix}\nWhich Alpha... (or Beta) did Alice choose?”`, {
          caseNeutral,
        }),
      ).toEqual([prefix, 'Which Alpha... (or Beta) did Alice choose?”']);
    }
  });

  test.each(['.[1]', '....[1]'])(
    'retains a validated citation %s while deciding a scoped question',
    (terminal) => {
      const prefix = 'She asked “Acme Co.';
      const question = `Which Alpha${terminal} or Beta?”`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`${prefix}\n${question}`, { caseNeutral })).toEqual([
          prefix,
          question,
        ]);
      }
    },
  );

  test.each(['²', '[2]', 'ᵃ'])(
    'uses the complete Treebank closer before a scoped question citation %s',
    (citation) => {
      const prefix = 'She asked “Acme Co.';
      const question = `Which \`\`What?''${citation}”`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`${prefix}\n${question}`, { caseNeutral })).toEqual([
          prefix,
          question,
        ]);
      }
    },
  );
});

describe('Abbreviation-final parenthetical ownership', () => {
  test.each([
    ['\n', '\n\n'],
    ['\r\n', '\r\n\r\n'],
    ['\r', '\r\r'],
    ['\n', '\n \t\n'],
    ['\n\n', ' '],
    ['\n', '\n'],
    [' ', ' '],
    ['', '\n\n'],
  ])('retains independent sentences around separators %j and %j', (before, after) => {
    for (const [open, close] of [
      ['“', '”'],
      ['‘', '’'],
      ['"', '"'],
    ]) {
      const expected = [
        `The company is ${open}Acme Co.${close}`,
        '(It acquired Smith Inc.)',
        'Next sentence.',
      ];
      const input = expected[0] + before + expected[1] + after + expected[2];
      expect(rouge.sentenceSegment(input)).toEqual(expected);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual(expected);
      expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    }
  });

  test.each(['', ' Bob left.'])('retains a complete long aside before tail %j', (tail) => {
    const first = 'The company is “Acme Co.”';
    const aside = `(It acquired ${'a'.repeat(180)} Inc.)`;
    const expected = [first, aside, ...(tail ? [tail.trim()] : [])];
    const input = `${first} ${aside}${tail}`;
    expect(rouge.sentenceSegment(input)).toEqual(expected);
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual(expected);
    expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual(
      expected.map((sentence) => sentence.toLowerCase()),
    );
  });

  test('retains a spaced abbreviation label and an outer continuation', () => {
    for (const input of [
      '“Acme Co.” ( Mr. ) Whose Mr.?',
      'He joined “Acme Co.” (formerly Smith Inc.) with his brother.',
      'He joined “Acme Co.” (formerly Smith Inc.) after the meeting.',
    ]) {
      expect(rouge.sentenceSegment(input)).toEqual([input]);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([input]);
    }
  });

  test.each(['(formerly Smith Inc.)', '(formerly Smith.)'])(
    'preserves mode-specific terminal-fragment treatment for %s',
    (aside) => {
      const first = 'The company is “Acme Co.”';
      const input = `${first} ${aside}`;
      expect(rouge.sentenceSegment(input)).toEqual([input]);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([first, aside]);
    },
  );
});
