import * as rouge from '../src/rouge';
import { expectBundledScriptToPass } from './helpers';

describe('Comparison operators in quotation question lookahead', () => {
  test.each(['x <5', 'x < 5', 'x < y', 'x <\t5'])(
    'keeps the preceding quotation separate before %s',
    (comparison) => {
      const input = `"It ended." Was ${comparison}? Next.`;
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([
        '"It ended."',
        `Was ${comparison}?`,
        'Next.',
      ]);
      // The ordinary cased scanner keeps its existing spaced letter continuation.
      expect(rouge.sentenceSegment(input)).toEqual(
        comparison === 'x < y'
          ? ['"It ended."', `Was ${comparison}? Next.`]
          : ['"It ended."', `Was ${comparison}?`, 'Next.'],
      );
    },
  );

  test.each(['<team>', '<𐐀team>', '"< y"', '“<5”'])(
    'retains literal angle and quoted contexts in %s',
    (argument) => {
      const input = `"It ended." Was ${argument} ready? Next.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
          '"It ended."',
          `Was ${argument} ready?`,
          'Next.',
        ]);
      }
    },
  );
});

describe('Attached annotations in quotation question lookahead', () => {
  test.each(['[x]', '(x)', '{x}', '<x>', '[word]'])(
    'uses the ordinary boundary decision before %s',
    (annotation) => {
      const question = `Was Alice choosing Alpha.${annotation} or Beta?`;
      for (const quotation of ['"No."', '“No.”', '‹No.›']) {
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(question, { caseNeutral })).toEqual(
            caseNeutral ? ['Was Alice choosing Alpha.', `${annotation} or Beta?`] : [question],
          );
          expect(rouge.sentenceSegment(`${quotation} ${question}`, { caseNeutral })).toEqual(
            caseNeutral
              ? [`${quotation} Was Alice choosing Alpha.`, `${annotation} or Beta?`]
              : [quotation, question],
          );
        }
      }
    },
  );

  test('preserves actual boundaries before spaced, uppercase and numeric annotations', () => {
    for (const annotation of [' [x]', '[X]', '{1}', '<1>']) {
      const input = `"No." Was Alice choosing Alpha.${annotation} or Beta?`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
          '"No." Was Alice choosing Alpha.',
          `${annotation.trimStart()} or Beta?`,
        ]);
      }
    }
  });

  test('keeps a real period after a quoted-subject predicate authoritative', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('"No." Was Alice\'s answer.', { caseNeutral })).toEqual([
        '"No." Was Alice\'s answer.',
      ]);
      expect(
        rouge.sentenceSegment('"No." Was Alice\'s answer. Was Bob ready?', { caseNeutral }),
      ).toEqual(['"No." Was Alice\'s answer.', 'Was Bob ready?']);
    }
  });

  test('uses the next real terminal after a retained annotation in ambiguous auxiliary prose', () => {
    const body = "Was Alice's answer.[x] Was Bob ready?";
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`"No." ${body}`, { caseNeutral })).toEqual(
        caseNeutral ? ['"No." Was Alice\'s answer.', '[x] Was Bob ready?'] : ['"No."', body],
      );
    }
  });

  test('retains attribution when the continued annotation ends in a statement', () => {
    const input = '"No." Was Alice choosing Alpha.[x] or Beta.';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual(
        caseNeutral ? ['"No." Was Alice choosing Alpha.', '[x] or Beta.'] : [input],
      );
    }
  });

  test('keeps repeated annotation question queries independent', () => {
    expectBundledScriptToPass(
      `
        const spans = ['"No."', 'Was Alice choosing Alpha.[x] or Beta?',
          '"Yes."', 'Was Bob choosing Gamma.(word) or Delta?'];
        const input = Array(128).fill(spans.join(' ')).join(' ');
        const actual = module.exports.sentenceSegment(input);
        if (actual.length !== 512 || actual.some((span, index) => span !== spans[index % 4])) {
          throw new Error('Repeated annotation question boundaries changed');
        }
        process.stdout.write('ok');
      `,
      5000,
    );
  }, 10_000);
});

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test.each([
      ['which operates abroad.', 'Which operates abroad?'],
      ['who works abroad.', 'Who works abroad?'],
      ['whose office closed.', 'Whose office closed?'],
      ['whom we consulted.', 'Whom did we consult?'],
    ])('distinguishes a quoted relative clause from a question: %s', (relative, question) => {
      for (const [open, close] of [
        ['“', '”'],
        ['‘', '’'],
      ]) {
        const first = `She described ${open}Acme Co.`;
        const input = `${first}\n${relative}${close}`;
        expect(ss(input)).toEqual([input.replaceAll('\n', ' ')]);
        expect(segmentCaseNeutrally(input)).toEqual([input.replaceAll('\n', ' ')]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          input.toLowerCase().replaceAll('\n', ' '),
        ]);
        const second = `${question}${close}`;
        expect(ss(`${first}\n${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first}\n${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first}\n${second}`.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
      }
    });

    test.each([
      ['‘', '’'],
      ['“', '”'],
    ])('recognizes a straight quote immediately inside %s%s', (open, close) => {
      const first = `${open}"Stop."${close}`;
      expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(rouge.treeBankTokenize(first)).toEqual([open, '``', 'Stop.', "''", close]);
    });

    test.each(['http://', 'https://', 'www.'])(
      'ignores query and path punctuation in scoped questions with %s',
      (prefix) => {
        const first = 'She asked “Acme Co.';
        for (const punctuation of ['?', '!']) {
          const second = `Which ${prefix}example.com/a${punctuation}b was it?”`;
          const input = `${first}\n${second}`;
          expect(ss(input)).toEqual([first, second]);
          expect(segmentCaseNeutrally(input)).toEqual([first, second]);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
            first.toLowerCase(),
            second.toLowerCase(),
          ]);
          const relative = `She described “Acme Co.\nwhose link is ${prefix}example.com/a${punctuation}b and stays here.”`;
          expect(ss(relative)).toEqual([relative.replaceAll('\n', ' ')]);
          expect(segmentCaseNeutrally(relative)).toEqual([relative.replaceAll('\n', ' ')]);
          expect(segmentCaseNeutrally(relative.toLowerCase())).toEqual([
            relative.toLowerCase().replaceAll('\n', ' '),
          ]);
        }
      },
    );

    test.each(['.?', '!?', '?..!', '...?!'])(
      'protects the URL punctuation run %s inside a wrapped question',
      (run) => {
        const first = 'She asked “Acme Co.';
        const second = `Which https://example.com/path${run}query was it?”`;
        expect(ss(`${first}\n${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first}\n${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first}\n${second}`.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
        const relative = `She described “Acme Co.\nwhose path is https://example.com/path${run}query today.”`;
        expect(ss(relative)).toEqual([relative.replaceAll('\n', ' ')]);
        expect(segmentCaseNeutrally(relative)).toEqual([relative.replaceAll('\n', ' ')]);
      },
    );

    test.each(['Which one?', 'Whose example.com?', 'What happened?'])(
      'normalizes a Treebank opener before the wrapped starter %s',
      (question) => {
        const first = 'Use etc.';
        const second = `\`\`${question}''`;
        expect(ss(`${first}\n${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first}\n${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first}\n${second}`.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
      },
    );

    test('retains an actual question after a long punctuated URL', () => {
      const first = 'She asked “Acme Co.';
      const second = `Which https://example.com/${'path!query?'.repeat(20_000)}end was it?”`;
      expect(ss(`${first}\n${second}`)).toEqual([first, second]);
      expect(segmentCaseNeutrally(`${first}\n${second}`)).toEqual([first, second]);
    }, 5000);

    test.each([
      'Which example.com?',
      'Which https://example.xyz?',
      'Which Mr. Smith?',
      'Who chose 1.2?',
      'Whose U.S. government closed?',
    ])('finds a question terminal beyond protected periods: %s', (question) => {
      const first = 'She asked “Acme Co.';
      const second = `${question}”`;
      const input = `${first}\n${second}`;
      expect(ss(input)).toEqual([first, second]);
      expect(segmentCaseNeutrally(input)).toEqual([first, second]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
        first.toLowerCase(),
        second.toLowerCase(),
      ]);
      const parenthetical = `He joined “Acme Co.” (It closed.) ${question}`;
      expect(ss(parenthetical)).toEqual(['He joined “Acme Co.”', '(It closed.)', question]);
      expect(segmentCaseNeutrally(parenthetical)).toEqual([
        'He joined “Acme Co.”',
        '(It closed.)',
        question,
      ]);
    });

    test.each([
      ['‘', '’'],
      ['“', '”'],
      ['"', '"'],
      ["'", "'"],
      ['``', "''"],
    ])('keeps inner %s%s terminals inside an enclosing question', (open, close) => {
      const first = 'She asked “Acme Co.';
      const question = `Which ${open}Stop.${close} did she quote?`;
      const second = `${question}”`;
      const input = `${first}\n${second}`;
      const parenthetical = ['He joined “Acme Co.”', '(It closed.)', question];
      for (const segment of [ss, segmentCaseNeutrally]) {
        expect(segment(input)).toEqual([first, second]);
        expect(segment(parenthetical.join(' '))).toEqual(parenthetical);
      }
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
        first.toLowerCase(),
        second.toLowerCase(),
      ]);
      expect(segmentCaseNeutrally(parenthetical.join(' ').toLowerCase())).toEqual(
        parenthetical.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each([
      ['“', '”'],
      ['‘', '’'],
      ['"', '"'],
      ["'", "'"],
      ['``', "''"],
    ])('recognizes a scoped question behind leading %s%s', (open, close) => {
      const inner = open === '‘' ? '“what?”' : '‘what?’';
      const first = `${open}Which ${inner} did she quote?${close}`;
      const input = `${first} Next.`;
      expect(ss(input)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'next.']);
    });

    test.each(['whose headquarters are in the U.S.', 'whose advisor is Mr. Smith.'])(
      'stops question lookahead at the outer closer after %s',
      (relative) => {
        const first = `She described “Acme Co.\n${relative}”`;
        const expected = [first.replaceAll('\n', ' '), 'What followed?'];
        const input = `${first} What followed?`;
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test.each(['Whose U.S.’ economy grew?', 'Which ‘twas odd’ line did she quote?'])(
      'retains literal apostrophes while locating a question terminal: %s',
      (question) => {
        const first = 'She asked “Acme Co.';
        const second = `${question}”`;
        const input = `${first}\n${second}`;
        expect(ss(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
      },
    );

    test.each(['²', '2', '𝟚', 'ᵃ', '2ᵃ', '\u{107a5}'])(
      'recognizes a nested question with citation %s at the enclosing scope end',
      (citation) => {
        for (const [outerOpen, outerClose, innerOpen, innerClose] of [
          ['“', '”', '‘', '’'],
          ['‘', '’', '"', '"'],
          ['“', '”', "'", "'"],
          ['“', '”', '``', "''"],
        ]) {
          const first = `She said ${outerOpen}Use etc.`;
          const second = `Which answer was ${innerOpen}What?${innerClose}${citation}${outerClose}`;
          const input = `${first}\n${second}`;
          expect(ss(input)).toEqual([first, second]);
          expect(segmentCaseNeutrally(input)).toEqual([first, second]);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
            first.toLowerCase(),
            second.toLowerCase(),
          ]);
        }
      },
    );

    test.each(['² and left.', '² while waiting.'])(
      'does not treat an inner question with continuation %s as ending its scope',
      (tail) => {
        const input = `She said “Use etc.\nWhich answer was ‘What?’${tail}”`;
        const expected = [input.replaceAll('\n', ' ')];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test('preserves a later outer question after a cited inner question', () => {
      const first = 'She said “Use etc.';
      const second = 'Which answer was ‘What?’² and why?”';
      expect(ss(`${first}\n${second}`)).toEqual([first, second]);
      expect(segmentCaseNeutrally(`${first}\n${second}`)).toEqual([first, second]);
    });

    test.each(['', ' Next.'])('retains a final quoted question before tail %s', (tail) => {
      const sentences = ['He joined “Acme Co.”', '(It closed.)', 'Which “what?”'];
      const expected = tail ? [...sentences, tail.trimStart()] : sentences;
      const input = `${sentences.join(' ')}${tail}`;
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['‘Stop?’,', '‘Stop?’—'])(
      'keeps an inner question separate from a relative-clause terminal: %s',
      (quoted) => {
        const first = `She described “Acme Co.\nwhose motto was ${quoted} then left.”`;
        const input = `${first} What followed?`;
        const expected = [first.replaceAll('\n', ' '), 'What followed?'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each(['Which', 'Whose', 'Whom'])(
      'ignores possessive casing while locating a neutral %s terminal',
      (starter) => {
        const input = `She asked “Acme Co.\n${starter} 'Paris' Alice. 'Stop.' Who asked?”`;
        const expected = [input.replaceAll('\n', ' ')];
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test.each(['whose advisor is Mr. Smith.', 'whose office is on example.com.'])(
      'keeps a relative clause with protected periods joined: %s',
      (relative) => {
        const input = `She described “Acme Co.\n${relative}”`;
        const expected = input.replaceAll('\n', ' ');
        expect(ss(input)).toEqual([expected]);
        expect(segmentCaseNeutrally(input)).toEqual([expected]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([expected.toLowerCase()]);
      },
    );

    test('stops a relative-clause lookahead at the terminal after a URL', () => {
      const first = 'She described “Acme Co.\nwhose site is https://example.com.';
      const second = 'Who asked?”';
      const input = `${first} ${second}`;
      const expected = [input.replaceAll('\n', ' ')];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['. Who asked?”', ' ended. Who asked?”'])(
      'stops question lookahead after a long URL with tail %s',
      (tail) => {
        const input = `She described “Acme Co.\nwhose site is https://example.com/${'path'.repeat(100)}${tail}`;
        const expected = [input.replaceAll('\n', ' ')];
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
    ])('closes a nested straight quotation before its outer %s%s closer', (open, close) => {
      const first = `${open}He said 'Stop.'${close}`;
      const input = `${first} Next.'Another.'`;
      expect(ss(input)).toEqual([first, 'Next.', "'Another.'"]);
      expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.', "'Another.'"]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
        first.toLowerCase(),
        'next.',
        "'another.'",
      ]);
    });

    test.each(['“Next.”', '‘Next.’', '"Next."', '(Next.)'])(
      'recognizes a delimited tail after a separate parenthetical: %s',
      (third) => {
        const first = 'He joined “Acme Co.”';
        const second = '(It closed.)';
        const input = `${first} ${second} ${third}`;
        expect(ss(input)).toEqual([first, second, third]);
        expect(segmentCaseNeutrally(input)).toEqual([first, second, third]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
          third.toLowerCase(),
        ]);
      },
    );

    test.each(['Which one . . .?', 'Which one .\t. .?', 'Which one . . . .?'])(
      'recognizes a question beyond protected spaced ellipses: %s',
      (question) => {
        const first = 'She said “Use etc.';
        const second = `${question}”`;
        const input = `${first}\n${second}`;
        expect(ss(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input)).toEqual([first, second]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
        const parenthetical = `He joined “Acme Co.” (It closed.) ${question}`;
        expect(ss(parenthetical)).toEqual(['He joined “Acme Co.”', '(It closed.)', question]);
        expect(segmentCaseNeutrally(parenthetical)).toEqual([
          'He joined “Acme Co.”',
          '(It closed.)',
          question,
        ]);
      },
    );

    test.each(['whose office . . . remained.', 'Which one . . . indeed.'])(
      'retains a non-question continuation across a spaced ellipsis: %s',
      (clause) => {
        const input = `She said “Use etc.\n${clause}”`;
        const expected = input.replaceAll('\n', ' ');
        expect(ss(input)).toEqual([expected]);
        expect(segmentCaseNeutrally(input)).toEqual([expected]);
      },
    );

    test('stops question lookahead at a genuine four-dot boundary in its casing mode', () => {
      const input = 'She said “Use etc.\nWhich one . . . . Next?”';
      const expected = ['She said “Use etc. Which one . . . .', 'Next?”'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      const lowercase = input.replace('Next?', 'next?');
      expect(ss(lowercase)).toEqual(['She said “Use etc.', 'Which one . . . . next?”']);
      expect(segmentCaseNeutrally(lowercase)).toEqual([expected[0], 'next?”']);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });
  });
});
