import * as rouge from '../src/rouge';
import { expectBundledScriptToPass } from './helpers';

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    const lineBreaks = ['\n', '\r\n', '\r'];

    describe('ReDoS prevention', () => {
      test('bounds unmatched typographic quotation state within a constrained heap', () => {
        expectBundledScriptToPass(
          `
            const summary = '‘'.repeat(7000000);
            const sentences = module.exports.sentenceSegment(summary);
            if (sentences.length !== 1 || sentences[0] !== summary) {
              throw new Error('Unmatched quotation content changed');
            }
            process.stdout.write('ok');
          `,
          20_000,
          ['--max-old-space-size=64'],
        );
      }, 25_000);

      test('avoids an aside index when an unmatched quotation rules out the boundary', () => {
        expectBundledScriptToPass(
          `
            const summary = '‘'.repeat(7000000) + 'Alpha... (';
            const sentences = module.exports.sentenceSegment(summary);
            if (sentences.length !== 1 || sentences[0] !== summary) {
              throw new Error('Unmatched quotation continuation changed');
            }
            process.stdout.write('ok');
          `,
          20_000,
          ['--max-old-space-size=64'],
        );
      }, 25_000);
    });

    describe('edge cases', () => {
      test.each(["'", '‘', '’'])(
        'treats unpaired leading decade mark %s as an apostrophe',
        (mark) => {
          const first = `The ${mark}90s ended...`;
          const input = `${first} A new era began.`;
          expect(ss(input)).toEqual([first, 'A new era began.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'A new era began.']);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
            first.toLowerCase(),
            'a new era began.',
          ]);
        },
      );

      test.each([
        ["'", "'"],
        ['‘', '’'],
      ])('preserves paired %s%s decade quotations and internal elisions', (open, close) => {
        for (const input of [
          `${open}90s fashion... More followed.${close}`,
          `She said ${open}Use the ${close}90s style... Keep it.${close}`,
          `She said ${open}Use the ${close}em notes... Keep them.${close}`,
        ]) {
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
        }
      });

      test.each(['$100', '£100', '€100', '-5', '+5', '−5', '-$100', '+£5', '$-100', '€+5'])(
        'recognizes a prefixed numeric sentence after an ellipsis: %s',
        (number) => {
          for (const first of ['Alpha...', 'He said “Enough...”', '(Enough...)']) {
            const second = `${number} was the result.`;
            expect(ss(`${first} ${second}`)).toEqual([first, second]);
            expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
            expect(segmentCaseNeutrally(`${first} ${second}`.toLowerCase())).toEqual([
              first.toLowerCase(),
              second.toLowerCase(),
            ]);
          }
          const fragment = `Alpha... ${number} points.`;
          expect(ss(fragment)).toEqual([fragment]);
          expect(segmentCaseNeutrally(fragment)).toEqual([fragment]);
        },
      );

      test.each(['Tis true.', 'Twas odd.'])(
        'closes a quotation before the independent elision-shaped word %s',
        (second) => {
          const first = 'She said ‘Alpha...’';
          const third = 'He said ‘Beta...’';
          const input = `${first}${second} ${third} Next.`;
          const expected = [first, second, third, 'Next.'];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
            expected.map((part) => part.toLowerCase()),
          );
        },
      );

      test.each(['90s fashion', 'twas odd', 'em notes'])(
        'pairs nested elision-shaped quotes without borrowing required closers: %s',
        (words) => {
          const nested = `She said ‘Use ‘${words}... More.’ tail... Still inside.’ Next.`;
          expect(ss(nested)).toEqual([nested]);
          expect(segmentCaseNeutrally(nested)).toEqual([nested]);
          expect(segmentCaseNeutrally(nested.toLowerCase())).toEqual([nested.toLowerCase()]);

          const first = `The ‘${words} ended...`;
          const second = 'A new era ‘began quietly’ here.';
          expect(ss(`${first} ${second}`)).toEqual([first, second]);
          expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);

          const inside = `She said ‘Use ‘${words} with ‘plain notes’ here... Stay inside.’`;
          expect(ss(inside)).toEqual([inside]);
          expect(segmentCaseNeutrally(inside)).toEqual([inside]);
        },
      );

      test.each(['100 years have passed.', '100% of voters agreed.', '5 stars appeared.'])(
        'separates complete numeric clauses after quoted ellipses: %s',
        (second) => {
          for (const first of ['He said “Enough...”', "He said 'Enough...'", '(Enough...)']) {
            expect(ss(`${first} ${second}`)).toEqual([first, second]);
            expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
          }
          for (const fragment of ['100 years.', '100%.', '5 stars.']) {
            const input = `He said “Enough...” ${fragment}`;
            expect(ss(input)).toEqual([input]);
            expect(segmentCaseNeutrally(input)).toEqual([input]);
          }
        },
      );

      test.each(['„Outer “Inner... ” tail... “', '“Outer „Inner... “ tail... ”'])(
        'preserves paired English/German nesting through ellipses: %s',
        (first) => {
          const input = `${first} Next.`;
          expect(ss(input)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'next.']);
        },
      );

      test('closes German nesting before a later independent English quotation', () => {
        const expected = ['“Outer „Inner... “ tail... ”', 'Next “More...”', 'Final.'];
        const input = expected.join(' ');
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((part) => part.toLowerCase()),
        );
      });

      test.each([
        ['Alpha... Beta.', ['Alpha...', 'Beta.']],
        ['Alpha... "Beta."', ['Alpha...', '"Beta."']],
        ['Alpha... (Beta.)', ['Alpha...', '(Beta.)']],
        ['Alpha... 2024 was different.', ['Alpha...', '2024 was different.']],
        ['Alpha... 100% of voters agreed.', ['Alpha...', '100% of voters agreed.']],
        ['Alpha... 100 years have passed.', ['Alpha...', '100 years have passed.']],
        [
          'This is e.g. Mr. Smith, who talks slowly... And this is another sentence.',
          ['This is e.g. Mr. Smith, who talks slowly...', 'And this is another sentence.'],
        ],
      ])('recognizes terminal three-dot ellipses in %s', (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      });

      test.each(['Wait... what?', 'Wait... and then continued.'])(
        'keeps lowercase ellipsis continuations together in %s',
        (input) => {
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
        },
      );

      test.each([
        'She said, "I... I cannot go."',
        'She said, “I... I cannot go.”',
        'She said, ‘I can’t... Alpha.’',
        'She said, «I... Beta.»',
        'Er sagte: „Ich... Ich kann nicht.“',
        'We noted (Alpha... Beta) today.',
      ])('keeps three-dot ellipses inside surrounding delimiters: %s', (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test.each([
        'And the winner is... Alice Smith.',
        'And the winner will be... Alice Smith.',
        'The winner has been... Alice Smith.',
        'The winner is being... Alice Smith.',
        'I... I cannot go.',
      ])('keeps capitalized ellipsis continuations in the same sentence: %s', (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('separates adjacent %s%s quotations ending in ellipses', (open, close) => {
        const expected = [`He said ${open}Enough...${close}`, `${open}Later...${close}`, 'Final.'];
        const input = expected.join(' ');
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((part) => part.toLowerCase()),
        );
      });

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('separates an unspaced %s%s opening after a terminal ellipsis', (open, close) => {
        const input = `Alpha...${open}Beta...${close}`;
        const expected = ['Alpha...', `${open}Beta...${close}`];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((part) => part.toLowerCase()),
        );
        const ordinary = `Alpha.${open}Beta.${close}`;
        expect(ss(ordinary)).toEqual(['Alpha.', `${open}Beta.${close}`]);
        expect(segmentCaseNeutrally(ordinary)).toEqual(['Alpha.', `${open}Beta.${close}`]);
        const hesitation = `It was...${open}Beta...${close}`;
        expect(ss(hesitation)).toEqual([hesitation]);
        expect(segmentCaseNeutrally(hesitation)).toEqual([hesitation]);
      });

      test.each([
        'It was..."Beta..."',
        'He paused...“Perhaps,” before continuing.',
        'Wait...100 years.',
        'She said “Alpha...‘Beta...’ Gamma.”',
      ])('applies continuation rules after an empty ellipsis separator: %s', (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('closes terminal brackets inside %s%s quotations', (open, close) => {
        for (const [left, right] of [
          ['(', ')'],
          ['[', ']'],
          ['{', '}'],
          ['<', '>'],
        ]) {
          const first = `He said ${open}${left}Enough...${right}${close}`;
          const input = `${first} Next.`;
          expect(ss(input)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'next.']);
        }
        const continuation = `He said ${open}(Enough...) and left${close} today.`;
        expect(ss(continuation)).toEqual([continuation]);
        expect(segmentCaseNeutrally(continuation)).toEqual([continuation]);
      });

      test.each(['—', '–', '-'])(
        'closes an s-ending ASCII quotation before the dash %s',
        (dash) => {
          const first = `She chose 'Paris'${dash}Alice agreed...`;
          const input = `${first} Beta followed.`;
          expect(ss(input)).toEqual([first, 'Beta followed.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'Beta followed.']);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
            first.toLowerCase(),
            'beta followed.',
          ]);
          const possessive = `She said 'The students'${dash}all present${dash}work... Alpha mattered.'`;
          expect(ss(possessive)).toEqual([possessive]);
          expect(segmentCaseNeutrally(possessive)).toEqual([possessive]);
        },
      );

      test('retains four-dot precedence before an unspaced typographic quotation', () => {
        const input = 'It was....“Beta...”';
        expect(ss(input)).toEqual(['It was....', '“Beta...”']);
        expect(segmentCaseNeutrally(input)).toEqual(['It was....', '“Beta...”']);
      });

      test.each([
        "She said, 'The students' work... Alpha matters.'",
        "She said, 'James', the students' work... Alpha matters.'",
        "He paused... 'The students' work,' before answering.",
      ])('preserves ASCII possessives in ellipsis quotation context: %s', (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      });

      test.each([
        ['“I am done,” she said.', '“Perhaps,” before continuing.'],
        ["'I am done,' she said.", "'Perhaps,' before continuing."],
      ])('distinguishes a quoted reply from an inline aside: %s', (reply, aside) => {
        for (const segment of [ss, segmentCaseNeutrally]) {
          expect(segment(`He stopped... ${reply}`)).toEqual(['He stopped...', reply]);
          expect(segment(`He paused... ${aside}`)).toEqual([`He paused... ${aside}`]);
        }
      });

      test.each([',', ';', ':', ' —', '–'])(
        'retains connecting punctuation after an ellipsis aside: %s',
        (connector) => {
          const input = `He paused... (Perhaps deliberately)${connector} before answering.`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input.toUpperCase())).toEqual([input.toUpperCase()]);
        },
      );

      test.each([
        ['He paused... (Perhaps)—before answering.', ['He paused... (Perhaps)—before answering.']],
        ['He paused... (Perhaps)–before answering.', ['He paused... (Perhaps)–before answering.']],
        ['He paused... [Perhaps]—before answering.', ['He paused... [Perhaps]—before answering.']],
        ['He paused... [Perhaps]–before answering.', ['He paused... [Perhaps]–before answering.']],
        ['He paused... {Perhaps}—before answering.', ['He paused... {Perhaps}—before answering.']],
        ['He paused... {Perhaps}–before answering.', ['He paused... {Perhaps}–before answering.']],
        ['He paused... <Perhaps>—before answering.', ['He paused... <Perhaps>—before answering.']],
        ['He paused... <Perhaps>–before answering.', ['He paused... <Perhaps>–before answering.']],
        ['He paused... “Perhaps”—before answering.', ['He paused... “Perhaps”—before answering.']],
        ['He paused... “Perhaps”–before answering.', ['He paused... “Perhaps”–before answering.']],
        ['He paused... ‘Perhaps’—before answering.', ['He paused... ‘Perhaps’—before answering.']],
        ['He paused... ‘Perhaps’–before answering.', ['He paused... ‘Perhaps’–before answering.']],
        ['He paused... „Perhaps“—before answering.', ['He paused... „Perhaps“—before answering.']],
        ['He paused... „Perhaps“–before answering.', ['He paused... „Perhaps“–before answering.']],
        ["We noted ``Alpha... Beta'' today.", ["We noted ``Alpha... Beta'' today."]],
        ["We noted ''Alpha... Beta'' today.", ["We noted ''Alpha... Beta'' today."]],
        ["We noted '``Alpha... Beta'' tail' today.", ["We noted '``Alpha... Beta'' tail' today."]],
        ["We noted ``'Alpha... Beta' tail'' today.", ["We noted ``'Alpha... Beta' tail'' today."]],
        [
          "We noted ``the dogs' Alpha... Beta'' today.",
          ["We noted ``the dogs' Alpha... Beta'' today."],
        ],
        [
          'Er sagte: „Sie rief “Halt...” “Weiter...” und ging.“',
          ['Er sagte: „Sie rief “Halt...” “Weiter...” und ging.“'],
        ],
        ["We noted ``Alpha... Beta'' today. Next.", ["We noted ``Alpha... Beta'' today.", 'Next.']],
        ['He paused... “Perhaps”—Alice replied.', ['He paused...', '“Perhaps”—Alice replied.']],
      ])('preserves reviewed ellipsis quotation and dash context: %s', (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(ss(input, { caseNeutral: true })).toEqual(expected);
        expect(ss(input.toLowerCase(), { caseNeutral: true })).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      });

      test.each([
        [
          'He said “German „Maybe...“ finished.” today.',
          ['He said “German „Maybe...“ finished.” today.'],
        ],
        ['He said „“Enough...” “Next...”“ Next.', ['He said „“Enough...” “Next...”“', 'Next.']],
      ])('preserves mixed quotation closure after ellipses: %s', (input, expected) => {
        expect(ss(input)).toEqual(expected);
        const neutralExpected =
          input === 'He said “German „Maybe...“ finished.” today.'
            ? ['He said “German „Maybe...“ finished.”', 'today.']
            : expected;
        expect(ss(input, { caseNeutral: true })).toEqual(neutralExpected);
        expect(ss(input.toLowerCase(), { caseNeutral: true })).toEqual(
          neutralExpected.map((sentence) => sentence.toLowerCase()),
        );
      });

      test.each([
        ['„Alpha...“Next.', ['„Alpha...“', 'Next.']],
        ['He said "Done." “Next.”', ['He said "Done." “Next.”']],
        ['He paused... “100 points arrived.”', ['He paused...', '“100 points arrived.”']],
        [
          'He paused... ([Perhaps) before answering.',
          ['He paused...', '([Perhaps) before answering.'],
        ],
        ['Alpha... (100 points.)', ['Alpha... (100 points.)']],
        ['Alpha... (5 years.)', ['Alpha... (5 years.)']],
        ['Alpha... [100 points.]', ['Alpha... [100 points.]']],
        ['Alpha... [5 years.]', ['Alpha... [5 years.]']],
        ['Alpha... {100 points.}', ['Alpha... {100 points.}']],
        ['Alpha... {5 years.}', ['Alpha... {5 years.}']],
        ['Alpha... <100 points.>', ['Alpha... <100 points.>']],
        ['Alpha... <5 years.>', ['Alpha... <5 years.>']],
        ['Alpha... “100 points.”', ['Alpha... “100 points.”']],
        ['Alpha... “5 years.”', ['Alpha... “5 years.”']],
        ['Alpha... ‘100 points.’', ['Alpha... ‘100 points.’']],
        ['Alpha... ‘5 years.’', ['Alpha... ‘5 years.’']],
        ['Alpha... „100 points.“', ['Alpha... „100 points.“']],
        ['Alpha... „5 years.“', ['Alpha... „5 years.“']],
        ['Alpha... "100 points."', ['Alpha... "100 points."']],
        ['Alpha... "5 years."', ['Alpha... "5 years."']],
      ])('preserves reviewed delimiter and quantity precedence: %s', (input, expected) => {
        const ordinaryExpected =
          input === 'He said "Done." “Next.”' ? ['He said "Done."', '“Next.”'] : expected;
        expect(ss(input)).toEqual(ordinaryExpected);
        expect(ss(input, { caseNeutral: true })).toEqual(ordinaryExpected);
        expect(ss(input.toLowerCase(), { caseNeutral: true })).toEqual(
          ordinaryExpected.map((sentence) => sentence.toLowerCase()),
        );
      });

      test.each([
        ["He said ``'Enough...''' Next.", ["He said ``'Enough...'''", 'Next.']],
        ["He said '``Enough...''' Next.", ["He said '``Enough...'''", 'Next.']],
        [
          "We noted ``'Alpha... Beta''' and left... Next.",
          ["We noted ``'Alpha... Beta''' and left...", 'Next.'],
        ],
        [
          "We noted '``Alpha... Beta''' and left... Next.",
          ["We noted '``Alpha... Beta''' and left...", 'Next.'],
        ],
      ])('releases both nested Treebank orders after triple closers: %s', (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(ss(input, { caseNeutral: true })).toEqual(expected);
        expect(ss(input.toLowerCase(), { caseNeutral: true })).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      });

      test.each([
        ['Alpha..Beta.', ['Alpha..', 'Beta.']],
        ['Alpha.. Beta.', ['Alpha.. Beta.']],
        ['Alpha...Beta.', ['Alpha...', 'Beta.']],
        ['Alpha....Beta.', ['Alpha....', 'Beta.']],
        ['Alpha.....Beta.', ['Alpha.....', 'Beta.']],
      ])('preserves the period-run boundary policy in %s', (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(ss(input, { caseNeutral: true })).toEqual(expected);
        expect(ss(input.toLowerCase(), { caseNeutral: true })).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      });

      test.each([
        ['He paused... < 5 > before answering.', ['He paused...', '< 5 > before answering.']],
        ['He paused... <5> before answering.', ['He paused...', '<5> before answering.']],
        ['He paused... <Perhaps> before answering.', ['He paused... <Perhaps> before answering.']],
        ['He paused... <Élan> before answering.', ['He paused... <Élan> before answering.']],
        ['He paused... (< 5 >) before answering.', ['He paused... (< 5 >) before answering.']],
        ['He paused... <100 points.>', ['He paused... <100 points.>']],
        ['He said Done." Next.', ['He said Done."', 'Next.']],
        ['He said "Done." Next.', ['He said "Done."', 'Next.']],
      ])('preserves angle-aside and ordinary quote policies: %s', (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(ss(input, { caseNeutral: true })).toEqual(expected);
        expect(ss(input.toLowerCase(), { caseNeutral: true })).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      });

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['„', '“'],
        ['«', '»'],
      ])(
        'keeps an adjacent opening ASCII quote after completed %s%s ellipses',
        (opening, closing) => {
          const first = `He said ${opening}Enough...${closing}`;
          const second = '"Next..."';
          const input = `${first}${second} Final.`;
          const expected = [first, second, 'Final.'];
          expect(ss(input)).toEqual(expected);
          expect(ss(input, { caseNeutral: true })).toEqual(expected);
          expect(ss(input.toLowerCase(), { caseNeutral: true })).toEqual(
            expected.map((sentence) => sentence.toLowerCase()),
          );
          const nested = `He said ${opening}"Enough..."${closing}`;
          expect(ss(`${nested} Next.`)).toEqual([nested, 'Next.']);
          expect(ss(`${nested} Next.`, { caseNeutral: true })).toEqual([nested, 'Next.']);
        },
      );

      test('retains Unicode case-folded abbreviation evidence before numeric starts', () => {
        for (const abbreviation of ['Kan', 'Kan', 'kan']) {
          const input = `He said "${abbreviation}." 2 people remained.`;
          expect(segmentCaseNeutrally(input)).toEqual([input]);
        }
      });

      test('ignores casing when resolving an s-ending quote in neutral mode', () => {
        const first = "She chose 'Paris' Alice agreed...";
        const second = 'Beta followed.';
        const input = `${first} ${second}`;
        expect(segmentCaseNeutrally(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
        expect(rouge.l(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
        const possessive = "He said 'The dogs' owners wait... Next.'";
        expect(segmentCaseNeutrally(possessive)).toEqual([possessive]);
      });

      test.each(['', 'and ', 'but ', 'or '])(
        'uses source-confirmed apostrophes before a %j connective',
        (connective) => {
          const first = `She chose 'Paris' ${connective}Alice agreed...`;
          const input = `${first} Beta followed.`;
          expect(ss(input)).toEqual([first, 'Beta followed.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'Beta followed.']);
          const possessive = "He said 'The students' Books mattered... Next.'";
          expect(ss(possessive)).toEqual([possessive]);
          expect(segmentCaseNeutrally(possessive)).toEqual([possessive]);
        },
      );

      test.each(['``', "''"])('recognizes %s after a spaced terminal ellipsis', (opening) => {
        const second = `${opening}Beta.''`;
        const first = 'Omitted words . . . .';
        expect(ss(`${first} ${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
        const omission = `Omitted words . . . ${second}`;
        expect(ss(omission)).toEqual([omission]);
        expect(segmentCaseNeutrally(omission)).toEqual([omission]);
      });

      test.each(['’90s fashion returned.', '’Twas hard.', '’Tis true.'])(
        'recognizes the same leading elision with and without a separator: %s',
        (second) => {
          for (const gap of ['', ' ']) {
            expect(ss(`Alpha...${gap}${second}`)).toEqual(['Alpha...', second]);
            expect(segmentCaseNeutrally(`Alpha...${gap}${second}`)).toEqual(['Alpha...', second]);
          }
          const closed = 'He said ‘Alpha...’90s fashion returned.';
          expect(ss(closed)).toEqual([closed]);
          expect(segmentCaseNeutrally(closed)).toEqual([closed]);
          const literal = 'Alpha...’90 people returned.';
          expect(ss(literal)).toEqual([literal]);
          expect(segmentCaseNeutrally(literal)).toEqual([literal]);
        },
      );

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['„', '“'],
        ['«', '»'],
      ])('preserves adjacent ASCII opening tokens after %s%s', (opening, closing) => {
        const first = `He said ${opening}Enough...${closing}`;
        for (const [left, right] of [
          ["'", "'"],
          ["''", "''"],
          ['``', "''"],
        ]) {
          const second = `${left}Next...${right}`;
          const input = `${first}${second} Final.`;
          expect(ss(input)).toEqual([first, second, 'Final.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, second, 'Final.']);
        }
        const outerSingle = `He said '${opening}Enough...${closing}'`;
        expect(ss(`${outerSingle} Next... Final.`)).toEqual([outerSingle, 'Next...', 'Final.']);
        const outerTreebank = `He said \`\`${opening}Enough...${closing}''`;
        expect(segmentCaseNeutrally(`${outerTreebank} Next... Final.`)).toEqual([
          outerTreebank,
          'Next...',
          'Final.',
        ]);
      });

      test.each(["``dogs''", "``the dogs' owners''", "``'dogs'''", "'``dogs'''"])(
        'releases an active Treebank pair after the s-ending content %s',
        (quoted) => {
          const first = `He said ${quoted} Next...`;
          expect(ss(`${first} Final.`)).toEqual([first, 'Final.']);
          expect(segmentCaseNeutrally(`${first} Final.`)).toEqual([first, 'Final.']);
          expect(ss(`He said ${quoted} Next.`)).toEqual([`He said ${quoted} Next.`]);
        },
      );

      test('retains complete currency quantities before an adjacent closing quotation', () => {
        const input = 'Alpha...“$100 points.”';
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test.each([
        ['(', ')'],
        ['[', ']'],
        ['{', '}'],
        ['<', '>'],
      ])('closes terminal %s%s inside a straight-single quotation', (open, close) => {
        const first = `He said '${open}Enough...${close}'`;
        const input = `${first} Next sentence.`;
        expect(ss(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
        const continuation = `He said '${open}Enough...${close} Next sentence.'`;
        expect(ss(continuation)).toEqual([continuation]);
        expect(segmentCaseNeutrally(continuation)).toEqual([continuation]);
      });

      test.each(['``', "''"])('recognizes spaced Treebank closers after %s', (open) => {
        for (const gap of [' ', '\t', '\n']) {
          const first = `He said ${open}Enough...${gap}''`;
          const input = `${first} Next sentence.`;
          const expected = [first.replaceAll('\n', ' '), 'Next sentence.'];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
        }
      });

      test.each([' ', ''])('recognizes a Treebank opener after ellipsis and %j', (gap) => {
        const second = "``Beta.''";
        expect(ss(`Alpha...${gap}${second}`)).toEqual(['Alpha...', second]);
        expect(segmentCaseNeutrally(`Alpha...${gap}${second}`)).toEqual(['Alpha...', second]);
        for (const continuation of ["It was...``Beta...''", "Alpha...``100 points.''"]) {
          expect(ss(continuation)).toEqual([continuation]);
          expect(segmentCaseNeutrally(continuation)).toEqual([continuation]);
        }
      });

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['„', '“'],
        ['«', '»'],
      ])('keeps adjacent %s%s quotation openings after a consumed closer', (open, close) => {
        const expected = ['He said “Enough...”', `${open}Next...${close}`, 'Final.'];
        const input = `${expected[0]}${expected[1]} ${expected[2]}`;
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((part) => part.toLowerCase()),
        );
      });

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['„', '“'],
        ['«', '»'],
        ['``', "''"],
      ])('consumes a single closer before an adjacent %s%s quotation', (open, close) => {
        const expected = ["He said 'Enough...'", `${open}Next sentence.${close}`];
        const input = expected.join('');
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((part) => part.toLowerCase()),
        );
        for (const continuation of ['and then continued.', 'before leaving.']) {
          const continued = `${expected[0]}${open}${continuation}${close}`;
          expect(ss(continued)).toEqual([continued]);
          expect(segmentCaseNeutrally(continued)).toEqual([continued]);
        }
      });

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['„', '“'],
        ['«', '»'],
      ])('ignores bracket literals inside %s%s quotation context', (open, close) => {
        const first = `He said ${open}Alpha... [Beta...${close} and left...`;
        const input = `${first} Next.`;
        expect(ss(input)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
      });

      test('handles long sequences of merged ellipses in one scan', () => {
        expect(ss('It is... Alpha '.repeat(4000))).toHaveLength(1);
      });

      test('keeps inline parentheticals with their ellipsis continuation', () => {
        for (const input of [
          'He paused... (Perhaps deliberately) before answering.',
          'He paused... (Perhaps, e.g., deliberately) before answering.',
          'He paused... “Perhaps deliberately,” before answering.',
          "He paused... 'Perhaps it's deliberate,' before answering.",
          'He paused... ‘Perhaps it’s deliberate,’ before answering.',
        ]) {
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
        }
        const uppercase = 'HE PAUSED... (PERHAPS) BEFORE ANSWERING.';
        expect(segmentCaseNeutrally(uppercase)).toEqual([uppercase]);
        expect(rouge.l(uppercase, uppercase.toLowerCase(), { caseSensitive: false })).toBe(1);
      });

      test.each([
        ['(', ')'],
        ['“', '”'],
        ["'", "'"],
      ])('keeps long inline asides delimited by %s%s', (opening, closing) => {
        const input = `He paused... ${opening}Perhaps ${'very '.repeat(110)}deliberately${closing} before answering.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test.each([
        ['He said “Enough...” Next sentence.', ['He said “Enough...”', 'Next sentence.']],
        ['He said ‘Enough...’ Next sentence.', ['He said ‘Enough...’', 'Next sentence.']],
        ['He said «Enough...» Next sentence.', ['He said «Enough...»', 'Next sentence.']],
        ['(He paused...) Next sentence.', ['(He paused...)', 'Next sentence.']],
      ])('recognizes terminal ellipses before closing delimiters: %s', (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      });

      test.each([
        [
          'She said, ‘The students’ work... Alpha matters.’',
          ['She said, ‘The students’ work... Alpha matters.’'],
        ],
        ['He said “Enough... ” Next sentence.', ['He said “Enough... ”', 'Next sentence.']],
        ['He said ‘Enough...’ and then continued.', ['He said ‘Enough...’ and then continued.']],
      ])('preserves reviewed typographic ellipsis context: %s', (input, expected) => {
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      });

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('retains spaced %s%s ellipsis closers in both modes', (open, close) => {
        for (const gap of [' ', '\t', '\n']) {
          const first = `He said ${open}Enough...${gap}${close}`;
          const input = `${first} Next sentence.`;
          const expected = [first.replaceAll('\n', ' '), 'Next sentence.'];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
            expected.map((sentence) => sentence.toLowerCase()),
          );
        }
      });

      test('preserves four-dot terminal precedence after a quotation', () => {
        const first = 'He said ‘Enough....’';
        const second = 'And then continued.';
        expect(ss(`${first} ${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first} ${second}`.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
      });

      test.each([
        'She said, ‘James’, the students’ work... Alpha matters.’',
        'She said, ‘The students’ work and James’ notes... Alpha matters.’',
      ])('retains possessive chains through an ellipsis: %s', (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      });

      test('recovers exact mixed-family quote state beyond 64 levels', () => {
        const opening = '“‘«'.repeat(25);
        const closing = Array.from(opening)
          .reverse()
          .map((quote) => '”’»“'['“‘«„'.indexOf(quote)])
          .join('');
        const first = `${opening}Alpha...${closing}`;
        expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
        const unmatched = `${opening}Alpha...${closing.slice(0, -1)} Next.`;
        expect(ss(unmatched)).toEqual([unmatched]);
        expect(segmentCaseNeutrally(unmatched)).toEqual([unmatched]);
      });

      test('tracks later quoted ellipses after consuming earlier closers', () => {
        const input = 'He said “Enough...” Next. She said “Later...” Final.';
        const expected = ['He said “Enough...”', 'Next.', 'She said “Later...”', 'Final.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      });

      test.each([
        'She said ‘The dogs’ owners quoted ‘something’ Alpha... Beta.’ Next.',
        'She said ‘The dogs’ owners quoted ‘the cats’ owner’ Alpha... Beta.’ Next.',
      ])('preserves outer quotation context through nested possessives: %s', (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      });

      test('retains an ellipsis boundary after separate quotations ending in s', () => {
        const first = 'She said ‘dogs’ and ‘cat’ Alpha...';
        expect(ss(`${first} Beta.`)).toEqual([first, 'Beta.']);
        expect(segmentCaseNeutrally(`${first} Beta.`)).toEqual([first, 'Beta.']);
      });

      test('confirms deeply nested possessive candidates without a depth cap', () => {
        const input = `${'‘dogs’ '.repeat(512)}Alpha... Beta ${'end’ '.repeat(512)}`.trimEnd();
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test('pairs deeply nested elision-shaped quotations without borrowing outer closers', () => {
        const input = `${'‘90s '.repeat(128)}Alpha... Beta ${'end’ '.repeat(128)}`.trimEnd();
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test('keeps an unmatched outer quote beyond 64 nested openers', () => {
        const input = `${'‘'.repeat(65)}Alpha...${'’'.repeat(64)} Next.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test('keeps ellipses inside nested quotes until the outer quote closes', () => {
        const input = 'She said “He said ‘Enough...’ and went.”';
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test.each(lineBreaks)('keeps wrapped continuations after inline asides across %j', (wrap) => {
        const input = `He paused... (Perhaps deliberately)${wrap}before answering.`;
        const expected = ['He paused... (Perhaps deliberately) before answering.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      });

      test.each(['Cause', 'Til', 'Till'])(
        'preserves the leading elision %s within a pending curly quotation',
        (word) => {
          const input = `She said ‘Alpha... ’${word} it continued... Next.’`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
          const first = 'She said ‘Alpha...’';
          const second = `${word} it continued.`;
          expect(ss(`${first}${second}`)).toEqual([first, second]);
          expect(segmentCaseNeutrally(`${first}${second}`)).toEqual([first, second]);
        },
      );

      test.each(["'", '‘', '’'])(
        'recognizes a new decade sentence after an ellipsis with %s',
        (mark) => {
          const second = `${mark}90s fashion returned.`;
          expect(ss(`Alpha... ${second}`)).toEqual(['Alpha...', second]);
          expect(segmentCaseNeutrally(`Alpha... ${second}`)).toEqual(['Alpha...', second]);
        },
      );

      test.each(['“', '‘', '«', '„'])(
        'recognizes unspaced prefixed numeric text after an ellipsis and %s',
        (opening) => {
          for (const number of ['$100', '+5', '-£100', '€+5']) {
            const second = `${opening}${number} was the result.`;
            expect(ss(`Alpha...${second}`)).toEqual(['Alpha...', second]);
            expect(segmentCaseNeutrally(`Alpha...${second}`)).toEqual(['Alpha...', second]);
            const quantity = `Alpha...${opening}${number} points.`;
            expect(ss(quantity)).toEqual([quantity]);
            expect(segmentCaseNeutrally(quantity)).toEqual([quantity]);
          }
        },
      );

      test.each([
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('preserves spaced four-dot precedence before unspaced %s%s', (open, close) => {
        const expected = ['Omitted words . . . .', `${open}Beta.${close}`];
        const input = expected.join('');
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      });

      test.each([
        ['(', ')'],
        ['[', ']'],
        ['{', '}'],
        ['<', '>'],
        ['"', '"'],
      ])('retains an outer %s%s after consuming only an inner quote', (open, close) => {
        for (const gap of [' ', '']) {
          const input = `The choices were ${open}“Maybe...”${gap}Alice suggested${close} before voting.`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          const first = `The choices were ${open}“Maybe...”${close}`;
          const second = 'Alice suggested.';
          expect(ss(`${first}${gap}${second}`)).toEqual([first, second]);
          expect(segmentCaseNeutrally(`${first}${gap}${second}`)).toEqual([first, second]);
        }
      });

      test('preserves four-dot precedence while an outer bracket remains open', () => {
        const input = 'The choices were (“Maybe....”Alice suggested) before voting.';
        const expected = ['The choices were (“Maybe....”', 'Alice suggested) before voting.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      });

      test.each([
        ['"', '"'],
        ["'", "'"],
        ['``', "''"],
        ["''", "''"],
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('keeps quoted bracket closers %s%s from closing an outer bracket', (open, close) => {
        for (const [left, right] of [
          ['(', ')'],
          ['[', ']'],
          ['{', '}'],
          ['<', '>'],
        ]) {
          for (const literal of [')', ']', '}', '>', ')]']) {
            const quoted = `${open}Maybe...${literal}${close}`;
            const continued = `The choices were ${left}${quoted} Next.${right}`;
            expect(ss(continued)).toEqual([continued]);
            expect(segmentCaseNeutrally(continued)).toEqual([continued]);
            expect(segmentCaseNeutrally(continued.toLowerCase())).toEqual([
              continued.toLowerCase(),
            ]);
            const first = `The choices were ${left}${quoted}${right}`;
            // ASCII single quotes after an angle retain their existing continuation policy.
            const expected = left === '<' && open === "'" ? [`${first} Next.`] : [first, 'Next.'];
            expect(ss(`${first} Next.`)).toEqual(expected);
            expect(segmentCaseNeutrally(`${first} Next.`)).toEqual(expected);
          }
        }
      });

      test.each([
        ['"', '"'],
        ["'", "'"],
        ['``', "''"],
        ["''", "''"],
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])(
        'preserves four-dot counting within partially closed brackets around %s%s',
        (open, close) => {
          for (const bracket of ['', ']']) {
            const first = `The choices were ([${open}Maybe....)${close}${bracket}`;
            const next = bracket ? 'Next.)' : 'Next.])';
            const input = `${first} ${next}`;
            const expected = bracket ? [first, next] : [input];
            expect(ss(input)).toEqual(expected);
            expect(segmentCaseNeutrally(input)).toEqual(expected);
            const threeDots = input.replace('....', '...');
            expect(ss(threeDots)).toEqual([threeDots]);
            expect(segmentCaseNeutrally(threeDots)).toEqual([threeDots]);
          }
        },
      );

      test.each(['\n', '\r\n', '\u2028', '\u2029'])(
        'uses complete source offsets for a punctuated aside wrapped with %j',
        (wrap) => {
          const input = `He paused... (Perhaps e.g.${wrap}very deliberately) before answering. Alpha... Beta.`;
          const expected = [
            'He paused... (Perhaps e.g. very deliberately) before answering.',
            'Alpha...',
            'Beta.',
          ];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
            expected.map((part) => part.toLowerCase()),
          );
        },
      );

      test.each(['„Perhaps “really” tail“', '“Perhaps „wirklich“ tail”'])(
        'matches the actual outer closer of the nested aside %s',
        (aside) => {
          const input = `He paused... ${aside} before continuing.`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          const second = `${aside} Next sentence.`;
          expect(ss(`He paused... ${second}`)).toEqual(['He paused...', second]);
          expect(segmentCaseNeutrally(`He paused... ${second}`)).toEqual(['He paused...', second]);
        },
      );

      test('does not let an unmatched earlier aside hide a later independent reply', () => {
        const first = 'He paused... (Unclosed. Later...';
        const reply = '“I am done,” she said.';
        const aside = '“Perhaps,” before continuing.';
        for (const segment of [ss, segmentCaseNeutrally]) {
          expect(segment(`${first} ${reply}`)).toEqual([
            'He paused...',
            '(Unclosed.',
            'Later...',
            reply,
          ]);
          expect(segment(`${first} ${aside}`)).toEqual([
            'He paused...',
            '(Unclosed.',
            `Later... ${aside}`,
          ]);
        }
      });

      test.each(['(Perhaps [[nested]])', '"Perhaps (really)"', "''Perhaps deliberately''"])(
        'keeps independently matched aside families in %s',
        (aside) => {
          const input = `He paused... ${aside} before continuing.`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
        },
      );

      test('preserves unmatched nested asides without guessing a closer', () => {
        const second = '(Perhaps (nested) before continuing.';
        expect(ss(`He paused... ${second}`)).toEqual(['He paused...', second]);
        expect(segmentCaseNeutrally(`He paused... ${second}`)).toEqual(['He paused...', second]);
      });

      test.each(['``', "''"])(
        'keeps source offsets aligned across mixed parenthetical and Treebank asides: %s',
        (opening) => {
          const first = 'He paused... (Perhaps) before continuing.';
          const second = `He paused... ${opening}Perhaps e.g.\nvery deliberately'' before answering.`;
          const expected = [first, second.replaceAll('\n', ' ')];
          expect(ss(`${first} ${second}`)).toEqual(expected);
          expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual(expected);
        },
      );

      test.each(['``', "''"])(
        'closes the inner single quotation before a %s aside ends',
        (opening) => {
          for (const content of ['really', "can't"]) {
            const first = `He paused... ${opening}Perhaps '${content}''' before leaving.`;
            const input = `${first} Next.`;
            expect(ss(input)).toEqual([first, 'Next.']);
            expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
            expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
              first.toLowerCase(),
              'next.',
            ]);
          }
          for (const aside of [
            `${opening}Perhaps 'really''`,
            `${opening}Perhaps 'really' ''`,
            `'Perhaps ${opening}really'''`,
          ]) {
            const input = `He paused... ${aside} before leaving.`;
            expect(ss(input)).toEqual([input]);
            expect(segmentCaseNeutrally(input)).toEqual([input]);
          }
        },
      );

      test('keeps an initial quotation separate from a later inline aside', () => {
        const expected = ['"Opening" ended.', 'He paused... "Perhaps," before continuing.'];
        const input = expected.join(' ');
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      });

      test.each([
        ['(', ')'],
        ['[', ']'],
        ['{', '}'],
        ['<', '>'],
      ])('finds a consumed ASCII closer before the final %s%s bracket', (open, close) => {
        for (const gap of ['', ' ']) {
          const first = `He said ${open}"‘Enough...’"${gap}${close}`;
          expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
          const pending = `He said ${open}"‘Enough...’ Next.${close}`;
          expect(ss(pending)).toEqual([pending]);
          expect(segmentCaseNeutrally(pending)).toEqual([pending]);
        }
      });

      test.each(['(', ')', '[', ']', '{', '}', '<', '>'])(
        'ignores the quoted literal bracket %s while matching an outer aside',
        (literal) => {
          for (const [open, close] of [
            ['"', '"'],
            ['“', '”'],
            ['„', '“'],
          ]) {
            const input = `He paused... (Perhaps ${open}${literal}${close} deliberately) before continuing.`;
            expect(ss(input)).toEqual([input]);
            expect(segmentCaseNeutrally(input)).toEqual([input]);
            const first = 'He paused...';
            const second = `(Perhaps ${open}${literal}${close} deliberately) Next sentence.`;
            expect(ss(`${first} ${second}`)).toEqual([first, second]);
          }
        },
      );

      test.each([
        ['"', '"'],
        ["'", "'"],
        ['``', "''"],
        ["''", "''"],
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('ignores bracket literals inside completed %s%s ellipsis quotations', (open, close) => {
        for (const literal of ['(', ')', '[', ']', '{', '}', '<', '>']) {
          const first = `He said ${open}Type ${literal}help...${close}`;
          const input = `${first} Next sentence.`;
          expect(ss(input)).toEqual([first, 'Next sentence.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
            first.toLowerCase(),
            'next sentence.',
          ]);
          const pending = `He said (${open}Type ${literal}help...${close} before leaving).`;
          expect(ss(pending)).toEqual([pending]);
          expect(segmentCaseNeutrally(pending)).toEqual([pending]);
        }
      });

      test.each(['$100', '+5', '-5', '−𝟝', '-£100', '€+5'])(
        'recognizes %s after a spaced four-dot ellipsis',
        (number) => {
          const second = `${number} was the result.`;
          for (const gap of [' ', '  ']) {
            const first = 'Alpha . . . .';
            expect(ss(`${first}${gap}${second}`)).toEqual([first, second]);
            expect(segmentCaseNeutrally(`${first}${gap}${second}`)).toEqual([first, second]);
          }
          const omission = `Alpha . . . ${number} was the result.`;
          expect(ss(omission)).toEqual([omission]);
          expect(segmentCaseNeutrally(omission)).toEqual([omission]);
        },
      );

      test.each([
        ' '.repeat(64),
        '\t'.repeat(128),
        `,${' —;:'.repeat(100)}`,
        '\u{10ead}',
        '\u{10ead}'.repeat(128),
      ])('keeps inline asides before a long connector run (%#)', (connector) => {
        for (const aside of ['(Perhaps)', '“Perhaps,”', "``Perhaps,''"]) {
          const input = `He paused... ${aside}${connector}before answering.`;
          const normalized = input.replace(/ +/g, ' ');
          expect(ss(input)).toEqual([normalized]);
          expect(segmentCaseNeutrally(input)).toEqual([normalized]);
        }
        const second = `“Perhaps,”${connector}Alice replied.`;
        expect(ss(`He paused... ${second}`)).toEqual(['He paused...', second]);
        expect(segmentCaseNeutrally(`He paused... ${second}`)).toEqual(['He paused...', second]);
      });

      test('handles repeated long post-aside gaps without rescanning source tails', () => {
        const sentence = `He paused... (Perhaps)${' '.repeat(1000)}before answering.`;
        const input = `${sentence} `.repeat(1000);
        const expected = new Array(1000).fill('He paused... (Perhaps) before answering.');
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      }, 5000);

      test.each([
        ['"', '"'],
        ['``', "''"],
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('retains the outer ASCII single after only inner %s%s closers', (open, close) => {
        const first = `She said 'Alpha...${open}Beta...${close} tail.'`;
        const complete = `She said 'Alpha...${open}Beta...${close}'`;
        for (const segment of [ss, segmentCaseNeutrally]) {
          expect(segment(`${first} Next.`)).toEqual([first, 'Next.']);
          expect(segment(`${complete} Next.`)).toEqual([complete, 'Next.']);
        }
        expect(segmentCaseNeutrally(`${first} Next.`.toLowerCase())).toEqual([
          first.toLowerCase(),
          'next.',
        ]);
      });

      test.each([
        ['"', '"'],
        ["'", "'"],
        ['``', "''"],
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('keeps inline asides after completed %s%s ellipsis quotations', (open, close) => {
        for (const dots of ['...', '....']) {
          const first = `He said ${open}Enough${dots}${close}`;
          for (const aside of ['(Perhaps)', '[Perhaps]', '“Perhaps,”', "``Perhaps,''"]) {
            const sentence = `${first} ${aside} before leaving.`;
            const expected =
              dots === '...' ? [sentence, 'Next.'] : [first, `${aside} before leaving.`, 'Next.'];
            expect(ss(`${sentence} Next.`)).toEqual(expected);
            expect(segmentCaseNeutrally(`${sentence} Next.`)).toEqual(expected);
          }
          const reply = '“A reply.” Alice replied.';
          expect(ss(`${first} ${reply}`)).toEqual([first, reply]);
          expect(segmentCaseNeutrally(`${first} ${reply}`)).toEqual([first, reply]);
          const unmatched = '(Perhaps before leaving.';
          expect(ss(`${first} ${unmatched}`)).toEqual([first, unmatched]);
          expect(segmentCaseNeutrally(`${first} ${unmatched}`)).toEqual([first, unmatched]);
        }
      });

      test('retains the existing neutral ambiguity after a bracketed aside', () => {
        const first = 'He said “Enough...”';
        const next = '(Perhaps) Alice replied.';
        expect(ss(`${first} ${next}`)).toEqual([first, next]);
        // The existing neutral bracket-aside rule cannot use Alice's capitalization.
        expect(segmentCaseNeutrally(`${first} ${next}`)).toEqual([`${first} ${next}`]);
      });

      test('shares aside endpoints across source and merged quotation boundaries', () => {
        const first = 'He said “Enough...” (Perhaps e.g. very deliberately) before leaving.';
        const second = 'He paused... “Perhaps,” before answering.';
        const input = `${first} ${second} `.repeat(1000);
        const expected = Array.from({ length: 1000 }, () => [first, second]).flat();
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      }, 5000);

      test.each(['.5', '+.5', '-.5', '−.𝟝', '-$.5', '€+.5'])(
        'recognizes the leading decimal %s after terminal ellipses',
        (number) => {
          const next = `${number} was enough.`;
          for (const first of ['Alpha...', 'Alpha....', 'Alpha . . . .']) {
            expect(ss(`${first} ${next}`)).toEqual([first, next]);
            expect(segmentCaseNeutrally(`${first} ${next}`)).toEqual([first, next]);
          }
          for (const first of ['Alpha...', 'Alpha....']) {
            for (const unit of ['years.', '%.']) {
              const quantity = `${first} ${number}${unit.startsWith('%') ? '' : ' '}${unit}`;
              expect(ss(quantity)).toEqual([quantity]);
              expect(segmentCaseNeutrally(quantity)).toEqual([quantity]);
            }
            const quoted = `“${next}”`;
            expect(ss(`${first} ${quoted}`)).toEqual([first, quoted]);
            expect(segmentCaseNeutrally(`${first} ${quoted}`)).toEqual([first, quoted]);
          }
          const percentage = `${number}% of voters agreed.`;
          expect(ss(`Alpha... ${percentage}`)).toEqual(['Alpha...', percentage]);
          expect(segmentCaseNeutrally(`Alpha... ${percentage}`)).toEqual(['Alpha...', percentage]);
        },
      );

      test.each([
        'Alpha . . . .5 was enough.',
        'Alpha... ..5 was enough.',
        'Alpha....5 was enough.',
        'Alpha.....5 was enough.',
      ])('preserves existing ambiguous or unsupported dot spacing in %s', (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      });

      test('retains an ordinary boundary after a separated sign and period', () => {
        const input = 'Alpha... +. 5 was enough.';
        const expected = ['Alpha... +.', '5 was enough.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      });

      test.each(['\t', '\u00a0', '\u2003', ' \t  '])(
        'trims the horizontal separator %j after a terminal ellipsis',
        (gap) => {
          for (const dots of ['...', '....']) {
            for (const next of ['“Beta.”', '‘Beta.’', '"Beta."', 'Beta.']) {
              const first = `Alpha${dots}`;
              expect(ss(`${first}${gap}${next}`)).toEqual([first, next]);
              expect(segmentCaseNeutrally(`${first}${gap}${next}`)).toEqual([first, next]);
            }
          }
        },
      );

      test('preserves horizontal whitespace within ellipsis continuations and quotations', () => {
        for (const input of [
          'He paused...\t(Perhaps) before leaving.',
          'He paused...\tbefore leaving.',
        ]) {
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
        }
        const next = '“Beta\t Gamma.”';
        expect(ss(`Alpha...\t${next}`)).toEqual(['Alpha...', next]);
        expect(segmentCaseNeutrally(`Alpha...\t${next}`)).toEqual(['Alpha...', next]);
      });

      test('preserves the existing ordinary-period and initial-fragment whitespace rules', () => {
        for (const segment of [ss, segmentCaseNeutrally]) {
          expect(segment('Alpha.\t“Beta.”')).toEqual(['Alpha.', '“Beta.”']);
          expect(segment('\t“Beta.”')).toEqual(['“Beta.”']);
        }
      });

      test.each([
        'He said “Enough...”',
        "He said 'Enough...'",
        'He said "Enough..."',
        "He said ``Enough...''",
        '(Enough...)',
        '[Enough...]',
        '{Enough...}',
        'He said “Enough....”',
      ])('trims horizontal separators after the closed ellipsis %s', (first) => {
        for (const gap of ['\t', '\u00a0', '\u2003', ' \t  ', '\n', '\r\n']) {
          for (const next of ['“Beta.”', 'Beta.']) {
            expect(ss(first + gap + next)).toEqual([first, next]);
            expect(segmentCaseNeutrally(first + gap + next)).toEqual([first, next]);
          }
        }
      });

      test('preserves whitespace within continued closed ellipses and following quotes', () => {
        for (const input of [
          'He said “Enough...”\tbefore leaving.',
          'He said “Enough...”\t(Perhaps) before leaving.',
          'He said “Enough.”\t“Beta.”',
          'He said “Enough . . . .”\t“Beta.”',
        ]) {
          let expected =
            input === 'He said “Enough.”\t“Beta.”' ? ['He said “Enough.”', '“Beta.”'] : [input];
          if (input === 'He said “Enough . . . .”\t“Beta.”') {
            expected = ['He said “Enough . . . .”', '“Beta.”'];
          }
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
        }
        const first = 'He said “Enough...”';
        const next = '“Beta\t Gamma.”';
        expect(ss(`${first}\t${next}`)).toEqual([first, next]);
        expect(segmentCaseNeutrally(`${first}\t${next}`)).toEqual([first, next]);
      });

      test.each(['\t', '\u00a0', '\u2003', ' \t  '])(
        'trims %j before quotations at a spaced-four-dot boundary',
        (gap) => {
          const first = 'Omitted words . . . .';
          const next = '“Beta\t Gamma.”';
          expect(ss(first + gap + next)).toEqual([first, next]);
          expect(segmentCaseNeutrally(first + gap + next)).toEqual([first, next]);
          const continuation = `Omitted words . . .${gap}${next}`;
          expect(ss(continuation)).toEqual([continuation]);
          expect(segmentCaseNeutrally(continuation)).toEqual([continuation]);
        },
      );

      test.each(["'", '‘', '’'])(
        'retains confirmed %s elided subordinators after a neutral ellipsis',
        (apostrophe) => {
          for (const word of ['cause', 'Cause', 'til', 'Til', 'till', 'Till']) {
            const input = `We waited... ${apostrophe}${word} it rained.`;
            expect(segmentCaseNeutrally(input)).toEqual([input]);
            expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
          }
        },
      );

      test.each([
        "'cause and effect mattered.'",
        '‘cause and effect mattered.’',
        "'til is a word.'",
        'Cause and effect mattered.',
        'Til is a name.',
      ])('retains an independent quoted or bare sentence %s', (next) => {
        expect(segmentCaseNeutrally(`We waited... ${next}`)).toEqual(['We waited...', next]);
      });

      test.each(['‘', '’'])('retains adjacent %s elided subordinators after three dots', (mark) => {
        for (const word of ['cause', 'Cause', 'til', 'Til', 'till', 'Till']) {
          const input = `We waited...${mark}${word} it rained.`;
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
        }
      });

      test('preserves pending curly closers before adjacent sentence starters', () => {
        const first = 'She said ‘Enough...’';
        for (const word of ['Cause', 'Til', 'Tis']) {
          const next = `${word} was useful.`;
          expect(ss(first + next)).toEqual([first, next]);
          expect(segmentCaseNeutrally(first + next)).toEqual([first, next]);
        }
      });

      test('preserves confirmed adjacent quotations and later independent quotes', () => {
        const next = '‘cause and effect mattered.’';
        expect(segmentCaseNeutrally(`We waited...${next}`)).toEqual(['We waited...', next]);
        const first = 'We waited...‘cause it rained.';
        const later = 'She said ‘Later.’ Next.';
        expect(segmentCaseNeutrally(`${first} ${later}`)).toEqual([
          first,
          'She said ‘Later.’',
          'Next.',
        ]);
      });

      test('preserves ASCII adjacent elisions and four-dot boundary priority', () => {
        const ascii = "'cause it rained.";
        expect(segmentCaseNeutrally(`We waited...${ascii}`)).toEqual(['We waited...', ascii]);
        expect(ss(`We waited...${ascii}`)).toEqual([`We waited...${ascii}`]);
        for (const mark of ['‘', '’']) {
          const next = `${mark}cause it rained.`;
          expect(segmentCaseNeutrally(`We waited....${next}`)).toEqual(['We waited....', next]);
        }
      });

      test('retains four-dot priority before an elided subordinator', () => {
        const next = "'cause it rained.";
        expect(segmentCaseNeutrally(`We waited.... ${next}`)).toEqual(['We waited....', next]);
      });

      test.each([
        ['"', '"'],
        ["'", "'"],
        ['``', "''"],
        ['“', '”'],
        ['‘', '’'],
        ['«', '»'],
        ['„', '“'],
      ])('retains elided continuations after completed %s%s quotations', (opening, closing) => {
        for (const apostrophe of ["'", '‘', '’']) {
          for (const word of ['cause', 'til', 'till']) {
            const next = `${apostrophe}${word} it rained.`;
            const first = `He said ${opening}Enough...${closing}`;
            const input = `${first} ${next}`;
            expect(segmentCaseNeutrally(input)).toEqual([input]);
            expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
            const four = `He said ${opening}Enough....${closing}`;
            expect(segmentCaseNeutrally(`${four} ${next}`)).toEqual([four, next]);
          }
        }
      });

      test.each(['.5', '0.5'])(
        'retains the existing spaced-four-dot priority before %s quantities',
        (number) => {
          const first = 'Alpha . . . .';
          const next = `${number} years.`;
          expect(ss(`${first} ${next}`)).toEqual([first, next]);
          expect(segmentCaseNeutrally(`${first} ${next}`)).toEqual([first, next]);
        },
      );

      test('scores reference sentences ending in a three-dot ellipsis correctly', () => {
        expect(rouge.l('Beta Alpha...', 'Alpha... Beta.')).toBeCloseTo(6 / 7);
      });
    });
  });
});

describe('Ellipsis decisions across quotation lookahead and retained outer quotes', () => {
  test.each(['Next question?', '12 points remained?', 'I returned?', '"Next question?"'])(
    'uses an accepted bare ellipsis before %s as the next real terminal',
    (next) => {
      for (const caseNeutral of [false, true]) {
        expect(
          rouge.sentenceSegment(`"No." Was Alice choosing Alpha... ${next}`, { caseNeutral }),
        ).toEqual(['"No." Was Alice choosing Alpha...', next]);
      }
    },
  );

  test.each(['or Beta?', '12 points?', 'what happened?', '(maybe later) and then ready?'])(
    'retains the question through a continued ellipsis before %s',
    (next) => {
      const question = `Was Alice choosing Alpha... ${next}`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`"No." ${question}`, { caseNeutral })).toEqual([
          '"No."',
          question,
        ]);
      }
    },
  );

  test.each(['Was Alice choosing Alpha is... Next question?', 'Was I... Next question?'])(
    'retains a copula or first-person ellipsis in auxiliary lookahead: %s',
    (question) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`"No." ${question}`, { caseNeutral })).toEqual([
          '"No."',
          question,
        ]);
      }
    },
  );

  test('shares casing and complete-aside decisions with the ellipsis merger', () => {
    for (const next of ['What happened?', '(Dr. Smith explained) Next question?']) {
      const question = `Was Alice choosing Alpha... ${next}`;
      expect(rouge.sentenceSegment(`"No." ${question}`)).toEqual([
        '"No." Was Alice choosing Alpha...',
        next,
      ]);
      expect(rouge.sentenceSegment(`"No." ${question}`, { caseNeutral: true })).toEqual([
        '"No."',
        question,
      ]);
    }
  });

  test.each([
    ['"Alpha..." Next question?', ['"No."', 'Was Alice choosing "Alpha..."', 'Next question?']],
    [
      '"Alpha is..." Was Bob ready?',
      ['"No."', 'Was Alice choosing "Alpha is..."', 'Was Bob ready?'],
    ],
    ['(Alpha...) Next question?', ['"No."', 'Was Alice choosing (Alpha...) Next question?']],
    ['[...] Was Bob ready?', ['"No."', 'Was Alice choosing [...] Was Bob ready?']],
  ])('preserves the established enclosed-terminal policy for %s', (predicate, expected) => {
    const question = `Was Alice choosing ${predicate}`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`"No." ${question}`, { caseNeutral })).toEqual(expected);
    }
  });

  test.each(['[1]', '(1)', '[¹]'])(
    'preserves citation precedence at a three-dot terminal followed by %s',
    (citation) => {
      const question = `Was Alice choosing Alpha...${citation} or Beta?`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`"No." ${question}`, { caseNeutral })).toEqual([
          '"No."',
          question,
        ]);
        expect(
          rouge.sentenceSegment(`"No." Was Alice choosing Alpha...${citation} Next question?`, {
            caseNeutral,
          }),
        ).toEqual(['"No."', `Was Alice choosing Alpha...${citation} Next question?`]);
      }
    },
  );

  test('keeps repeated accepted and retained ellipsis lookaheads independent', () => {
    expectBundledScriptToPass(
      `
      const accepted = ['"No." Was Alice choosing Alpha...', 'Next question?'];
      const retained = ['"Yes."', 'Was Bob choosing Beta... 12 points?'];
      const unit = [...accepted, ...retained];
      const expected = Array.from({length: 400}, () => unit).flat();
      for (const caseNeutral of [false, true]) {
        const actual = sentenceSegment(expected.join(' '), {caseNeutral});
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('question state leaked');
      }
      process.stdout.write('ok');
    `,
      5000,
    );
  });

  test('retains an owned outer quote after an ellipsis and an ordinary inner closer', () => {
    const first = 'She said ‘Use ‘notes... More.’ tail... Still inside.’ Next.';
    const second = 'She said ‘New ‘notes... More.’ tail... Still inside.’ Last.';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} ${second}`, { caseNeutral })).toEqual([first, second]);
      expect(rouge.sentenceSegment(`${first} New... Last.`, { caseNeutral })).toEqual([
        first,
        'New...',
        'Last.',
      ]);
    }
  });

  test.each(['.', '....'])(
    'does not borrow an old outer quote after an accepted %s boundary',
    (terminal) => {
      const first = `She said ‘Old${terminal}`;
      const rest = 'New ‘notes... More.’ tail... Still inside.’ Next.';
      expect(rouge.sentenceSegment(`${first} ${rest}`)).toEqual([
        first,
        'New ‘notes... More.’ tail...',
        'Still inside.’ Next.',
      ]);
      expect(rouge.sentenceSegment(`${first} ${rest}`, { caseNeutral: true })).toEqual([
        first,
        'New ‘notes... More.’',
        'tail...',
        'Still inside.’ Next.',
      ]);
    },
  );

  test('starts fresh ellipsis ownership after an accepted citation boundary', () => {
    const first = 'She said ‘Old.’[1]';
    const nested = 'She said ‘New ‘notes... More.’ tail... Still inside.’ Next.';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} ${nested}`, { caseNeutral })).toEqual([first, nested]);
      expect(
        rouge.sentenceSegment(`${first} Next... More.’ tail... Still inside.’ Next.`, {
          caseNeutral,
        }),
      ).toEqual([first, 'Next...', 'More.’ tail...', 'Still inside.’ Next.']);
    }
  });

  test('does not arm nested quotation ownership without a retained ellipsis', () => {
    const input = 'She said ‘Use ‘90s fashion. More.’ tail... Still inside.’ Next.';
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([
      'She said ‘Use ‘90s fashion. More.’',
      'tail...',
      'Still inside.’ Next.',
    ]);
    const missingInner = 'She said ‘Use ‘90s fashion... More. tail... Still inside.’ Next.';
    expect(rouge.sentenceSegment(missingInner, { caseNeutral: true })).toEqual([
      'She said ‘Use ‘90s fashion... More. tail... Still inside.’',
      'Next.',
    ]);
  });

  test.each([' ', '   ', '\r\n'])(
    'keeps source positions aligned after a cited boundary and separator %p',
    (separator) => {
      const next = '"No..." (said Dr. Lee) and continued.';
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`Alpha.[1]${separator}${next}`, { caseNeutral })).toEqual([
          'Alpha.[1]',
          next,
        ]);
      }
    },
  );
});

