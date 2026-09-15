import * as rouge from '../src/rouge';

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test('segments numbered lists after introductory prose', () => {
      const input = 'Intro. 1. Alpha 2. Beta.';
      expect(ss(input)).toEqual(['Intro.', '1. Alpha', '2. Beta.']);
      expect(segmentCaseNeutrally(input)).toEqual(['Intro.', '1. Alpha', '2. Beta.']);
      expect(rouge.n(input, '1. Alpha 2. Beta. Intro.')).toBe(1);
      expect(rouge.l(input, '1. Alpha 2. Beta. Intro.')).toBe(1);
    });

    test('segments reordered numbered lists after introductory prose', () => {
      expect(ss('Intro. 2. Beta 1. Alpha.')).toEqual(['Intro.', '2. Beta', '1. Alpha.']);
      expect(rouge.l('Intro. 1. Alpha 2. Beta.', 'Intro. 2. Beta 1. Alpha.')).toBe(1);
    });

    test('accepts dash-delimited introductory prose', () => {
      expect(ss('Options — 1. Alpha 2. Beta.')).toEqual(['Options —', '1. Alpha', '2. Beta.']);
    });

    test('keeps mixed-case list markers invariant under case folding', () => {
      const input = 'Intro: A. Alpha b. Beta.';
      expect(segmentCaseNeutrally(input)).toEqual(['Intro:', 'A. Alpha', 'b. Beta.']);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(['intro:', 'a. alpha', 'b. beta.']);
      expect(rouge.l(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
    });

    test('compares repeated alphabetical markers case-neutrally', () => {
      const input = 'Intro: A. Alpha a. Beta.';
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        segmentCaseNeutrally(input).map((sentence) => sentence.toLowerCase()),
      );
      expect(rouge.l(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
    });

    test('preserves distinct final-sigma labels under JavaScript lowercasing', () => {
      const input = 'Intro: Σ. Alpha ς. Beta.';
      const expected = ['Intro:', 'Σ. Alpha', 'ς. Beta.'];
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
      expect(rouge.l(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
    });

    test.each(['ı. Alpha i. Beta.', 'I. Alpha ı. Beta.'])(
      'preserves distinct dotless-i labels under JavaScript lowercasing: %s',
      (items) => {
        const input = `Intro: ${items}`;
        const expected = ['Intro:', items.slice(0, 8), items.slice(9)];
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
        expect(rouge.l(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
      },
    );

    test('keeps an explicitly quoted letter separate from a later real list', () => {
      const input = 'He wrote ‘n’ on the card. Options: a) Alpha b) Beta.';
      const expected = ['He wrote ‘n’ on the card.', 'Options:', 'a) Alpha', 'b) Beta.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('compares case-expanding sharp-S list markers consistently', () => {
      const input = 'Intro: ß. Alpha ẞ. Beta.';
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        segmentCaseNeutrally(input).map((sentence) => sentence.toLowerCase()),
      );
      expect(rouge.l(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
    });

    test('accepts case-expanded combining marks in alphabetical markers', () => {
      const input = 'Intro: İ. Alpha J. Beta.';
      expect(segmentCaseNeutrally(input)).toEqual(['Intro:', 'İ. Alpha', 'J. Beta.']);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        segmentCaseNeutrally(input).map((sentence) => sentence.toLowerCase()),
      );
      expect(rouge.l(input, input.toLowerCase(), { caseSensitive: false })).toBe(1);
    });

    test('keeps Unicode titlecase markers in the same alphabetical list', () => {
      expect(ss('ǅ. Alpha ǈ. Beta ǋ. Gamma')).toEqual(['ǅ. Alpha', 'ǈ. Beta', 'ǋ. Gamma']);
    });

    test('keeps Unicode Roman numeral markers in the same alphabetical list', () => {
      expect(ss('Ⅰ. Alpha Ⅱ. Beta Ⅲ. Gamma')).toEqual(['Ⅰ. Alpha', 'Ⅱ. Beta', 'Ⅲ. Gamma']);
    });

    test('accepts uncased and numeric alphabetical list-item bodies', () => {
      expect(ss('a) 100 widgets b) 200 widgets')).toEqual(['a) 100 widgets', 'b) 200 widgets']);
      expect(rouge.l('a) 100 widgets b) 200 widgets', 'b) 200 widgets a) 100 widgets')).toBe(1);
      expect(ss('a) 中文 b) 日文')).toEqual(['a) 中文', 'b) 日文']);
    });

    test.each(['#topic', '@person', '/path', '—aside'])(
      'accepts punctuation-led list bodies: %s',
      (body) => {
        const first = `a) ${body} one`;
        const second = `b) ${body} two`;
        expect(ss(`${first} ${second}`)).toEqual([first, second]);
        expect(rouge.l(`${first} ${second}`, `${second} ${first}`)).toBe(1);
      },
    );

    test.each(["'Alice's (team)'", '‘Alice’s (team)’', '‘𝒜’s (team)’'])(
      'retains list markers after quoted possessives: %s',
      (label) => {
        const input = `1) The label ${label} 2) Beta`;
        const expected = [`1) The label ${label}`, '2) Beta'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each(['J.', 'J. K.'])('keeps leading initials in dotted list bodies: %s', (initials) => {
      const input = `A. ${initials} Smith will attend B. K. Brown will attend`;
      const expected = [`A. ${initials} Smith will attend`, 'B. K. Brown will attend'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('prefers an outer list family over nested marker pairs', () => {
      const input = '1. Alpha a) One b) Two 2. Beta';
      expect(ss(input)).toEqual(['1. Alpha a) One b) Two', '2. Beta']);
      expect(rouge.l(input, '2. Beta 1. Alpha a) One b) Two')).toBe(1);
    });

    test('keeps a deferred inner family together after an outer item sentence', () => {
      const input = '1. Alpha. a) One b) Two 2. Beta';
      const expected = ['1. Alpha.', 'a) One b) Two', '2. Beta'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([':', '—'])('keeps quoted marker-like text after %s inside prose', (separator) => {
      const input = `Options${separator}"team A) Alice and team B) Bob."`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test('does not seed an embedded list from consecutive prose initials', () => {
      const input = 'I met John A. B. Smith. Intro: C. Alpha D. Beta.';
      expect(ss(input)).toEqual(['I met John A. B. Smith.', 'Intro:', 'C. Alpha', 'D. Beta.']);
      expect(segmentCaseNeutrally(input)).toEqual([
        'I met John A.',
        'B.',
        'Smith.',
        'Intro:',
        'C. Alpha',
        'D. Beta.',
      ]);
    });

    test('defers an overflowing numeric marker before a nearby item', () => {
      const number = '9'.repeat(320);
      const input = `1. First ${number}. Last 2. Next`;
      const expected = [`1. First ${number}.`, 'Last', '2. Next'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['#1', '(best)', '$5', '— best'])(
      'confirms punctuation-led possessive modifiers inside a quotation: %s',
      (modifier) => {
        for (const [opening, closing] of [
          ["'", "'"],
          ['‘', '’'],
        ]) {
          const input = `He said ${opening}The students${closing} ${modifier} choices were a) Alpha and b) Beta.${closing}`;
          const reordered = `He said ${opening}The students${closing} ${modifier} choices were b) Beta and a) Alpha.${closing}`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
          expect(rouge.l(input, reordered)).toBeLessThan(1);
        }
      },
    );

    test.each([
      "He said 'The year '99 saw a) Alpha and b) Beta.'",
      "He said '100 years after '99 we saw a) Alpha and b) Beta.'",
      "He said 'The students' choices in '99 were a) Alpha and b) Beta.'",
    ])('retains nested numeric elisions without replacing the outer quote: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test('recovers a later numeric quote after an earlier unpaired numeric elision', () => {
      const input = "In '99, a) Alpha b) Beta. He said '100 options a) One b) Two.'";
      const expected = ["In '99,", 'a) Alpha', 'b) Beta.', "He said '100 options a) One b) Two.'"];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('recognizes a separate numeric quotation after an ordinary quote closes', () => {
      const first = "He said 'No.'";
      const second = "Then said '99 choices were a) Alpha and b) Beta.'";
      const input = `${first} ${second} Options: a) First b) Last.`;
      const expected = [first, second, 'Options:', 'a) First', 'b) Last.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('retains a contiguous author-name chain while anchoring its current initial', () => {
      const authors = 'Authors: A. Smith and B. Jones and C. Adams.';
      expect(ss(authors)).toEqual([authors]);
      expect(segmentCaseNeutrally(authors)).toEqual([authors]);
      expect(segmentCaseNeutrally(`${authors} Finally, D. is important.`)).toEqual([
        authors,
        'Finally, D.',
        'is important.',
      ]);
    });

    test.each(['Finally, C. is important.', 'Finally, C. Is important.'])(
      'does not borrow earlier author initials for a later boundary: %s',
      (later) => {
        const authors = 'Authors: A. Smith and B. Jones.';
        expect(ss(`${authors} ${later}`)).toEqual([authors, ...ss(later)]);
        expect(segmentCaseNeutrally(`${authors} ${later}`)).toEqual([
          authors,
          ...segmentCaseNeutrally(later),
        ]);
      },
    );

    test.each([1, 2, 3, 4])('uses backslash parity for literal list quotes: %d', (count) => {
      const backslashes = String.fromCharCode(92).repeat(count);
      for (const quote of ['"', "'"]) {
        const input = `Set value=${quote}x ${backslashes}${quote}team a) Alpha b) Beta${backslashes}${quote} tail${quote}.`;
        if (count % 2 === 1) {
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          expect(
            rouge.l(input, input.replace('a) Alpha b) Beta', 'b) Beta a) Alpha')),
          ).toBeLessThan(1);
        } else {
          expect(ss(input).length).toBeGreaterThan(1);
          expect(segmentCaseNeutrally(input).length).toBeGreaterThan(1);
        }
      }
    });

    test.each([
      ["<'99 > team A) Alice and team B) Bob'>", ["<'99 > team A) Alice and team B) Bob'>"]],
      [
        "He said '99 options \\'team a) Alpha b) Beta\\' tail.'",
        ["He said '99 options \\'team a) Alpha b) Beta\\' tail.'"],
      ],
      ['<"x \\" > \\" team A) Alice and B) Bob">', ['<"x \\" > \\" team A) Alice and B) Bob">']],
      [
        '(He wrote "x \\" ) \\" team a) Alpha b) Beta".)',
        ['(He wrote "x \\" ) \\" team a) Alpha b) Beta".)'],
      ],
      ['He wrote \\"team a) Alpha b) Beta.', ['He wrote \\"team', 'a) Alpha', 'b) Beta.']],
    ])('shares escaped and numeric closing context across list scans: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['•', '⁃'])(
      'compares bullet-prefixed numeric outliers consistently: %s',
      (bullet) => {
        const number = '9'.repeat(320);
        for (const middlePrefix of ['', `${bullet} `]) {
          const first = `${bullet} 1. First ${middlePrefix}${number}.`;
          const last = `${bullet} 2. Next`;
          const input = `${first} Last ${last}`;
          const expected = [first, 'Last', last];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
        }
      },
    );

    test('scans long escaped-quote backslash runs without rescanning nonquote characters', () => {
      const backslashes = String.fromCharCode(92).repeat(99_999);
      const input = `Set value="x ${backslashes}"team a) Alpha b) Beta${backslashes}" tail".`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    }, 5000);

    test.each([
      ["Authors: A. O'Neil and B. Jones.", ["Authors: A. O'Neil and B. Jones."]],
      ['Authors: A. Smith-Jones and B. D’Arcy.', ['Authors: A. Smith-Jones and B. D’Arcy.']],
      [
        "Authors: A. Smith and B. O'Neil and C. D’Arcy.",
        ["Authors: A. Smith and B. O'Neil and C. D’Arcy."],
      ],
      [
        "Authors: A. O'Neil and B. Jones. Finally, C. is important.",
        ["Authors: A. O'Neil and B. Jones.", 'Finally, C.', 'is important.'],
      ],
      ['Authors: A. D’Arcy and B. O’Neil.', ['Authors: A. D’Arcy and B. O’Neil.']],
      [
        "Authors: A. O'Neil and B. Jones. Options: C. First D. Last.",
        ["Authors: A. O'Neil and B. Jones.", 'Options:', 'C. First', 'D. Last.'],
      ],
      ['2020. Alpha 2021. Beta', ['2020. Alpha', '2021. Beta']],
      [' 2020. Alpha 2021. Beta 2022. Gamma', ['2020. Alpha', '2021. Beta', '2022. Gamma']],
      ['Intro: 2020. Alpha 2021. Beta', ['Intro:', '2020. Alpha', '2021. Beta']],
      [
        'We started in 2020. Work ended in 2021. Next.',
        ['We started in 2020.', 'Work ended in 2021.', 'Next.'],
      ],
      [
        '1. Alpha in 2020. More prose 2. Beta in 2021. Last.',
        ['1. Alpha in 2020.', 'More prose', '2. Beta in 2021.', 'Last.'],
      ],
      [
        'Intro: 1. Alpha 2020. More prose 2. Beta',
        ['Intro:', '1. Alpha 2020.', 'More prose', '2. Beta'],
      ],
      ['2020. Alpha. More detail 2021. Beta', ['2020. Alpha.', 'More detail', '2021. Beta']],
      [
        'Options: A. Alpha in 2020. B. Beta in 2021.',
        ['Options:', 'A. Alpha in 2020.', 'B. Beta in 2021.'],
      ],
    ])('retains punctuated author names and year-shaped list labels: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each([
      [
        'He said ‘rock ’n’ roll has a) Alpha and b) Beta.’',
        ['He said ‘rock ’n’ roll has a) Alpha and b) Beta.’'],
      ],
      [
        "He said 'rock 'n' roll has a) Alpha and b) Beta.'",
        ["He said 'rock 'n' roll has a) Alpha and b) Beta.'"],
      ],
      [
        'He said ‘rock ’N’ roll has a) Alpha and b) Beta.’',
        ['He said ‘rock ’N’ roll has a) Alpha and b) Beta.’'],
      ],
      [
        "He said '100 rock 'n' roll choices a) Alpha and b) Beta.'",
        ["He said '100 rock 'n' roll choices a) Alpha and b) Beta.'"],
      ],
      [
        "Rock 'n' roll. Options: a) Alpha b) Beta.",
        ["Rock 'n' roll.", 'Options:', 'a) Alpha', 'b) Beta.'],
      ],
      [
        'Rock ’n’ roll. Options: a) Alpha b) Beta.',
        ['Rock ’n’ roll.', 'Options:', 'a) Alpha', 'b) Beta.'],
      ],
      [
        "He wrote 'n' on the card. Options: a) Alpha b) Beta.",
        ["He wrote 'n' on the card.", 'Options:', 'a) Alpha', 'b) Beta.'],
      ],
      [
        "In '99, a) Alpha b) Beta. He wrote 'n'.",
        ["In '99,", 'a) Alpha', 'b) Beta.', "He wrote 'n'."],
      ],
      [
        '<He wrote ‘rock ’n’ roll > team A) Alpha and B) Beta’>',
        ['<He wrote ‘rock ’n’ roll > team A) Alpha and B) Beta’>'],
      ],
      [
        '(He wrote ‘rock ’n’ roll ) team a) Alpha and b) Beta’.)',
        ['(He wrote ‘rock ’n’ roll ) team a) Alpha and b) Beta’.)'],
      ],
    ])('preserves both marks of paired n elisions during list scans: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
      if (expected.length === 1 && input.includes('a) Alpha and b) Beta')) {
        expect(
          rouge.l(input, input.replace('a) Alpha and b) Beta', 'b) Beta and a) Alpha')),
        ).toBeLessThan(1);
      }
    });

    test.each(['section', 'chapter', 'page', 'figure', 'table', 'paragraph', 'article', 'clause'])(
      'retains singular and plural cross-references to %s in prose',
      (entity) => {
        for (const suffix of ['', 's']) {
          const input = `See ${entity}${suffix} 1) Introduction and 2) Scope for details.`;
          const reversed = `See ${entity}${suffix} 2) Scope and 1) Introduction for details.`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
          expect(rouge.l(input, reversed)).toBeLessThan(1);
        }
      },
    );

    test.each(['-', '*', '+'])('retains Markdown prefixes on numbered items: %s', (bullet) => {
      for (const ending of [')', '.', '.)']) {
        const first = `${bullet} 1${ending} Alpha`;
        const second = `${bullet} 2${ending} Beta`;
        expect(ss(`${first}\n${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first}\r\n${second}`)).toEqual([first, second]);
      }
      expect(ss(`${bullet} 1) First ${bullet} 42) Last`)).toEqual([
        `${bullet} 1) First`,
        `${bullet} 42) Last`,
      ]);
    });

    test.each([
      ['<', '>'],
      ['[', ']'],
      ['{', '}'],
    ])('keeps parenthesis labels owned by their containing literal: %s', (open, close) => {
      const prefix = `${open}(section a) detail${close} Options:`;
      const expected = [prefix, 'b) Beta', 'c) Gamma foo)'];
      expect(ss(`${prefix} b) Beta c) Gamma foo)`)).toEqual(expected);
      expect(segmentCaseNeutrally(`${prefix} b) Beta c) Gamma foo)`)).toEqual(expected);
      const unmatched = `${open}(literal detail${close} Options: b) Beta c) Gamma`;
      expect(ss(unmatched)).toEqual([unmatched]);
      expect(segmentCaseNeutrally(unmatched)).toEqual([unmatched]);
    });

    test.each([
      [
        '<(literal ] detail> Options: b) Beta c) Gamma',
        ['<(literal ] detail> Options: b) Beta c) Gamma'],
      ],
      [
        '[literal } detail] Options: b) Beta c) Gamma',
        ['[literal } detail] Options:', 'b) Beta', 'c) Gamma'],
      ],
      [
        '<(section a) "literal > )" detail> Options: b) Beta c) Gamma foo)',
        ['<(section a) "literal > )" detail> Options:', 'b) Beta', 'c) Gamma foo)'],
      ],
    ])('preserves unmatched closer and quoted-literal controls: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      '( [ ) Options: a) Alpha b) Beta foo)',
      '( [ ) ] Options: a) Alpha b) Beta foo)',
      '( [ literal ] ) Options: a) Alpha b) Beta foo)',
    ])('keeps malformed delimiter ownership consistent between list scans: %s', (input) => {
      const wellFormed = input.includes('literal');
      const expected = wellFormed
        ? ['( [ literal ] ) Options:', 'a) Alpha', 'b) Beta foo)']
        : [input];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('retains the documented bounded author-initial context', () => {
      const surname = 'Surname'.repeat(20);
      const input = `Authors: A. ${surname} and B. Jones.`;
      expect(ss(input)).toEqual([`Authors: A. ${surname} and B.`, 'Jones.']);
      expect(segmentCaseNeutrally(input)).toEqual(['Authors: A.', `${surname} and B.`, 'Jones.']);
      const ordinary = 'Authors: A. Smith and B. Jones.';
      expect(ss(ordinary)).toEqual([ordinary]);
      expect(segmentCaseNeutrally(ordinary)).toEqual([ordinary]);
    });

    test.each([30, 40, 41, 42, 60, 90])(
      'applies the bounded author context after JS lowercasing: %d',
      (length) => {
        const input = `Authors: A. ${'İ'.repeat(length)}name and B. Jones.`;
        const lower = input.toLowerCase();
        expect(segmentCaseNeutrally(input).map((part) => part.toLowerCase())).toEqual(
          segmentCaseNeutrally(lower),
        );
        expect(rouge.l(input, lower, { caseSensitive: false })).toBe(1);
      },
    );

    test.each([
      'Use `foo a) Alpha b) Beta` literal.',
      'Use `foo " a) Alpha b) Beta` literal.',
      'Use `foo < a) Alpha b) Beta > ( c) Gamma` literal.',
      "Use `foo '99 a) Alpha b) Beta` literal.",
    ])('keeps paired single-backtick code spans opaque to list scans: %s', (sentence) => {
      expect(ss(sentence)).toEqual([sentence]);
      expect(segmentCaseNeutrally(sentence)).toEqual([sentence]);
      expect(ss(`${sentence} Options: d) First e) Last.`)).toEqual([
        sentence,
        'Options:',
        'd) First',
        'e) Last.',
      ]);
      expect(segmentCaseNeutrally(`${sentence} Options: d) First e) Last.`)).toEqual([
        sentence,
        'Options:',
        'd) First',
        'e) Last.',
      ]);
      expect(
        rouge.l(sentence, sentence.replace('a) Alpha b) Beta', 'b) Beta a) Alpha')),
      ).toBeLessThan(1);
    });

    test.each([
      [
        'Use `unclosed literal. Options: a) Alpha b) Beta.',
        ['Use `unclosed literal.', 'Options:', 'a) Alpha', 'b) Beta.'],
      ],
      [
        "Use ``foo a) Alpha b) Beta'' literal. Options: a) One b) Two.",
        ["Use ``foo a) Alpha b) Beta'' literal.", 'Options:', 'a) One', 'b) Two.'],
      ],
      [
        'Use `one` and `two`. Options: a) First b) Last.',
        ['Use `one` and `two`.', 'Options:', 'a) First', 'b) Last.'],
      ],
    ])('retains unpaired backticks, Treebank aliases and later lists: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['sections', 'figures', 'clauses'])(
      'keeps complete cross-reference runs before later lists: %s',
      (entity) => {
        const sentence = `See ${entity} 1) Introduction, 2) Scope, and 3) Details.`;
        expect(ss(sentence)).toEqual([sentence]);
        expect(segmentCaseNeutrally(sentence)).toEqual([sentence]);
        const expected = [sentence, 'Options:', '1) Alpha', '2) Beta.'];
        const input = `${sentence} Options: 1) Alpha 2) Beta.`;
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((part) => part.toLowerCase()),
        );
        expect(
          rouge.l(
            sentence,
            sentence.replace('2) Scope, and 3) Details', '3) Details, and 2) Scope'),
          ),
        ).toBeLessThan(1);
      },
    );

    test('retains reference runs encountered while continuing an existing list', () => {
      const input =
        'Options: 1) First. See sections 2) Scope, 3) Details, and 4) Appendix. Options: 5) Next 6) Last.';
      const expected = [
        'Options:',
        '1) First.',
        'See sections 2) Scope, 3) Details, and 4) Appendix.',
        'Options:',
        '5) Next',
        '6) Last.',
      ];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      ['9'.repeat(320), '2', `${'9'.repeat(319)}8`],
      ['9'.repeat(320), `1${'0'.repeat(319)}`, `${'9'.repeat(319)}8`],
      ['90071992547409920', '90071992547409940', '90071992547409921'],
      ['99999999999999999', '100000000000000020', '100000000000000000'],
      ['00090071992547409920', '2', '090071992547409921'],
    ])('compares decimal marker distance without rounding: %s', (first, far, near) => {
      const input = `Options: ${first}. First ${far}. More analysis ${near}. Last.`;
      const expected = ['Options:', `${first}. First ${far}.`, 'More analysis', `${near}. Last.`];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['and', 'or', '&', ','])(
      'preserves the author guard while continuing selected alphabetic items: %s',
      (join) => {
        const names = `Authors: C. Smith${join === ',' ? '' : ' '}${join} D. Jones.`;
        const input = `Options: A. Alpha B. Beta. ${names}`;
        const expected = ['Options:', 'A. Alpha', 'B. Beta.', names];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((part) => part.toLowerCase()),
        );
      },
    );

    test('keeps confirmed code and reference ranges linear across many markers', () => {
      const code = `Use ${'` a) Alpha b) Beta ` '.repeat(8000)}literal.`;
      expect(ss(code)).toEqual([code]);
      expect(segmentCaseNeutrally(code)).toEqual([code]);
      const refs = `See sections ${Array.from({ length: 8000 }, (_, index) => `${index + 1}) Label`).join(', ')}.`;
      expect(ss(refs)).toEqual([refs]);
      expect(segmentCaseNeutrally(refs)).toEqual([refs]);
    }, 5000);

    test.each(['Use `Intro.`', 'Use `Intro!`', 'Use `«Intro.»`'])(
      'recognizes a completed paired-code introduction before dotted items: %s',
      (prefix) => {
        const expected = [prefix, '1. Alpha', '2. Beta'];
        expect(ss(`${prefix} 1. Alpha 2. Beta`)).toEqual(expected);
        expect(segmentCaseNeutrally(`${prefix} 1. Alpha 2. Beta`)).toEqual(expected);
      },
    );

    test('requires a terminal inside a paired code introduction', () => {
      const input = 'Use `Intro` 1. Alpha 2. Beta';
      const expected = ['Use `Intro` 1.', 'Alpha 2.', 'Beta'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      const unmatched = 'Use `unclosed. 1. Alpha 2. Beta';
      expect(ss(unmatched)).toEqual(['Use `unclosed.', '1. Alpha', '2. Beta']);
      expect(segmentCaseNeutrally(unmatched)).toEqual(['Use `unclosed.', '1. Alpha', '2. Beta']);
    });

    test('keeps list bracket ownership linear through deep mixed literals', () => {
      const prefix = `${'[{<('.repeat(8000)}literal${')>}]'.repeat(8000)} Options:`;
      expect(ss(`${prefix} a) First b) Last.`)).toEqual([prefix, 'a) First', 'b) Last.']);
      expect(segmentCaseNeutrally(`${prefix} a) First b) Last.`)).toEqual([
        prefix,
        'a) First',
        'b) Last.',
      ]);
    }, 5000);

    test('classifies repeated paired n elisions with bounded local context', () => {
      const input = `He said ‘${'rock ’n’ roll '.repeat(20_000)}has a) Alpha and b) Beta.’`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    }, 5000);

    test('keeps a numeric-leading single quotation around apparent list markers', () => {
      const input = "He said '100 options were a) Alpha and b) Beta.'";
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each(['“Intro.”', '‘Intro.’'])(
      'finds an embedded list after typographic quoted introduction %s',
      (prefix) => {
        const input = `${prefix} 1. Alpha 2. Beta.`;
        const expected = [prefix, '1. Alpha', '2. Beta.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test('keeps unpaired numeric elisions separate from a later unrelated quotation', () => {
      const input = "In '99, a) Alpha b) Beta. He said 'go'.";
      const expected = ["In '99,", 'a) Alpha', 'b) Beta.', "He said 'go'."];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      const quoted = "He said '99 options were a) Alpha and b) Beta.'";
      expect(ss(quoted)).toEqual([quoted]);
      expect(segmentCaseNeutrally(quoted)).toEqual([quoted]);
    });

    test('retains an inner elision inside a numeric-leading quotation', () => {
      const input = "He said '100 years ago, 'twas a) cold and b) dark.'";
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test('does not pair a numeric elision with an unrelated parenthetical quotation', () => {
      const input = "In '99, a) Alpha b) Beta. He said '(go)'.";
      const expected = ["In '99,", 'a) Alpha', 'b) Beta.', "He said '(go)'."];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('does not confirm a numeric elision with a later possessive', () => {
      const input = "In '99, a) Alpha b) Beta. The authors' names.";
      const expected = ["In '99,", 'a) Alpha', 'b) Beta.', "The authors' names."];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('retains internal possessives after a numeric quotation is confirmed', () => {
      const input =
        "He said '99 options a) Alpha b) Beta and the authors' names.' Options: a) First b) Last.";
      const expected = [
        "He said '99 options a) Alpha b) Beta and the authors' names.'",
        'Options:',
        'a) First',
        'b) Last.',
      ];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each([
      "He said '99 options a) Alpha b) Betas'.",
      "He said '99 options a) Alpha b) Betas'",
    ])('retains s-ending numeric quotations before punctuation or EOF: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test('discards deferred candidates when joined initials invalidate their family', () => {
      const input = 'Intro: 1. Authors: X. Smith A. Brown and C. Jones.';
      expect(ss(input)).toEqual(['Intro: 1.', 'Authors: X. Smith A. Brown and C.', 'Jones.']);
      expect(segmentCaseNeutrally(input)).toEqual([
        'Intro: 1.',
        'Authors: X.',
        'Smith A.',
        'Brown and C.',
        'Jones.',
      ]);
    });

    test('retains a deferred list from a different family after joined initials', () => {
      const input = 'Options: 1. First 42. Last. Authors: A. Smith and B. Jones.';
      const expected = ['Options:', '1. First', '42. Last.', 'Authors: A. Smith and B. Jones.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('preserves ordinary-space NEL normalization without a list introduction', () => {
      const input = 'Intro\u00851. Alpha 2. Beta.';
      const expected = ['Intro 1.', 'Alpha 2.', 'Beta.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('prefers a sparse outer family over an earlier nested pair', () => {
      const input = 'Intro: 1. First a) One b) Two 42. Last';
      const expected = ['Intro:', '1. First a) One b) Two', '42. Last'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['Intro.\u0085', '"Intro."', '(Intro.)'])(
      'finds an embedded list after %s',
      (prefix) => {
        const input = `${prefix} 1. Alpha 2. Beta.`;
        const expected = [prefix.replace(/\u0085/g, '').trim(), '1. Alpha', '2. Beta.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test('discards joined author initials before a later list', () => {
      const input = 'Authors: A. Smith and B. Jones. Intro: C. Alpha D. Beta.';
      const expected = ['Authors: A. Smith and B. Jones.', 'Intro:', 'C. Alpha', 'D. Beta.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('preserves genuinely sparse numbered lists after deferring outliers', () => {
      expect(ss('Options: 1. First 42. Last')).toEqual(['Options:', '1. First', '42. Last']);
    });

    test('handles many unmatched parenthesized marker candidates', () => {
      const input = `(${' a) A'.repeat(4000)}`;
      expect(ss(input)).toEqual([input]);
    });

    test('bounds recursion for deeply nested embedded lists', () => {
      const input = `${'Intro. 1. '.repeat(512)}Leaf. ${'2. Done. '.repeat(512)}`;
      expect(() => ss(input)).not.toThrow();
    });

    test('handles sparse numbered marker sequences', () => {
      const input = Array.from({ length: 2000 }, (_, index) => `End. ${2 * index + 1}. Alpha`).join(
        ' ',
      );
      expect(() => ss(input)).not.toThrow();
    });

    test('appends large embedded list bodies without exceeding the argument limit', () => {
      const input = `Intro. 1. ${'A!'.repeat(130_000)} 2. End.`;
      expect(() => ss(input)).not.toThrow();
    });

    test.each([
      ['a) Alpha b) Beta', ['a) Alpha', 'b) Beta']],
      ['a.) Alpha b.) Beta', ['a.) Alpha', 'b.) Beta']],
      ['A) Alpha B) Beta', ['A) Alpha', 'B) Beta']],
      ['Intro. a) Alpha b) Beta', ['Intro.', 'a) Alpha', 'b) Beta']],
      ['Intro: A. Alpha B. Beta.', ['Intro:', 'A. Alpha', 'B. Beta.']],
    ])('recognizes parenthesized alphabetical list markers in %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('scores reordered parenthesized alphabetical lists correctly', () => {
      expect(rouge.l('a) Alpha b) Beta', 'b) Beta a) Alpha')).toBe(1);
    });

    test('does not interpret names or addresses as embedded lists', () => {
      const names = 'I met John A. Smith and Mary B. Jones.';
      expect(ss(names)).toEqual([names]);
      expect(segmentCaseNeutrally(names.toLowerCase())).toEqual(
        segmentCaseNeutrally(names).map((sentence) => sentence.toLowerCase()),
      );
      expect(rouge.l(names, names.toLowerCase(), { caseSensitive: false })).toBe(1);
      expect(ss('we hired alice a. smith and bob b. jones.')).toEqual([
        'we hired alice a. smith and bob b. jones.',
      ]);
      expect(ss('The address is 1. Main and 2. Broadway.')).toEqual([
        'The address is 1.',
        'Main and 2.',
        'Broadway.',
      ]);
    });

    test.each([' and ', ', ', '; '])(
      'does not interpret author initials separated by %j as list markers',
      (separator) => {
        const authors = `Authors: A. Smith${separator}B. Jones.`;
        const reversed = `Authors: B. Jones${separator}A. Smith.`;
        expect(ss(authors)).toEqual([authors]);
        expect(segmentCaseNeutrally(authors)).toEqual([authors]);
        expect(rouge.l(authors, reversed)).toBeLessThan(1);
      },
    );

    test('does not treat dotted name initials as parenthesized list markers', () => {
      const input = 'A) J. Smith will attend B) K. Brown will attend';
      const expected = ['A) J. Smith will attend', 'B) K. Brown will attend'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('finds genuine lists after an earlier false marker', () => {
      expect(ss('I met John A. Smith. Intro: 1. Alpha 2. Beta.')).toEqual([
        'I met John A. Smith.',
        'Intro:',
        '1. Alpha',
        '2. Beta.',
      ]);
    });

    test('does not treat years as embedded list markers', () => {
      expect(ss('Results: 1. Alpha was founded in 2020. Growth continued.')).toEqual([
        'Results: 1.',
        'Alpha was founded in 2020.',
        'Growth continued.',
      ]);
    });

    test('does not treat sentence-ending counts as embedded list markers', () => {
      expect(ss('Results: 1. The answer was 42. More analysis followed 2. Final.')).toEqual([
        'Results:',
        '1. The answer was 42.',
        'More analysis followed',
        '2. Final.',
      ]);
      expect(ss('Results: 1. The answer measured 42. More analysis followed 2. Final.')).toEqual([
        'Results:',
        '1. The answer measured 42.',
        'More analysis followed',
        '2. Final.',
      ]);
    });

    test('ignores quoted parentheses while finding embedded lists', () => {
      expect(ss('The symbol "(" is used. Options: a) Alpha b) Beta.')).toEqual([
        'The symbol "(" is used.',
        'Options:',
        'a) Alpha',
        'b) Beta.',
      ]);
      expect(ss("The symbol '(' is used. Options: a) Alpha b) Beta.")).toEqual([
        "The symbol '(' is used.",
        'Options:',
        'a) Alpha',
        'b) Beta.',
      ]);
      for (const [opening, closing] of [
        ['“', '”'],
        ['‘', '’'],
      ]) {
        expect(ss(`The symbol ${opening}(${closing} is used. Options: a) Alpha b) Beta.`)).toEqual([
          `The symbol ${opening}(${closing} is used.`,
          'Options:',
          'a) Alpha',
          'b) Beta.',
        ]);
      }
    });

    test('does not mistake inch marks for opening quotations inside lists', () => {
      const input = '1) board is 6" wide 2) narrow';
      expect(ss(input)).toEqual(['1) board is 6" wide', '2) narrow']);
      expect(segmentCaseNeutrally(input)).toEqual(['1) board is 6" wide', '2) narrow']);
    });

    test('ignores apostrophe-led contractions while finding embedded lists', () => {
      expect(ss("'Twas nice. Options: a) Alpha b) Beta.")).toEqual([
        "'Twas nice.",
        'Options:',
        'a) Alpha',
        'b) Beta.',
      ]);
    });

    test('does not split parenthesized labels inside a quotation', () => {
      const input = 'He said "The winners were (team A) Alice and (team B) Bob."';
      expect(ss(input)).toEqual([input]);
    });

    test.each(['``', "''"])('retains label-shaped text inside Treebank quotation %s', (opening) => {
      const first = `He said ${opening}The options were a) Alpha and b) Beta.''`;
      const input = `${first} Options: a) First b) Last.`;
      expect(ss(input)).toEqual([first, 'Options:', 'a) First', 'b) Last.']);
      expect(segmentCaseNeutrally(input)).toEqual([first, 'Options:', 'a) First', 'b) Last.']);
    });

    test('caches long numeric markers while deferring overlapping list families', () => {
      const input = `A. x: ${'9'.repeat(4000)}. x ${'1. x '.repeat(4000)}`;
      expect(() => rouge.n(input, input)).not.toThrow();
    });

    test.each([
      [
        'This note (uses labels a) Alpha, b) Beta, and c) Gamma.)',
        ['This note (uses labels a) Alpha, b) Beta, and c) Gamma.)'],
      ],
      ['(section a) Options: b) Beta c) Gamma.', ['(section a) Options:', 'b) Beta', 'c) Gamma.']],
      [
        '(section a) Options: b) Beta c) Gamma. (note)',
        ['(section a) Options:', 'b) Beta', 'c) Gamma.', '(note)'],
      ],
      [
        '(Outer (section a) detail.) Options: b) Beta c) Gamma.',
        ['(Outer (section a) detail.)', 'Options:', 'b) Beta', 'c) Gamma.'],
      ],
      [
        'This note (uses labels a) Alpha, b) Beta, and c) Gamma.) Options: a) First b) Last.',
        [
          'This note (uses labels a) Alpha, b) Beta, and c) Gamma.) Options:',
          'a) First',
          'b) Last.',
        ],
      ],
      ['1. Alpha. a. One b. Two 2. Beta', ['1. Alpha.', 'a. One b. Two', '2. Beta']],
      [
        '1. Alpha. a. One b. Two. Next sentence. 2. Beta',
        ['1. Alpha.', 'a. One b. Two.', 'Next sentence.', '2. Beta'],
      ],
      [
        '1. Alpha. a.) One b.) Two. Next sentence. 2. Beta',
        ['1. Alpha.', 'a.) One b.) Two.', 'Next sentence.', '2. Beta'],
      ],
      [
        '1) The answer was 42. More analysis followed. 2) Final.',
        ['1) The answer was 42.', 'More analysis followed.', '2) Final.'],
      ],
      [
        "He said 'The authors' names were a) Alpha and b) Beta.' Options: a) First b) Last.",
        [
          "He said 'The authors' names were a) Alpha and b) Beta.'",
          'Options:',
          'a) First',
          'b) Last.',
        ],
      ],
      [
        "The word 'authors' describes a) Alpha and b) Beta. He said 'No.' Next.",
        ["The word 'authors' describes", 'a) Alpha and', 'b) Beta.', "He said 'No.'", 'Next.'],
      ],
      [
        'He said ‘The authors’ names were a) Alpha and b) Beta.’ Options: a) First b) Last.',
        [
          'He said ‘The authors’ names were a) Alpha and b) Beta.’',
          'Options:',
          'a) First',
          'b) Last.',
        ],
      ],
    ])('preserves reviewed list context and competing prose: %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((part) => part.toLowerCase()),
      );
    });

    test.each([
      ['«', '»'],
      ['‹', '›'],
    ])('retains guillemet quotations while finding lists: %s%s', (opening, closing) => {
      const quoted = `He said ${opening}The options were a) Alpha b) Beta.${closing}`;
      expect(ss(quoted)).toEqual([quoted]);
      expect(segmentCaseNeutrally(quoted)).toEqual([quoted]);
      const introduction = `${opening}Intro.${closing}`;
      expect(ss(`${introduction} 1. Alpha 2. Beta.`)).toEqual([
        introduction,
        '1. Alpha',
        '2. Beta.',
      ]);
      expect(segmentCaseNeutrally(`${introduction} 1. Alpha 2. Beta.`)).toEqual([
        introduction,
        '1. Alpha',
        '2. Beta.',
      ]);
      const parenthesis = `The symbol ${opening}(${closing} is used.`;
      expect(ss(`${parenthesis} Options: a) First b) Last.`)).toEqual([
        parenthesis,
        'Options:',
        'a) First',
        'b) Last.',
      ]);
    });

    test.each(['"', "'"])('preserves assignment-style quoted values with %s', (quote) => {
      const input = `Set value=${quote}x a) Alpha b) Beta c) Gamma${quote}.`;
      const reordered = `Set value=${quote}x c) Gamma b) Beta a) Alpha${quote}.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(rouge.l(input, reordered)).toBeLessThan(1);
      const numeric = `Set value=${quote}99 a) Alpha b) Beta${quote}.`;
      expect(ss(numeric)).toEqual([numeric]);
      expect(segmentCaseNeutrally(numeric)).toEqual([numeric]);
    });

    test('does not score reordered parenthetical labels as reordered independent sentences', () => {
      const first = 'This note (uses labels a) Alpha, b) Beta, and c) Gamma.)';
      const second = 'This note (uses labels c) Gamma, b) Beta, and a) Alpha.)';
      expect(rouge.l(first, second)).toBeLessThan(1);
    });

    test('confirms long parenthetical label ranges without repeated lookahead', () => {
      const input = `This note (uses labels ${'a) Alpha b) Beta '.repeat(10_000)}and ends.)`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    }, 5000);

    test('does not interpret parenthesized labels as list markers', () => {
      const input = 'The winners were (team A) Alice and (team B) Bob.';
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each([
      ['[', ']'],
      ['{', '}'],
      ['<', '>'],
      ['[{<', '>}]'],
    ])('keeps label-like text inside %s%s prose', (opening, closing) => {
      const input = `The winners were ${opening}team A) Alice and team B) Bob${closing}.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      const list = `${input} Options: a) Alpha b) Beta.`;
      expect(ss(list)).toEqual([input, 'Options:', 'a) Alpha', 'b) Beta.']);
      expect(segmentCaseNeutrally(list)).toEqual([input, 'Options:', 'a) Alpha', 'b) Beta.']);
    });

    describe('ReDoS prevention', () => {
      const TIMEOUT_MS = 500;

      test('anchors mismatched numeric marker families without backtracking', () => {
        const input = `1. Alpha 2. Beta ${'9'.repeat(48_000)}) Gamma`;
        const started = Date.now();
        expect(ss(input)).toHaveLength(2);
        expect(Date.now() - started).toBeLessThan(TIMEOUT_MS);
      });
    });
  });
});

describe('list markers after comparisons', () => {
  test.each(['Score < 5. Options: a) Cold b) Warm.', 'Score <5. Options: a) Cold b) Warm.'])(
    '%s',
    (input) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
          input.slice(0, input.indexOf(' Options:')),
          'Options:',
          'a) Cold',
          'b) Warm.',
        ]);
      }
    },
  );
});

test.each(['< team A) Alice and team B) Bob >', '<team A) Alice and team B) Bob>'])(
  'preserves matched angle literals: %s',
  (input) => {
    expect(rouge.sentenceSegment(input)).toEqual([input]);
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([input]);
  },
);

test('does not pair comparisons with quoted greater-than signs', () => {
  const input = 'Score < 5. He said ">". Options: a) Cold b) Warm.';
  for (const caseNeutral of [false, true]) {
    expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
      'Score < 5.',
      'He said ">".',
      'Options:',
      'a) Cold',
      'b) Warm.',
    ]);
  }
});

test('reuses a deferred list prefix with long leading whitespace', () => {
  const count = 40_000;
  const input = `${' '.repeat(5 * count)}A. x Intro: 1. x${' 2. x'.repeat(count)}`;
  expect(rouge.n(input, input)).toBe(1);
}, 5000);

test.each(['"literal > sign"', "'literal > sign'", "'99 > sign'"])(
  'preserves quotes immediately inside angle literals: %s',
  (quote) => {
    const first = `The winners were <${quote} and team A) Alice and team B) Bob>.`;
    const input = `${first} Options: a) First b) Last.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
        first,
        'Options:',
        'a) First',
        'b) Last.',
      ]);
    }
  },
);

describe('Numeric bullet prefixes stay on their marker line', () => {
  test.each(['-', '*', '+', '•', '⁃'])(
    'keeps %s before a line break in the introduction',
    (bullet) => {
      for (const gap of ['\n', '\r\n']) {
        const input = `Heading ${bullet}${gap}1) Alpha\n2) Beta`;
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
            `Heading ${bullet}`,
            '1) Alpha',
            '2) Beta',
          ]);
        }
      }
    },
  );

  test.each(['-', '*', '+', '•', '⁃'])(
    'keeps a horizontal %s prefix with its numeric marker',
    (bullet) => {
      const input = `Heading ${bullet}\t1) Alpha\n2) Beta`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
          'Heading',
          `${bullet}\t1) Alpha`,
          '2) Beta',
        ]);
      }
    },
  );
});