describe('Retained ellipsis forms keep only their current outer quotation', () => {
  test.each(['...', '....', '.....', ' . . .', ' . . . .'])(
    'shares retained versus accepted ownership for %s',
    (ellipsis) => {
      const first = `She said ‘Use ‘notes${ellipsis}`;
      const input = `${first} more.’ Tail... Still inside.’ Next.`;
      expect(rouge.sentenceSegment(input)).toEqual([input]);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual(
        ellipsis === '...' || ellipsis === ' . . .'
          ? [input]
          : [first, 'more.’', 'Tail...', 'Still inside.’ Next.'],
      );
    },
  );

  test('keeps quantity and lowercase aside continuations inside owned typography', () => {
    const quantity = 'She said ‘Use ‘notes.... 12 points. more.’ Tail... Still inside.’ Next.';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(quantity, { caseNeutral })).toEqual([quantity]);
    }
    const aside = 'She said ‘Use ‘notes.... (perhaps) more.’ Tail... Still inside.’ Next.';
    expect(rouge.sentenceSegment(aside)).toEqual([aside]);
    expect(rouge.sentenceSegment(aside, { caseNeutral: true })).toEqual([
      'She said ‘Use ‘notes....',
      '(perhaps) more.’',
      'Tail...',
      'Still inside.’ Next.',
    ]);
  });

  test.each(['(Perhaps) more.', '12 points remained.'])(
    'releases ownership after a genuinely accepted four-dot boundary before %s',
    (continuation) => {
      const first = 'She said ‘Use ‘notes....';
      const next = `${continuation}’`;
      for (const caseNeutral of [false, true]) {
        expect(
          rouge.sentenceSegment(`${first} ${next} Tail... Still inside.’ Next.`, { caseNeutral }),
        ).toEqual([first, next, 'Tail...', 'Still inside.’ Next.']);
      }
    },
  );

  test.each(['.12 more.', '.12 points.'])(
    'preserves the leading decimal after four spaced dots before %s',
    (continuation) => {
      const first = 'She said ‘Use ‘notes . . . .';
      const next = `${continuation}’`;
      for (const caseNeutral of [false, true]) {
        expect(
          rouge.sentenceSegment(`${first} ${next} Tail... Still inside.’ Next.`, { caseNeutral }),
        ).toEqual([first, next, 'Tail...', 'Still inside.’ Next.']);
      }
    },
  );
});

describe('Ellipsis delimiter handoffs use the complete source context', () => {
  test.each([' ', '\t', '\n', '  '])('consumes a pending single closer after %j', (gap) => {
    const first = `He said 'Enough...${gap}'`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next sentence.`, { caseNeutral })).toEqual([
        first.replaceAll('\n', ' '),
        'Next sentence.',
      ]);
      const nested = `He said "She said 'Enough...${gap}' More."`;
      expect(rouge.sentenceSegment(`${nested} Next.`, { caseNeutral })).toEqual([
        nested.replaceAll('\n', ' '),
        'Next.',
      ]);
    }
  });

  test.each(['Next sentence.', '"Next sentence."'])(
    'keeps the single closer before an adjacent %s',
    (next) => {
      const first = "He said 'Enough...'";
      expect(rouge.sentenceSegment(first + next)).toEqual([first, next]);
      expect(rouge.sentenceSegment(first + next, { caseNeutral: true })).toEqual([first, next]);
      expect(rouge.sentenceSegment((first + next).toLowerCase(), { caseNeutral: true })).toEqual([
        first.toLowerCase(),
        next.toLowerCase(),
      ]);
    },
  );

  test('consumes a spaced single closer before an ASCII opening quote', () => {
    const first = "He said 'Enough... '";
    const second = '"Next sentence."';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(first + second, { caseNeutral })).toEqual([first, second]);
      const ambiguous = `${first}Next sentence.`;
      expect(rouge.sentenceSegment(ambiguous, { caseNeutral })).toEqual([ambiguous]);
    }
  });

  test.each([
    "He said 'Enough...'and then continued.",
    "He said 'Enough...'before leaving.",
    "He said 'Enough...'5 examples followed.",
    "He said 'Enough...''cause it rained.",
    "He said 'Enough...''Next sentence.'",
    "He said 'Enough... ' (or more) today.",
    'He said "She said \'Enough...\'Next sentence."',
  ])('retains the existing continuation or pending outer quotation in %s', (input) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test.each(['....', ' . . . .'])(
    'preserves the spaced single-closer priority after %s',
    (dots) => {
      const first = `He said 'Enough${dots}`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`${first} ' Next sentence.`, { caseNeutral })).toEqual([
          first,
          "' Next sentence.",
        ]);
      }
    },
  );

  test('retains single-guillemet contents and releases completed quotations', () => {
    const input = 'He said ‹Alpha... Beta.› today.';
    expect(rouge.sentenceSegment(input)).toEqual([input]);
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([
      'He said ‹Alpha... Beta.›',
      'today.',
    ]);
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('He said ‹Enough...› Next sentence.', { caseNeutral })).toEqual([
        'He said ‹Enough...›',
        'Next sentence.',
      ]);
      expect(rouge.sentenceSegment('He said ‹Enough...›"Next sentence."', { caseNeutral })).toEqual(
        ['He said ‹Enough...›', '"Next sentence."'],
      );
      expect(rouge.sentenceSegment("He said 'Enough...'‹Next sentence.›", { caseNeutral })).toEqual(
        ["He said 'Enough...'", '‹Next sentence.›'],
      );
    }
  });

  test.each([
    'He paused... ‹Perhaps deliberately,› before answering.',
    'He paused... (‹inside [literal› aside) before answering.',
    'Alpha... ‹100 points.›',
  ])('keeps a single-guillemet aside or complete quantity in %s', (input) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test.each([
    'He said ‹“Alpha... Beta.” More.›',
    'He said “‹Alpha... Beta.› More.”',
    'He said ‹Alpha... [Beta...› and left...',
  ])('retains mixed quotation ownership and literal brackets in %s', (first) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
    }
  });

  test.each(['a<b', 'a< b', 'a <b', 'a < b', 'α<β', '1<2'])(
    'treats an unmatched angle comparison as prose before an ellipsis: %s',
    (comparison) => {
      const first = `The expression ${comparison} is true...`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`${first} Beta followed.`, { caseNeutral })).toEqual([
          first,
          'Beta followed.',
        ]);
      }
    },
  );

  test.each(['"Quoted > symbol."', "'Quoted > symbol.'", '‹Quoted > symbol.›'])(
    'does not borrow an angle closer from %s',
    (quoted) => {
      const first = 'The expression x<y is true...';
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`${first} ${quoted} Next.`, { caseNeutral })).toEqual([
          first,
          quoted,
          'Next.',
        ]);
      }
    },
  );

  test('keeps matched angle spans and the existing angle-aside syntax', () => {
    for (const caseNeutral of [false, true]) {
      const first = 'The expression <Alpha... Beta.> ended...';
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
      for (const input of [
        'Alpha... <Perhaps> before answering.',
        "Alpha... <quoted 'literal >' text> continued.",
      ]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
      for (const next of ['<5> before answering.', '< 5 > before answering.']) {
        expect(rouge.sentenceSegment(`Alpha... ${next}`, { caseNeutral })).toEqual([
          'Alpha...',
          next,
        ]);
      }
    }
  });

  test('aligns angle context across accepted citations, line wraps and question lookahead', () => {
    for (const caseNeutral of [false, true]) {
      const body = 'The expression x<y is true... Beta followed.';
      for (const [prefix, separator] of [
        ['Alpha.[1]', ' '],
        ['Intro.', '\n'],
      ]) {
        expect(rouge.sentenceSegment(prefix + separator + body, { caseNeutral })).toEqual([
          prefix,
          'The expression x<y is true...',
          'Beta followed.',
        ]);
      }
      expect(
        rouge.sentenceSegment('"No." Was x<y true... Next question?', { caseNeutral }),
      ).toEqual(['"No." Was x<y true...', 'Next question?']);
    }
  });

  test.each(["''", '``'])(
    'keeps a %s alias opener whose closer is in a later fragment',
    (opening) => {
      const input = `${opening}Outer... 'Inner...' tail... Next''`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        expect(rouge.sentenceSegment(`He said ${input}`, { caseNeutral })).toEqual([
          `He said ${input}`,
        ]);
      }
    },
  );

  test('preserves malformed alias recovery without consuming the next opening single quote', () => {
    const input = "''Outer... 'Inner...' tail...";
    expect(rouge.sentenceSegment(input)).toEqual([input]);
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([
      "''Outer... 'Inner...'",
      'tail...',
    ]);
  });
});

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test.each([
      ['“', '”'],
      ['‘', '’'],
    ])('retains spaced ellipsis boundaries before %s%s closers', (open, close) => {
      const first = `He said ${open}Wait . . . .${close}`;
      const expected = [first, 'Next.'];
      expect(ss(`${first} Next.`)).toEqual(expected);
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual(expected);
    });
  });
});

describe('Scoped questions preserve accepted ellipsis boundaries', () => {
  test.each(['....', '.....', ' . . . .'])(
    'honors the accepted or retained decision inside a paired span for %j',
    (ellipsis) => {
      const prefix = 'She asked “Acme Co.';
      const question = `Which ‘Alpha${ellipsis} next.’ did she quote?”`;
      const input = `${prefix}\n${question}`;
      expect(rouge.sentenceSegment(input)).toEqual([prefix, question]);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([
        `${prefix} Which ‘Alpha${ellipsis}`,
        'next.’ did she quote?”',
      ]);
    },
  );

  test('uses the actual spaced boundary instead of a bare-ellipsis quantity decision', () => {
    const prefix = 'She asked “Acme Co.';
    const bare = 'Which ‘Alpha.... 12 points.’ did she quote?”';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${prefix}\n${bare}`, { caseNeutral })).toEqual([prefix, bare]);
      expect(
        rouge.sentenceSegment(`${prefix}\nWhich ‘Alpha . . . . .5 points.’ did she quote?”`, {
          caseNeutral,
        }),
      ).toEqual([`${prefix} Which ‘Alpha . . . .`, '.5 points.’ did she quote?”']);
    }
  });

  test('preserves accepted unspaced malformed-annotation boundaries without extending citation syntax', () => {
    const prefix = 'She asked “Acme Co.';
    const question = 'Which ‘Alpha....[x] next.’ did she quote?”';
    expect(rouge.sentenceSegment(`${prefix}\n${question}`)).toEqual([prefix, question]);
    expect(rouge.sentenceSegment(`${prefix}\n${question}`, { caseNeutral: true })).toEqual([
      `${prefix} Which ‘Alpha....`,
      '[x] next.’ did she quote?”',
    ]);
  });
});
