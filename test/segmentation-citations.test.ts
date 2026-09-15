import * as rouge from '../src/rouge';
import { bracketPairs, expectBundledScriptToPass } from './helpers';

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test.each([
      ['Alpha.[1] Beta.', ['Alpha.[1]', 'Beta.']],
      ['Alpha.[7][8] Beta.', ['Alpha.[7][8]', 'Beta.']],
      ['Alpha.[1] [2] Beta.', ['Alpha.[1] [2]', 'Beta.']],
      ['Alpha. [1] Beta.', ['Alpha. [1]', 'Beta.']],
      ['Alpha.(1) Beta.', ['Alpha.(1)', 'Beta.']],
      ['Alpha.(1–3) [4,5] Beta.', ['Alpha.(1–3) [4,5]', 'Beta.']],
      ["He said ``Alpha.[1]'' Beta.", ["He said ``Alpha.[1]''", 'Beta.']],
      ["He said ``Alpha.''[1] Next.", ["He said ``Alpha.''[1]", 'Next.']],
      ['«Alpha.»[1] Beta.', ['«Alpha.»[1]', 'Beta.']],
      ['Alpha.[1,2] Beta.', ['Alpha.[1,2]', 'Beta.']],
      ['Alpha.[1–3] Beta.', ['Alpha.[1–3]', 'Beta.']],
      ['Alpha.[12] Beta.[34] Gamma.', ['Alpha.[12]', 'Beta.[34]', 'Gamma.']],
      ['A conclusion.11 12 The next sentence.', ['A conclusion.11', '12 The next sentence.']],
      ['A conclusion.11 12 13 The next sentence.', ['A conclusion.11', '12 13 The next sentence.']],
      [
        'A conclusion.[11,12,13] The next sentence.',
        ['A conclusion.[11,12,13]', 'The next sentence.'],
      ],
      ['Alpha.1 2 people remained.', ['Alpha.1', '2 people remained.']],
      ['Alpha.1 Beta.', ['Alpha.1', 'Beta.']],
      [
        'The Hawai‘i report found improvement.[1] Next.',
        ['The Hawai‘i report found improvement.[1]', 'Next.'],
      ],
      [
        'The 𝒜‘s report found improvement.[1] Next.',
        ['The 𝒜‘s report found improvement.[1]', 'Next.'],
      ],
      ['A conclusion (1987).1 The next sentence.', ['A conclusion (1987).1', 'The next sentence.']],
      ['Text𐐀.1 Next.', ['Text𐐀.1', 'Next.']],
      ['He said "Alpha.[1]" Beta.', ['He said "Alpha.[1]"', 'Beta.']],
      ['He said "Alpha."[1] Beta.', ['He said "Alpha."[1]', 'Beta.']],
      ['(Alpha.)[1] Beta.', ['(Alpha.)[1]', 'Beta.']],
      ['(Alpha.[1]) Beta.', ['(Alpha.[1])', 'Beta.']],
      ['He said "(Alpha.)"[1] Beta.', ['He said "(Alpha.)"[1]', 'Beta.']],
      ['“Alpha.[1]” Beta.', ['“Alpha.[1]”', 'Beta.']],
      ['«Alpha.[1]» Beta.', ['«Alpha.[1]»', 'Beta.']],
      ['Alpha.[1] “Beta.”', ['Alpha.[1]', '“Beta.”']],
      [
        "In the '90s, Alpha.[1] Today's report follows.",
        ["In the '90s, Alpha.[1]", "Today's report follows."],
      ],
      ['Alpha.[1] 2 people remained.', ['Alpha.[1]', '2 people remained.']],
      ['Really?[1] Next sentence.', ['Really?[1]', 'Next sentence.']],
      ['Really?1 Next sentence.', ['Really?1', 'Next sentence.']],
      ['Really?!1 Next sentence.', ['Really?!1', 'Next sentence.']],
      ['Really!?!2 Next sentence.', ['Really!?!2', 'Next sentence.']],
      ['Great![1] Next sentence.', ['Great![1]', 'Next sentence.']],
    ])('keeps numeric citation suffixes with sentence boundaries in %s', (input, expected) => {
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each(['[1]', '(1)', '[1], [2]'])(
      'retains an unspaced cased sentence start after complete citation %s',
      (citation) => {
        const first = `Hello world.${citation}`;
        const second = 'Today is Tuesday.';
        expect(ss(first + second)).toEqual([first, second]);
        expect(segmentCaseNeutrally(first + second)).toEqual([first, second]);
        expect(segmentCaseNeutrally((first + second).toLowerCase())).toEqual([
          first.toLowerCase(),
          second.toLowerCase(),
        ]);
        expect(ss(first + second.toLowerCase())).toEqual([first + second.toLowerCase()]);
      },
    );

    test.each(['🙂 smiled.', '$100 was paid.', '+ taxes.'])(
      'retains a spaced symbol-led sentence after an explicit citation: %s',
      (second) => {
        for (const citation of ['[1]', '(1)']) {
          const first = `Alpha.${citation}`;
          expect(ss(`${first} ${second}`)).toEqual([first, second]);
          expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
          expect(segmentCaseNeutrally(`${first} ${second}`.toLowerCase())).toEqual([
            first.toLowerCase(),
            second.toLowerCase(),
          ]);
        }
      },
    );

    test.each([
      'Alpha.[1]🙂 smiled.',
      'Alpha.[1]"🙂 smiled."',
      'Alpha.1 🙂 smiled.',
      'Hello world.1Today is Tuesday.',
      'Co.[1] 🙂 smiled.',
      'Alpha...[1] 🙂 smiled.',
      'Alpha....[1] 🙂 smiled.',
      'Alpha.[1] 100% agreed.',
    ])('preserves competing citation continuation policy: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test('does not reconsider a recognized spaced citation before a lowercase continuation', () => {
      for (const separator of ['', ' ']) {
        const first = `Alpha.${separator}[1]`;
        const input = `${first} beta.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'beta.']);
        expect(ss(`${first} Beta.`)).toEqual([first, 'Beta.']);
      }
    });

    test.each(['He said “Alpha. [1] beta.” Next.', 'He wrote (Alpha. [1] Beta.) Next.'])(
      'retains a recognized citation inside its surrounding context: %s',
      (input) => {
        const expected = input.startsWith('He said') ? [input.slice(0, -6), 'Next.'] : [input];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        const attached = input.replace('. [1]', '.[1]');
        const attachedExpected = expected.map((span) => span.replace('. [1]', '.[1]'));
        expect(ss(attached)).toEqual(attachedExpected);
        expect(segmentCaseNeutrally(attached)).toEqual(attachedExpected);
      },
    );

    test.each(['[oops]', '1'])(
      'retains ordinary scanning for an unrecognized spaced citation: %s',
      (next) => {
        const second = `${next} Beta.`;
        expect(ss(`Alpha. ${second}`)).toEqual(['Alpha.', second]);
        expect(segmentCaseNeutrally(`Alpha. ${second}`)).toEqual(['Alpha.', second]);
      },
    );

    test.each([
      "He said '``Alpha.''[1]'",
      "He said ``'Alpha.'[1]''",
      "He said '``Alpha.'''[1]",
      "He said ``'Alpha.'''[1]",
      "He said '``Alpha.''[1] '",
      "He said ``'Alpha.'[1] ''",
      "He said '``Alpha. ''[1]'",
      "He said ``'Alpha. '[1]''",
      "He said ``'Alpha.' ''[1]",
    ])('retains mixed single/Treebank closer order around citations: %s', (first) => {
      for (const segment of [ss, segmentCaseNeutrally]) {
        expect(segment(first)).toEqual([first]);
        for (const tail of [' Beta.', "'Beta.'", ' “Beta.”']) {
          expect(segment(first + tail)).toEqual([first, tail.trim()]);
        }
      }
      expect(segmentCaseNeutrally(`${first} Beta.`.toLowerCase())).toEqual([
        first.toLowerCase(),
        'beta.',
      ]);
    });

    test.each(["He said '``Alpha.'''", "He said ``'Alpha.'''"])(
      'preserves uncited mixed quotation closure: %s',
      (first) => {
        expect(ss(`${first} Beta.`)).toEqual([first, 'Beta.']);
        expect(segmentCaseNeutrally(`${first} Beta.`)).toEqual([first, 'Beta.']);
      },
    );

    test.each([
      'He said \'"Alpha.[1]"\'',
      'He said "\'Alpha.[1]\'"',
      'He said \'"Alpha."[1]\'',
      'He said "\'Alpha.\'[1]"',
      'He said \'"Alpha."\'[1]',
      'He said \u2018"Alpha.[1]"\u2019',
    ])('tracks adjacent mixed ASCII double/single quotation levels: %s', (first) => {
      expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first} Next.`.toLowerCase())).toEqual([
        first.toLowerCase(),
        'next.',
      ]);
      expect(ss(first)).toEqual([first]);
    });

    test.each(['Alpha.[1], [2]', 'Alpha.[1]; [2]', 'Alpha.[1],[2];[3]', 'Alpha.(1), (2)'])(
      'attaches punctuated complete citation groups: %s',
      (first) => {
        expect(ss(`${first} Beta.`)).toEqual([first, 'Beta.']);
        expect(segmentCaseNeutrally(`${first} Beta.`)).toEqual([first, 'Beta.']);
        expect(ss(first)).toEqual([first]);
      },
    );

    test.each(['Alpha.[1], [word] Beta.', 'Alpha.[1]; [] Beta.', 'Alpha.[1], 2 people remained.'])(
      'does not consume an incomplete citation separator: %s',
      (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      },
    );

    test.each(['北京很好.', '東京です.', 'مرحبا.', 'สวัสดี.'])(
      'recognizes uncased Unicode letters after an ordinary citation: %s',
      (next) => {
        expect(ss(`Alpha.[1] ${next}`)).toEqual(['Alpha.[1]', next]);
        expect(segmentCaseNeutrally(`Alpha.[1] ${next}`)).toEqual(['Alpha.[1]', next]);
        expect(segmentCaseNeutrally(`alpha.[1] ${next}`)).toEqual(['alpha.[1]', next]);
      },
    );

    test('retains abbreviation and ellipsis continuation rules before uncased letters', () => {
      for (const input of [
        'Acme Co.[1] 北京很好.',
        'Alpha...[1] 北京很好.',
        'Alpha....[1] 北京很好.',
      ]) {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      }
      expect(ss('Alpha.[1] beta.')).toEqual(['Alpha.[1] beta.']);
      expect(segmentCaseNeutrally('Alpha.[1] beta.')).toEqual(['Alpha.[1]', 'beta.']);
    });

    test.each(['E', 'e'])(
      'preserves existing default isolated-initial continuation for %s',
      (initial) => {
        const first = `My name is Jonas ${initial}.[1]`;
        const input = `${first} Smith.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Smith.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'smith.']);
        expect(ss(input.replace('[1]', ''))).toEqual([input.replace('[1]', '')]);
      },
    );

    test('retains a cited name initial after repeated whitespace', () => {
      const first = 'My name is Jonas  E.[1]';
      const input = `${first} Smith.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([first, 'Smith.']);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'smith.']);
    });

    test('requires existing name context for a cited uppercase initial', () => {
      for (const [first, second] of [
        ['The answer is E.[1]', 'Smith responded.'],
        ['My name is Jonas\tE.[1]', 'Smith.'],
        ['My name is Jonas E.[1]', '"Smith."'],
      ]) {
        expect(ss(`${first} ${second}`)).toEqual([first, second]);
        expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
      }
      expect(ss('My name is Jonas\nE.[1] Smith.')).toEqual(['My name is Jonas E.[1] Smith.']);
    });

    test('retains full preceding-name evidence without a fixed prefix window', () => {
      const input = `My name is J${'o'.repeat(10_000)} E.[1] Smith.`;
      expect(ss(input)).toEqual([input]);
    });

    test('keeps unmatched s-ending quotation ambiguity distinct from confirmed possessives', () => {
      const ambiguous = "She said 'The dogs' owners Alpha.[1] Next.";
      const balanced = `${ambiguous}'`;
      const first = "She chose 'Paris' and Alice agreed.";
      for (const segment of [ss, segmentCaseNeutrally]) {
        expect(segment(ambiguous)).toEqual(["She said 'The dogs' owners Alpha.[1]", 'Next.']);
        expect(segment(balanced)).toEqual([balanced]);
        expect(segment(`${first} Alpha.[1] Next.`)).toEqual([first, 'Alpha.[1]', 'Next.']);
      }
      expect(segmentCaseNeutrally(ambiguous.toLowerCase())).toEqual([
        "she said 'the dogs' owners alpha.[1]",
        'next.',
      ]);
    });

    test('makes the attached bare-citation ambiguity explicit across casing modes', () => {
      const input = 'Stop!2 people stayed.';
      expect(ss(input)).toEqual(['Stop!', '2 people stayed.']);
      expect(segmentCaseNeutrally(input)).toEqual(['Stop!2', 'people stayed.']);
      expect(ss('Stop!2 People stayed.')).toEqual(['Stop!2', 'People stayed.']);
      for (const segment of [ss, segmentCaseNeutrally]) {
        expect(segment('Stop! 2 people stayed.')).toEqual(['Stop!', '2 people stayed.']);
        expect(segment('Stop![2] People stayed.')).toEqual(['Stop![2]', 'People stayed.']);
      }
    });

    test.each([
      'https://example.com/release.1',
      'https://example.com/release.𝟙',
      `https://example.com/${'path/'.repeat(100)}release.1`,
      'www.example.com/release.1',
      'example.com/release.1',
      'alice@example.com.1',
      '/tmp/release.1',
      './release.1',
      '../release.1',
      '~/release.1',
      'package/release.1',
      'C:\\tmp\\release.1',
      '\\\\server\\share\\release.1',
      '«https://example.com/release.1»',
      '«www.release.1»',
    ])('preserves numeric path and address components: %s', (address) => {
      const input = `Download ${address} Candidate builds remain.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each(['https://example.com/release.', '/tmp/release.', 'package/release.'])(
      'keeps an explicit citation after a quoted path or address: %s',
      (address) => {
        const first = `He cited "${address}"1`;
        const input = `${first} Next sentence.`;
        expect(ss(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
      },
    );

    test('classifies a citation-like URL token once', () => {
      const input = `Download https://example.com/${'release.1/'.repeat(20_000)}final.1 Candidate builds remain.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each(['See p.(10) Next.', 'See P.(10) Next.'])(
      'retains parenthesized page-reference continuation: %s',
      (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      },
    );

    test.each(["'Tis", "'round", '‘Tis', '‘round'])(
      'confirms a citation-bearing quotation beginning with %s',
      (opening) => {
        const closer = opening.startsWith('‘') ? '’' : "'";
        // Curly closing periods alone retain the existing non-citation boundary behavior.
        const lastCitation = opening.startsWith('‘') ? '[2]' : '';
        const first = `She said ${opening} Alpha.[1] Beta.${lastCitation}${closer}`;
        expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
      },
    );

    test.each(['‘90s', '‘tis', '’90s', '’tis', "'90s", "'tis"])(
      'does not open a quotation for the unpaired elision %s',
      (elision) => {
        const first = `In the ${elision}, Alpha.[1]`;
        expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
      },
    );

    test.each([
      ['“', '”'],
      ['‘', '’'],
      ['«', '»'],
      ["'", "'"],
    ])('consumes spaced compatible citation closers %s%s', (opening, closing) => {
      for (const gap of [' ', '\t', '\n']) {
        const first = `He said ${opening}Alpha.[1]${gap}${closing}`;
        const expected = [first.replaceAll('\n', ' '), 'Next.'];
        expect(ss(`${first} Next.`)).toEqual(expected);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual(expected);
      }
    });

    test.each([
      ["'", "'"],
      ['‘', '’'],
    ])('preserves an existing %s%s quotation around an internal elision', (opening, closing) => {
      for (const elision of ['90s', 'tis']) {
        const first = `She said ${opening}In the ${opening}${elision}, Alpha.[1] Beta.[2]${closing}`;
        expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
      }
    });

    test('retains a citation boundary after an unquoted plural possessive', () => {
      const first = 'The dogs’ owners said Alpha.[1]';
      expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
    });

    test.each([
      'She said ‘He called ‘twas odd’ rude Alpha.[1] Beta.’ aloud.',
      'She said ‘The dogs’ owners recalled the ‘90s, Alpha.[1] Beta.’ aloud.',
    ])('preserves nested elision and possessive quotation context: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test('does not borrow a later separate quotation closer for an elision', () => {
      const first = 'She said ‘In the ‘90s, Alpha.[1] Beta.[2]’';
      const second = 'Later ‘other words.’ Gamma.[3]';
      const input = `${first} ${second} Next.`;
      expect(ss(input)).toEqual([first, 'Later ‘other words.’', 'Gamma.[3]', 'Next.']);
      expect(segmentCaseNeutrally(input)).toEqual([
        first,
        'Later ‘other words.’',
        'Gamma.[3]',
        'Next.',
      ]);
    });

    test('keeps many unpaired elisions source-aligned without quotation nesting', () => {
      const first = `In the ${'‘90s, ‘tis familiar, '.repeat(40)}Alpha.[1]`;
      expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
    });

    test.each(['90s', 'tis'])('preserves a quotation around the right-mark elision %s', (word) => {
      const first = `She said ‘In the ’${word}, Alpha.[1] Beta.[2]’`;
      expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
    });

    test.each([
      'She said ‘In the ‘90s and the ’tis era, Alpha.[1] Beta.’ aloud.',
      'She said ‘He called ‘twas odd’ rude in the ’90s, Alpha.[1] Beta.’ aloud.',
    ])('excludes right-mark elisions from the nested quotation closer budget: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each(['Alpha.', 'Alpha.[1]'])(
      'closes a quotation after %s before an adjacent elision-like word',
      (ending) => {
        const first = `She said ‘${ending}’Tis true.`;
        const second = 'Later Alpha.[2]';
        const input = `${first} ${second} Next.`;
        const expected =
          ending === 'Alpha.'
            ? ['She said ‘Alpha.’', 'Tis true.', second, 'Next.']
            : [first, second, 'Next.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each(['Next', 'Tis'])(
      'releases an ASCII quotation before adjacent %s and a later citation',
      (start) => {
        const first = "He said 'Alpha.";
        const second = `'${start} citation.[1]`;
        const input = `${first}${second} Final.`;
        expect(ss(input)).toEqual([`${first}'`, second.slice(1), 'Final.']);
        expect(segmentCaseNeutrally(input)).toEqual([`${first}'`, second.slice(1), 'Final.']);
      },
    );

    test.each(['', '   ', '\n', '\t\r\n'])(
      'retains a spaced citation before the document tail %j',
      (tail) => {
        expect(ss(`Alpha. [1]${tail}`)).toEqual(['Alpha. [1]']);
        expect(segmentCaseNeutrally(`Alpha. [1]${tail}`)).toEqual(['Alpha. [1]']);
      },
    );

    test.each([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Sept',
      'Oct',
      'Nov',
      'Dec',
    ])('preserves compact %s dates while retaining explicit citations', (month) => {
      for (const number of ['1', '31', '2026']) {
        const input = `The deadline is ${month}.${number} Next year.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
      }
      for (const citation of ['[1]', '(1)']) {
        const first = `The deadline is ${month}.${citation}`;
        expect(ss(`${first} Next year.`)).toEqual([first, 'Next year.']);
        expect(segmentCaseNeutrally(`${first} Next year.`)).toEqual([first, 'Next year.']);
      }
    });

    test.each(['[1]', '(1)', '1'])(
      'retains the numeric continuation of a cited date abbreviation: %s',
      (citation) => {
        const first = `The Jan.${citation} 2020 report arrived.`;
        expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(first.toLowerCase())).toEqual([first.toLowerCase()]);
        const ordinary = `Alpha.${citation}`;
        expect(ss(`${ordinary} 2020 reports arrived.`)).toEqual([
          ordinary,
          '2020 reports arrived.',
        ]);
        expect(segmentCaseNeutrally(`${ordinary} 2020 reports arrived.`)).toEqual([
          ordinary,
          '2020 reports arrived.',
        ]);
      },
    );

    test.each(['\n', '\r', '\r\n', ' \n\t'])(
      'uses an explicit line break after a citation before the next sentence: %j',
      (separator) => {
        for (const following of ['beta.', 'but it continued.', '2 months.', '🙂 smiled.']) {
          const input = `Alpha.[1]${separator}${following}`;
          expect(ss(input)).toEqual(['Alpha.[1]', following]);
          expect(segmentCaseNeutrally(input)).toEqual(['Alpha.[1]', following]);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(['alpha.[1]', following]);
        }
        const date = `The Jan.[1]${separator}2020 report arrived.`;
        expect(ss(date)).toEqual(['The Jan.[1] 2020 report arrived.']);
        expect(segmentCaseNeutrally(date)).toEqual(['The Jan.[1] 2020 report arrived.']);
      },
    );

    test.each(['..', '...', '....', '.....'])(
      'preserves the existing ellipsis continuation policy before a citation: %s',
      (ellipsis) => {
        for (const separator of ['', ' ']) {
          const first = `He paused${ellipsis}${separator}[1]`;
          const input = `${first} Perhaps continued.`;
          const expected = ellipsis.length >= 4 ? [first, 'Perhaps continued.'] : [input];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
            expected.map((sentence) => sentence.toLowerCase()),
          );
          const numeric = `${first} 2020 reports arrived.`;
          expect(ss(numeric)).toEqual([numeric]);
          expect(segmentCaseNeutrally(numeric)).toEqual([numeric]);
        }
      },
    );

    test.each(['1%2 stayed.', '12 % stayed.', '12 years passed.', '12 days.'])(
      'preserves the existing cited quantity continuation: %s',
      (following) => {
        const input = `Alpha.[1] ${following}`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      },
    );

    test('retains an independent numeric sentence with additional text after the quantity', () => {
      const input = 'Alpha.[1] 12 days later.';
      expect(ss(input)).toEqual(['Alpha.[1]', '12 days later.']);
      expect(segmentCaseNeutrally(input)).toEqual(['Alpha.[1]', '12 days later.']);
    });

    test('segments repeated numeric citation starts within one whitespace token', () => {
      const repetitions = 10_000;
      const input = `A.[1]"1${'A.[2]""1'.repeat(repetitions)}`;
      const expected = [
        'A.[1]',
        '"1A.[2]',
        ...Array.from({ length: repetitions - 1 }, () => '""1A.[2]'),
        '""1',
      ];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test.each(['ABC\u0301', 'ǅA'])(
      'keeps Unicode identifier case and explicit section labels aligned: %s',
      (identifier) => {
        const input = `${identifier}.1 Introduction.`;
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([`${identifier}.1`, 'Introduction.']);
        const labeled = `Section ${input}`;
        expect(ss(labeled)).toEqual([labeled]);
        expect(segmentCaseNeutrally(labeled)).toEqual([labeled]);
        expect(segmentCaseNeutrally(labeled.toLowerCase())).toEqual([labeled.toLowerCase()]);
      },
    );

    test.each(['[1]', '(1)', '1'])(
      'synchronizes a consumed ASCII single citation closer before the next quotation: %s',
      (citation) => {
        const first = `He said 'Alpha.${citation}'`;
        const input = `${first}"Next." Gamma.[2] Delta.`;
        expect(ss(input)).toEqual([first, '"Next."', 'Gamma.[2]', 'Delta.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, '"Next."', 'Gamma.[2]', 'Delta.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          '"next."',
          'gamma.[2]',
          'delta.',
        ]);
      },
    );

    test.each(['"Next."', "'Next.'", '“Next.”', '‘Next.’', '«Next.»', '(Next sentence.)'])(
      'retains an adjacent opening delimiter after a citation: %s',
      (following) => {
        const first = 'Alpha.[1]';
        const input = `${first}${following}`;
        expect(ss(input)).toEqual([first, following]);
        expect(segmentCaseNeutrally(input)).toEqual([first, following]);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          following.toLowerCase(),
        ]);
      },
    );

    test('distinguishes an existing citation quotation closer from the next opener', () => {
      const first = 'He said "Alpha.[1]"';
      const following = '"Next."';
      expect(ss(`${first}${following}`)).toEqual([first, following]);
      expect(segmentCaseNeutrally(`${first}${following}`)).toEqual([first, following]);
    });

    test.each(["He said ``She said 'Alpha.[1]'''", "He said '``Alpha.[1]'''"])(
      'consumes each pending single and Treebank closer once: %s',
      (first) => {
        expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first.toLowerCase()} next.`)).toEqual([
          first.toLowerCase(),
          'next.',
        ]);
      },
    );

    test('does not mistake decimal numbers for numeric citation suffixes', () => {
      const input = 'She has $100.00 in her bag.';
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each([
      'Appendix A.1 Introduction',
      'Appendix IV.1 Introduction',
      'Section ABC.1 Introduction',
      'I work for the U.S.[1] Government agency.',
      'I work for the U.S.A.[1] Government agency.',
      'I work for the E.U.[1] Government agency.',
    ])('preserves dotted section identifiers and cited abbreviation continuations: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each(['', ' ', '\t', '\n', 'See '])(
      'uses citation precedence for letter-only identifiers in neutral mode after %j',
      (prefix) => {
        const uppercase = `${prefix}ABC.1 Introduction.`;
        const lowercase = uppercase.toLowerCase();
        expect(ss(uppercase)).toEqual([uppercase.trimStart()]);
        expect(segmentCaseNeutrally(uppercase)).toEqual([
          `${prefix}ABC.1`.trimStart(),
          'Introduction.',
        ]);
        expect(segmentCaseNeutrally(lowercase)).toEqual([
          `${prefix}abc.1`.trimStart().toLowerCase(),
          'introduction.',
        ]);
        expect(rouge.l(uppercase, lowercase, { caseSensitive: false })).toBe(1);
      },
    );

    test.each([
      'See ABC2.1 Introduction.',
      'See ABC_D.1 Introduction.',
      'See abc2d.1 Introduction.',
      'See abc_d.1 Introduction.',
    ])('preserves identifiers with structural evidence in both modes: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each(['2', '_', '𝟚'])('retains identifier evidence before a long suffix: %s', (prefix) => {
      const input = `See ${prefix}${'A'.repeat(128)}.1 Introduction.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test('retains a section label before a long identifier and whitespace', () => {
      const input = `Section${' '.repeat(100)}${'A'.repeat(128)}.1 Introduction.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each([
      'p < 0.05',
      'p <0.05',
      'p<0.05',
      'p < .05',
      'p<.05',
      '𝔭 < 0.05',
      '𝟎 < 𝟏',
      'ṕ <0.05',
      '12.5 <30',
      '(count) <0.05',
      '[count] <0.05',
      '{count} <0.05',
    ])('retains a citation boundary after numeric comparison %s', (expression) => {
      for (const citation of ['[1]', '(1)', '1']) {
        const first = `The result was significant (${expression}).${citation}`;
        const input = `${first} Next sentence.`;
        expect(ss(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          'next sentence.',
        ]);
      }
    });

    test.each(['.5', '.٥', '.𝟓', '.Ⅳ', '.05', '1e3', '.5e3', '1E3', '١e٣', '1e-3', '1e+3'])(
      'retains the numeric left operand %s before a cited comparison terminal',
      (operand) => {
        for (const first of [`Result ${operand} < 1.[1]`, `Result (${operand} < 1).[1]`]) {
          const input = `${first} Next.`;
          // The existing ordinary scanner separates the earlier period before a Roman numeral.
          const expected =
            operand === '.Ⅳ'
              ? [first.slice(0, first.indexOf('Ⅳ')), first.slice(first.indexOf('Ⅳ')), 'Next.']
              : [first, 'Next.'];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
            expected.map((sentence) => sentence.toLowerCase()),
          );
        }
      },
    );

    test.each([
      '0.foo',
      '0.05abc',
      '0.05𝔞',
      '0.05́',
      '0.05_x',
      '0.05.foo',
      '0.05.3',
      '0.05e',
      '0.05e-',
      '0.05e+foo',
      '0.05e3foo',
      '0.05ms',
      '0.05eV',
    ])('retains angle context around the identifier operand %s', (operand) => {
      const input = `p < ${operand} Alpha.[1] Beta.>`;
      expect(ss(input)).toEqual([input]);
      // Neutral ordinary scanning already separates the earlier letter-led dotted component.
      const expected = operand.endsWith('.foo')
        ? [`p < ${operand.slice(0, -3)}`, 'foo Alpha.[1] Beta.>']
        : [input];
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });

    test.each([
      '0.05',
      '0',
      '.05',
      '123',
      '0.05e3',
      '0.05e-3',
      '0.05E+3',
      '.05e2',
      '1e-5',
      '𝟎.𝟎𝟓',
      '１２.５',
      'Ⅳ',
      '0.05%',
    ])('retains numeric comparison %s before a cited terminal', (operand) => {
      for (const first of [
        `The result was significant (p < ${operand}).[1]`,
        `p < ${operand}.[1]`,
      ]) {
        const input = `${first} Next sentence.`;
        expect(ss(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          'next sentence.',
        ]);
      }
    });

    test('keeps numeric comparison recognition independent across repeated calls', () => {
      const valid = 'The result was significant (p < 0.05e-3).[1]';
      const invalid = 'p < 0.05abc Alpha.[1] Beta.>';
      for (let attempt = 0; attempt < 4; attempt++) {
        expect(ss(`${valid} Next.`)).toEqual([valid, 'Next.']);
        expect(ss(invalid)).toEqual([invalid]);
        expect(segmentCaseNeutrally(`${valid} Next.`)).toEqual([valid, 'Next.']);
      }
    });

    test.each([
      ['"', '"'],
      ["'", "'"],
      ['“', '”'],
      ['``', "''"],
      ['「', '」'],
    ])('retains an angle enclosure after its inner %s%s quotation closes', (opening, closing) => {
      const input = `<${opening}Alpha.[1]${closing} Beta.>`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each([
      '<𝔘nicode Alpha.[1] Beta.>',
      '<word Alpha.[1] Beta.>',
      '<0.05 Alpha.[1] Beta.>',
      '< 0.05 Alpha.[1] Beta.>',
      'Literal <0.05 Alpha.[1] Beta.>',
      '<(Alpha.[1]) Beta.>',
      'The result was significant (p<0.05>.[1] Next sentence.',
      'Outer (the result (p<0.05>).[1] Next sentence.)',
      'The result was significant (p<0.05.>[1] Next sentence.',
      '(<word.>[1]> Next sentence.',
      'Outer (the result (p < 0.05).[1] Next sentence.)',
      '(p < 0.05.[1] Next sentence.',
      '<p<0.05.[1] Next sentence.>',
      '(word> Alpha.[1] Beta.)',
    ])('preserves citation enclosure depth around numeric and surplus angle marks: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test('keeps the bounded numeric-comparison ambiguity explicit', () => {
      const input = 'x <0.05 Alpha.[1] Beta.>';
      expect(ss(input)).toEqual(['x <0.05 Alpha.[1]', 'Beta.>']);
      expect(segmentCaseNeutrally(input)).toEqual(['x <0.05 Alpha.[1]', 'Beta.>']);
      for (const expression of ['p < x', '0 < p < 1', 'pvalue < 0.05', 'p < -0.05']) {
        const retained = `(${expression}).[1] Next sentence.`;
        expect(ss(retained)).toEqual([retained]);
        expect(segmentCaseNeutrally(retained)).toEqual([retained]);
      }
      for (const incomplete of ['<', '< ', 'p<', 'p <   ']) {
        expect(ss(incomplete)).toEqual([incomplete.trim()]);
        expect(segmentCaseNeutrally(incomplete)).toEqual([incomplete.trim()]);
      }
    });

    test.each([
      'She said "Alpha.[1] Beta." aloud.',
      "She said 'Alpha.[1] Beta.' aloud.",
      'She said ‘Alpha.[1] Beta.’ aloud.',
      'She said “Alpha.[1] Beta.” aloud.',
      'She said “He called ‘Alpha.[1]’ Beta.” aloud.',
      'He said «Alpha.[1] Beta.» aloud.',
      'He asked (really?)[1] John to continue.',
      'He noted (Alpha.[1] Beta.) today.',
      'See [Alpha.[1] Beta.] today.',
    ])('does not split citations inside surrounding delimiters: %s', (input) => {
      expect(ss(input)).toEqual([input]);
    });

    test.each([
      "She said 'The dogs' owners saw Alpha.[1] Beta.'",
      "She said 'The dogs' owners' Alpha.[1] Beta.'",
      "She said 'Alice's Alpha.[1] Beta.'",
      "She said ‘The dogs’ owners called 'Alice' near Alpha.[1] Beta.’ aloud.",
      "She said ‘The dogs’ owners saw 'Alpha.[1] Beta.'’ aloud.",
      'She said ‘Alice’s Alpha.[1] Beta.’ aloud.',
      'She said ‘𝒜’s Alpha.[1] Beta.’ aloud.',
      'She said ‘Café’s Alpha.[1] Beta.’ aloud.',
      'She said ‘The dogs’ Alpha.[1] Beta.’ aloud.',
      'She said ‘The dogs’ owners’ Alpha.[1] Beta.’ aloud.',
    ])('keeps cited text inside quotes containing apostrophes: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test.each([', then left.', '—then left.'])(
      'recognizes a closing ASCII quote before %s',
      (suffix) => {
        const input = `She said 'The dogs' owners saw Alpha.[1] Beta.'${suffix}`;
        expect(ss(input)).toEqual([input]);
      },
    );

    test('keeps the ASCII plural possessive citation passage with its attribution', () => {
      const input = "She said 'The dogs' owners saw Alpha.[1] Beta.' aloud.";
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each(['[1]', '(1)', '1', '𝟚'])(
      'synchronizes a closing ASCII quote before citation %s',
      (citation) => {
        const input = `He said 'Alpha.'${citation} Next. Gamma.[2] Delta.`;
        const expected = [`He said 'Alpha.'${citation}`, 'Next.', 'Gamma.[2]', 'Delta.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each([
      ['"', '"', '``', "''"],
      ['``', "''", '"', '"'],
      ['``', "''", '``', "''"],
      ['“', '”', '``', "''"],
      ['``', "''", '‘', '’'],
      ['"', '"', '「', '」'],
    ])(
      'retains nested %s%s and %s%s citation quotation levels',
      (outer, closeOuter, inner, closeInner) => {
        for (const gap of ['', ' ']) {
          for (const suffix of [
            `${closeInner}${gap}${closeOuter}[1]`,
            `[1]${closeInner}${gap}${closeOuter}`,
            `${closeInner}[1]${gap}${closeOuter}`,
          ]) {
            const first = `He said ${outer}She said ${inner}Alpha.${suffix}`;
            for (const next of ['Next.', '"Next."', '“Next.”']) {
              const expected = [first, next];
              expect(ss(`${first} ${next}`)).toEqual(expected);
              expect(segmentCaseNeutrally(`${first} ${next}`)).toEqual(expected);
            }
          }
        }
        for (const suffix of [
          `${closeInner}[1] Next.${closeOuter}`,
          `[1] Next.${closeInner}${closeOuter}`,
        ]) {
          const input = `He said ${outer}She said ${inner}Alpha.${suffix}`;
          expect(ss(input)).toEqual([input]);
          expect(segmentCaseNeutrally(input)).toEqual([input]);
        }
      },
    );

    test.each([
      ['"', "''"],
      ['``', '"'],
      ['"', '"'],
      ['``', "''"],
    ])('retains interchangeable double quotation closers %s%s', (opening, closing) => {
      for (const gap of ['', ' ']) {
        const first = `He said ${opening}Alpha.${gap}${closing}[1]`;
        const expected = [first, 'Next.[2]', 'Last.'];
        expect(ss(`${first} Next.[2] Last.`)).toEqual(expected);
        expect(segmentCaseNeutrally(`${first} Next.[2] Last.`)).toEqual(expected);
      }
    });

    test.each([
      'He said ``She said "Alpha." "[1]',
      'He said ``She said "Alpha.""[1]',
      'He said ``She said "Alpha.[1]" "',
      'He said "She said ``Alpha.\'\' "[1]',
      'He said ``She said "Alpha." \'\'[1]',
    ])('exhausts completed nested quotation levels before the next citation: %s', (first) => {
      const expected = [first, 'Next.[2]', 'Last.'];
      expect(ss(`${first} Next.[2] Last.`)).toEqual(expected);
      expect(segmentCaseNeutrally(`${first} Next.[2] Last.`)).toEqual(expected);
      for (const next of ['"Next."', '“Next.”']) {
        expect(ss(`${first} ${next}`)).toEqual([first, next]);
        expect(segmentCaseNeutrally(`${first} ${next}`)).toEqual([first, next]);
      }
    });

    test.each([63, 64, 65, 66])(
      'bounds combined double-family quotation nesting at depth %s',
      (depth) => {
        const pairs = Array.from({ length: depth }, (_, index) =>
          index % 2 ? ['``', "''"] : ['"', '"'],
        );
        const first =
          pairs.map(([opening]) => `${opening}part `).join('') +
          'Alpha.[1]' +
          pairs
            .reverse()
            .map(([, closing]) => closing)
            .join('');
        const input = `${first} Next.`;
        const expected = depth <= 64 ? [first, 'Next.'] : [input];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each(['.5', '.٥', '1e3', '.5e-3'])(
      'combines numeric left operand %s with nested citation quotation context',
      (operand) => {
        for (const [outer, closeOuter, inner, closeInner] of [
          ['"', '"', '``', "''"],
          ['``', "''", '"', '"'],
        ]) {
          const first = `He said ${outer}Result ${inner}${operand} < 1.${closeInner}${closeOuter}[1]`;
          expect(ss(`${first} Next.[2] Last.`)).toEqual([first, 'Next.[2]', 'Last.']);
          expect(segmentCaseNeutrally(`${first} Next.[2] Last.`)).toEqual([
            first,
            'Next.[2]',
            'Last.',
          ]);
        }
      },
    );

    test('does not read a number in an adjacent quotation as a citation', () => {
      const input = 'He said "Alpha.""2 people agreed."';
      expect(ss(input)).toEqual(['He said "Alpha."', '"2 people agreed."']);
      expect(segmentCaseNeutrally(input)).toEqual(['He said "Alpha."', '"2 people agreed."']);
    });

    test('does not absorb a spaced list marker after an explicit citation', () => {
      const input = 'Alpha.[1] (2) Beta. (3) Gamma.';
      const expected = ['Alpha.[1]', '(2) Beta.', '(3) Gamma.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('keeps spaced parenthesized list markers with their items', () => {
      const input = 'Introduction. (1) Install the package. (2) Run it.';
      const expected = ['Introduction.', '(1) Install the package.', '(2) Run it.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('does not mistake a quoted numeric sentence start for a citation', () => {
      const input = 'Alpha."2 people agreed."';
      const expected = ['Alpha.', '"2 people agreed."'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    });

    test('scores reordered cited reference sentences correctly', () => {
      expect(rouge.l('Beta Alpha.[1]', 'Alpha.[1] Beta.')).toBeCloseTo(10 / 11);
    });

    test.each([
      `${'“'.repeat(65)}inside${'”'.repeat(64)} Alpha.[1] Beta.`,
      `${'“'.repeat(64)}‘inside’${'”'.repeat(64)} Alpha.[1] Beta.`,
      `${'‚'.repeat(65)}inside${'‘'.repeat(64)} Alpha.[1] Beta.`,
    ])('keeps citation recognition conservative after quotation depth overflows: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test.each([
      'She said ‘The dogs’ owners quoted ‘something’ Alpha.[1] Beta.’ Next.',
      'She said ‘The dogs’ owners quoted ‘the cats’ owner’ Alpha.[1] Beta.’ Next.',
    ])('keeps citations inside nested possessive quotations: %s', (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([input.toLowerCase()]);
    });

    test('retains citation boundaries after separate quotations ending in s', () => {
      const first = 'She said ‘dogs’ and ‘cat’ Alpha.[1]';
      const second = 'Beta.';
      expect(ss(`${first} ${second}`)).toEqual([first, second]);
      expect(segmentCaseNeutrally(`${first} ${second}`)).toEqual([first, second]);
    });

    test('disables citation inference when tentative possessive frames overflow', () => {
      const input = `${'‘dogs’ '.repeat(65)}Alpha.[1] Beta.`;
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    });

    test('segments citation-heavy documents without repeated quotation searches', () => {
      expect(ss('Alpha.[1] Beta. '.repeat(4000))).toHaveLength(8000);
    });

    describe('ReDoS prevention', () => {
      test('bounds unmatched citation quotation state within a constrained heap', () => {
        expectBundledScriptToPass(
          `
            const summary = '‘'.repeat(7000000) + ' Alpha.[1] Beta.';
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
    });
  });
});

describe('Reference labels retain abbreviation and decimal context', () => {
  test.each(['Intro e.g. setup', 'Intro i.e. setup', 'Dr. Smith', 'Setup 1.5'])(
    'retains the prose reference through %s',
    (title) => {
      const input = `See sections 1) ${title}, 2) Scope, and 3) Details.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
      expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
        input.toLowerCase(),
      ]);
    },
  );

  test.each(['.', ';', ':', '!', '?'])(
    'ends reference context at a genuine %s boundary',
    (terminal) => {
      const input = `See sections 1) Intro${terminal} Options: 2) Scope 3) Details.`;
      for (const caseNeutral of [false, true]) {
        const sentences = rouge.sentenceSegment(input, { caseNeutral });
        expect(sentences.slice(-2)).toEqual(['2) Scope', '3) Details.']);
      }
    },
  );

  test('reference order remains significant across abbreviation-bearing titles', () => {
    const first = 'See sections 1) Intro e.g. setup, 2) Scope, and 3) Details.';
    const reordered = 'See sections 3) Details, 2) Scope, and 1) Intro e.g. setup.';
    expect(rouge.l(first, reordered)).toBeLessThan(1);
  });

  test('scans repeated abbreviation-bearing reference gaps once', () => {
    const input = `See sections 1) Intro e.g. setup${', 2) More e.g. setup'.repeat(8000)}.`;
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([input]);
  }, 5000);
});

describe('Reference punctuation respects shared literal ownership', () => {
  test.each([
    '"Intro."',
    "'Intro.'",
    '“Intro.”',
    '‘Intro.’',
    '`Intro.`',
    '(Intro.)',
    '[Intro.]',
    '{Intro.}',
    '<Intro.>',
  ])('retains a prose reference title %s', (title) => {
    const input = `See sections 1) ${title}, 2) Scope, and 3) Details.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
    expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
      input.toLowerCase(),
    ]);
  });

  test.each(['"Intro."', '`Intro.`', '(Intro.)'])(
    'recognizes a subsequent plain boundary after protected %s',
    (title) => {
      const input = `See sections 1) ${title}. Options: 2) Scope 3) Details.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral }).slice(-2)).toEqual([
          '2) Scope',
          '3) Details.',
        ]);
      }
    },
  );

  test('keeps repeated protected reference titles linear and order-sensitive', () => {
    const input = `See sections 1) "Intro."${', 2) `More.`'.repeat(8000)}.`;
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([input]);
    expect(
      rouge.l(
        'See sections 1) "Intro.", 2) Scope, and 3) Details.',
        'See sections 3) Details, 2) Scope, and 1) "Intro.".',
      ),
    ).toBeLessThan(1);
  }, 5000);
});

describe('German citation quotations and structural continuation evidence', () => {
  test.each([
    'He said „Alpha.[1] Beta.“ aloud.',
    'He said „“Alpha.[1] Beta.” aloud.“ Next.',
    'He said “„Alpha.[1] Beta.“ aloud.” Next.',
    'He said „“Alpha.[1]” Beta.“ aloud.',
    'He said „Alpha.[1] “Beta.” aloud.“ Next.',
    'He said „Alpha.[1]“ and continued.',
  ])('retains the pending surrounding quotation in %s', (input) => {
    const expected = input.endsWith(' Next.') ? [input.slice(0, -6), 'Next.'] : [input];
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual(expected);
    }
  });

  test.each([
    'He said „Alpha.[1]“',
    'He said „Alpha.“[1]',
    'He said „“Alpha.[1]”“',
    'He said “„Alpha.[1]“”',
    'He said „"Alpha.[1]"“',
    "He said „'Alpha.[1]'“",
    'He said „Alpha. [1] “',
    'He said „Alpha. “ [1]',
  ])('consumes the complete German citation closers in %s', (first) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
    }
  });

  test('keeps a following independent German or English quotation separate', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('Alpha.[1] „Next.“', { caseNeutral })).toEqual([
        'Alpha.[1]',
        '„Next.“',
      ]);
      expect(rouge.sentenceSegment('He said „Alpha.[1]“ “Next.[2]”', { caseNeutral })).toEqual([
        'He said „Alpha.[1]“',
        '“Next.[2]”',
      ]);
    }
  });

  test.each(['¿Qué pasó?', '¡Qué bien!', '• Item follows.', '⁃ Item follows.'])(
    'allows the spaced structural start %s after an explicit citation',
    (next) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`Alpha.[1] ${next}`, { caseNeutral })).toEqual([
          'Alpha.[1]',
          next,
        ]);
        const attached = `Alpha.[1]${next}`;
        expect(rouge.sentenceSegment(attached, { caseNeutral })).toEqual([attached]);
      }
      expect(
        rouge.sentenceSegment(`Alpha.[1] ${next}`.toLowerCase(), { caseNeutral: true }),
      ).toEqual(['alpha.[1]', next.toLowerCase()]);
    },
  );

  test.each([', and continues.', '— an aside continues.', ': details follow.'])(
    'retains continuation punctuation %s after a citation',
    (next) => {
      for (const caseNeutral of [false, true]) {
        const input = `Alpha.[1] ${next}`;
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
    },
  );

  test.each(['ABC2', 'ABC_', 'AB𐒠'])(
    'retains digit or underscore evidence from earlier dotted component %s',
    (prefix) => {
      const input = `${prefix}.DEF.1 Introduction.`;
      expect(rouge.sentenceSegment(input)).toEqual([input]);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([
        `${prefix}.`,
        'DEF.1 Introduction.',
      ]);
      expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
        `${prefix.toLowerCase()}.`,
        'def.1 introduction.',
      ]);
    },
  );

  test('resets identifier evidence at real punctuation and preserves letter-only ambiguity', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('2!Alpha.1 Next.', { caseNeutral })).toEqual([
        '2!',
        'Alpha.1',
        'Next.',
      ]);
    }
    expect(rouge.sentenceSegment('ABC.DEF.1 Introduction.', { caseNeutral: true })).toEqual([
      'ABC.',
      'DEF.1',
      'Introduction.',
    ]);
  });

  test('keeps repeated identifier candidates within a linear scan', () => {
    const input = `${'A.1'.repeat(40_000)} Introduction.`;
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([input]);
  }, 3000);
});

describe('German single citation quotes and explicit quoted continuations', () => {
  const ss = rouge.sentenceSegment;

  const segmentCaseNeutrally = (input: string) =>
    rouge.sentenceSegment(input, { caseNeutral: true });

  test.each([
    'He said ‚Alpha.[1] Beta.‘ aloud.',
    'He said ‚‘Alpha.[1] Beta.’ aloud.‘ Next.',
    'He said ‘‚Alpha.[1] Beta.‘ aloud.’ Next.',
  ])('retains a pending low-single quotation in %s', (input) => {
    const expected = input.startsWith('He said ‘') ? [input.slice(0, -6), 'Next.'] : [input];
    expect(ss(input)).toEqual(expected);
    expect(segmentCaseNeutrally(input)).toEqual(expected);
  });

  test.each([
    'He said ‚Alpha.[1]‘',
    'He said ‚Alpha.[1] ‘',
    'He said‚Alpha.[1] Beta.[2]‘',
    'He said ‚‘Authors’ notes Alpha.[1] Beta.’ aloud.[2]‘',
    'He said ‚Authors’ notes Alpha.[1] Beta.[2]‘',
    'He said ‚‘Tis Alpha.[1] Beta.’ aloud.[2]‘',
    'He said ‚It was ‘n roll Alpha.[1] Beta.[2]‘',
    'He said ‚It was ‘tis Alpha.[1] Beta.[2]‘',
    'He said ‚“Alpha.[1] Beta.” aloud.[2]‘',
    'He said “‚Alpha.[1] Beta.‘ aloud.[2]”',
    'He said "‚Alpha.[1] Beta.‘ aloud.[2]"',
    'He said ‘‚Alpha.[1] Beta.‘ Authors’ notes.[2]’',
  ])('consumes only the completed surrounding quotation in %s', (first) => {
    expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
    expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
  });

  test.each([
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
    ['«', '»'],
    ['„', '“'],
    ['‚', '‘'],
  ])('recognizes the explicit next quote %s%s in neutral mode', (opening, closing) => {
    const next = `${opening}Because he left.${closing}`;
    expect(ss(`Alpha.[1] ${next}`)).toEqual(['Alpha.[1]', next]);
    expect(segmentCaseNeutrally(`Alpha.[1] ${next}`)).toEqual(['Alpha.[1]', next]);
    expect(segmentCaseNeutrally(`alpha.[1] ${next.toLowerCase()}`)).toEqual([
      'alpha.[1]',
      next.toLowerCase(),
    ]);
  });

  test.each(['Alpha.[1] because he left.', 'Alpha.[1] (because he left).'])(
    'retains unquoted continuation %s',
    (input) => {
      expect(ss(input)).toEqual([input]);
      expect(segmentCaseNeutrally(input)).toEqual([input]);
    },
  );

  test.each(["'", '‘', '’'])('treats unpaired %sn as the existing elision class', (mark) => {
    const first = `Rock ${mark}n roll ended.`;
    expect(ss(`${first} Alpha.[1] Next.`)).toEqual([first, 'Alpha.[1]', 'Next.']);
    expect(segmentCaseNeutrally(`${first} Alpha.[1] Next.`)).toEqual([first, 'Alpha.[1]', 'Next.']);
  });

  test.each([
    ["'", "'"],
    ['‘', '’'],
  ])('confirms a real %sn citation quotation with its %s closer', (opening, closing) => {
    const first = `He said ${opening}n choices were Alpha.[1] Beta.[2]${closing}`;
    expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
    expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
  });

  test('does not borrow a later independent quotation for an unpaired n elision', () => {
    const input = "Rock 'n roll ended. He said 'No.' Alpha.[1] Next.";
    const expected = ["Rock 'n roll ended.", "He said 'No.'", 'Alpha.[1]', 'Next.'];
    expect(ss(input)).toEqual(expected);
    expect(segmentCaseNeutrally(input)).toEqual(expected);
  });

  test('keeps shared single-quote cursors monotone across many independent pairs', () => {
    const first = 'He said ‚‘Alpha.[1] Beta.’ aloud.[2]‘';
    const input = `${`${first} `.repeat(5000)}Next.`;
    expect(ss(input)).toEqual([...new Array(5000).fill(first), 'Next.']);
    expect(segmentCaseNeutrally(input)).toEqual([...new Array(5000).fill(first), 'Next.']);
  });
});

describe('CJK paired citation quotation context', () => {
  test.each([
    ['「', '」'],
    ['『', '』'],
  ])('retains pending and completed %s%s citation quotations', (opening, closing) => {
    const pending = `He said ${opening}Alpha.[1] Beta.${closing} aloud.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(pending, { caseNeutral })).toEqual([pending]);
      for (const citation of [`.${closing}[1]`, `.[1]${closing}`, `.[1] ${closing}`]) {
        const first = `He said ${opening}Alpha${citation}`;
        expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
        const next = `${opening}Because he left.${closing}`;
        expect(rouge.sentenceSegment(`${first} ${next}`, { caseNeutral })).toEqual([first, next]);
      }
      const ordinary = `He said ${opening}Alpha. Beta.${closing} aloud.`;
      expect(rouge.sentenceSegment(ordinary, { caseNeutral })).toEqual([
        `He said ${opening}Alpha.`,
        `Beta.${closing} aloud.`,
      ]);
      const overflow = `${opening.repeat(65)}inside${closing.repeat(64)} Alpha.[1] Beta.`;
      expect(rouge.sentenceSegment(overflow, { caseNeutral })).toEqual([overflow]);
    }
  });

  test.each([
    'He said 「『Alpha.[1] Beta.』 aloud.[2]」',
    'He said 『「Alpha.[1] Beta.」 aloud.[2]』',
    'He said “「Alpha.[1] Beta.」 aloud.[2]”',
    'He said 「“Alpha.[1] Beta.” aloud.[2]」',
    'He said "「Alpha.[1]」 Beta.[2]"',
    'He said 「"Alpha.[1]" Beta.[2]」',
    "He said 「'Alpha.[1]' Beta.[2]」",
    'He said ‘「’tis Alpha.[1] Beta.」 aloud.[2]’',
    'He said 「Authors’ notes Alpha.[1] Beta.[2]」',
  ])('preserves mixed pending nesting before the last cited closer in %s', (first) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
    }
  });

  test('recognizes a German low-single closer before the citation group', () => {
    const first = 'He said ‚Alpha.‘[1]';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
    }
  });

  test('retains Japanese surrounding text around an embedded Latin citation', () => {
    const input = '彼は「Alpha.[1] Beta.」と言った。';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });
});

describe('Bare citation context after supported bracket closers', () => {
  test.each([
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
    ['<', '>'],
  ])('treats a completed %s%s span consistently before a bare citation', (opening, closing) => {
    const first = `${opening}foo${closing}.1`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
      const enclosed = `{${first} Next.}`;
      expect(rouge.sentenceSegment(enclosed, { caseNeutral })).toEqual([enclosed]);
    }
  });

  test.each(['package/{foo}.1 Next.', 'package/<foo>.1 Next.'])(
    'retains the bare-path guard in %s',
    (input) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
    },
  );
});

describe('Citation boundaries around quotation openers and closers', () => {
  const segmentCaseNeutrally = (input: string) =>
    rouge.sentenceSegment(input, { caseNeutral: true });

  test.each([':', ',', ';', '—', '–', '-', '\u{10ead}'])(
    'retains right-double quotation context after punctuation %s',
    (punctuation) => {
      const pending = `Han sa${punctuation}”Alpha.[1] Beta.” högt.`;
      const matchingCloser = `Han sa ”Alpha.[1] Beta${punctuation}” högt.`;
      for (const input of [pending, matchingCloser]) {
        expect(rouge.sentenceSegment(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual(
          input === pending ? [pending.slice(0, -6), 'högt.'] : [input],
        );
      }
      const first = `Han sa${punctuation}”Alpha.[1]”`;
      expect(rouge.sentenceSegment(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
    },
  );

  test.each([
    ...bracketPairs,
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['”', '”'],
    ['``', "''"],
    ['「', '」'],
  ] as const)(
    'retains an unspaced boundary after completed %s%s citation context',
    (opening, closing) => {
      for (const marker of ['[1]', '(1)']) {
        const first = `${opening}Alpha.${marker}${closing}`;
        expect(rouge.sentenceSegment(`${first}Next.`)).toEqual([first, 'Next.']);
        expect(segmentCaseNeutrally(`${first}Next.`)).toEqual([first, 'Next.']);
        expect(rouge.sentenceSegment(`${first}next.`)).toEqual([`${first}next.`]);
        expect(segmentCaseNeutrally(`${first}next.`)).toEqual([first, 'next.']);
        const pending = `${opening}Alpha.${marker}Next.${closing}`;
        expect(rouge.sentenceSegment(pending)).toEqual([pending]);
        expect(segmentCaseNeutrally(pending)).toEqual([pending]);
      }
    },
  );

  test.each([
    ['‘', '’'],
    ['‚', '‘'],
  ])('preserves an adjacent elision after the completed %s%s quotation', (opening, closing) => {
    for (const word of ['Tis', 'Twas', 'Cause', 'Cos', 'Round', '90s']) {
      const first = `She said ${opening}Alpha.[1]${closing}${word} true.`;
      const input = `${first} Later Alpha.[2] Next.`;
      const expected = [first, 'Later Alpha.[2]', 'Next.'];
      expect(rouge.sentenceSegment(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
    }
  });

  test.each(['Alpha.[1]', 'Alpha.(1)', '(Alpha.[1])', '”Alpha.[1]”'])(
    'opens an adjacent right-double quotation after accepted citation %s',
    (first) => {
      expect(rouge.sentenceSegment(`${first}”Next.”`)).toEqual([first, '”Next.”']);
      expect(segmentCaseNeutrally(`${first}”Next.”`)).toEqual([first, '”Next.”']);
      const citedTail = '”Next.[2] Later.[3]” Last.[4] Done.';
      const expected = [first, '”Next.[2] Later.[3]”', 'Last.[4]', 'Done.'];
      expect(rouge.sentenceSegment(first + citedTail)).toEqual(expected);
      expect(segmentCaseNeutrally(first + citedTail)).toEqual(expected);
      const ordinaryTail = '”Next.[2] Later.” Last.[3] Done.';
      const retained = [first, '”Next.[2] Later.”', 'Last.[3]', 'Done.'];
      expect(rouge.sentenceSegment(first + ordinaryTail)).toEqual(retained);
      expect(segmentCaseNeutrally(first + ordinaryTail)).toEqual(retained);
    },
  );

  test('consumes a pending right-double closer before an unspaced sentence start', () => {
    const first = 'Han sa ”Alpha.[1]”';
    expect(rouge.sentenceSegment(`${first}Next.`)).toEqual([first, 'Next.']);
    expect(segmentCaseNeutrally(`${first}Next.`)).toEqual([first, 'Next.']);
  });

  test('keeps the existing spacing requirement for a Treebank symbol start', () => {
    expect(rouge.sentenceSegment("Alpha.[1] ``Next.''")).toEqual(['Alpha.[1]', "``Next.''"]);
    expect(segmentCaseNeutrally("Alpha.[1] ``Next.''")).toEqual(['Alpha.[1]', "``Next.''"]);
    expect(rouge.sentenceSegment("Alpha.[1]``Next.''")).toEqual(["Alpha.[1]``Next.''"]);
    expect(segmentCaseNeutrally("Alpha.[1]``Next.''")).toEqual(["Alpha.[1]``Next.''"]);
  });

  test.each([
    '(Alpha.1)Next.',
    '"Alpha.1"Next.',
    'He said (Alpha.[1])Next.',
    'Outer ((Alpha.[1])Next.)',
    '(Alpha.[1])12 people.',
    '(Alpha.[1])_identifier.',
    '(Alpha.[1])/path.',
    'package/<foo>.1Next.',
    'Alpha.[1]”',
    'Alpha.[1]” Beta.',
    'Han sa ”Alpha.[1]Next.”',
  ])('retains competing bare, pending or identifier context in %s', (input) => {
    expect(rouge.sentenceSegment(input)).toEqual([input]);
    expect(segmentCaseNeutrally(input)).toEqual([input]);
  });
});

describe('Right-double citation quotation roles', () => {
  test.each(['Han sa ”Alpha.[1] Beta.” högt.', 'Han sa ”Alpha.[1] Beta.'])(
    'retains the pending surrounding quotation in %s',
    (input) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual(
          caseNeutral && input.endsWith(' högt.') ? [input.slice(0, -6), 'högt.'] : [input],
        );
      }
    },
  );

  test.each([
    'Han sa ”Alpha.[1]”',
    'Han sa ”Alpha.”[1]',
    'Han sa ”Alpha.[1] ”',
    'Han sa ”“Alpha.[1] Beta.” aloud.[2]”',
    'Han sa “Alpha.[1]”',
    'Han sa „”Alpha.[1] Beta.” aloud.[2]“',
    'Han sa ”„Alpha.[1] Beta.“ aloud.[2]”',
    'Han sa 「”Alpha.[1] Beta.” aloud.[2]」',
    'Han sa "”Alpha.[1] Beta.” aloud.[2]"',
  ])('releases only the completed surrounding quotation in %s', (first) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
    }
  });

  test('recognizes a following independent right-double quoted continuation', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('Alpha.[1] ”Because he left.”', { caseNeutral })).toEqual([
        'Alpha.[1]',
        '”Because he left.”',
      ]);
    }
  });

  test('does not infer an opener before whitespace or after an ordinary terminal', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('He wrote ” Alpha.[1] Next.', { caseNeutral })).toEqual([
        'He wrote ” Alpha.[1]',
        'Next.',
      ]);
      expect(rouge.sentenceSegment('Alpha.” Next.[1] Last.', { caseNeutral })).toEqual([
        'Alpha.”',
        'Next.[1]',
        'Last.',
      ]);
    }
  });
});

test('bounds right-double opening evidence at document and citation edges', () => {
  for (const caseNeutral of [false, true]) {
    expect(rouge.sentenceSegment('”Alpha.[1]” Next.', { caseNeutral })).toEqual([
      '”Alpha.[1]”',
      'Next.',
    ]);
    for (const input of ['”', 'Alpha.[1] ”', 'Alpha.[1] ” Beta.']) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  }
});

describe('Single-guillemet citation quotation context', () => {
  test.each(['He said ‹Alpha.[1] Beta.› aloud.', 'He said ‹Alpha.[1] Beta.'])(
    'retains the pending surrounding quotation in %s',
    (input) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
    },
  );

  test.each([
    'He said ‹Alpha.[1]›',
    'He said ‹Alpha.›[1]',
    'He said ‹Alpha.[1] ›',
    'He said ‹“Alpha.[1] Beta.” aloud.[2]›',
    'He said “‹Alpha.[1] Beta.› aloud.[2]”',
    'He said ‹„Alpha.[1] Beta.“ aloud.[2]›',
    'He said 「‹Alpha.[1] Beta.› aloud.[2]」',
  ])('releases a completed single-guillemet quotation in %s', (first) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
      expect(rouge.sentenceSegment(first, { caseNeutral })).toEqual([first]);
    }
  });

  test('retains quotation evidence for the next independent cited sentence', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('Alpha.[1] ‹Because he left.›', { caseNeutral })).toEqual([
        'Alpha.[1]',
        '‹Because he left.›',
      ]);
    }
  });

  test('preserves ordinary uncited and path behavior', () => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment('He said ‹Alpha. Beta.› aloud.', { caseNeutral })).toEqual([
        'He said ‹Alpha. Beta.› aloud.',
      ]);
      const path = 'See ‹https://site/page.1› Next.';
      expect(rouge.sentenceSegment(path, { caseNeutral })).toEqual([path]);
    }
  });

  test('preserves the existing citation nesting bound with single guillemets', () => {
    const input = `He said ${'‹'.repeat(65)}Alpha.[1] Beta.${'›'.repeat(65)} Next.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });
});

describe('Citation line separators and numeric prerequisites', () => {
  test.each([' ', '\t', '\n', '\r\n', '\u2028', '\u2029'])(
    'omits leading citation separator %j from a final fragment',
    (gap) => {
      for (const caseNeutral of [false, true]) {
        const input = `Alpha.[1]${gap}Beta`;
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual(['Alpha.[1]', 'Beta']);
        const internal = `Alpha.[1]${gap}Beta\u2028gamma`;
        expect(rouge.sentenceSegment(internal, { caseNeutral })).toEqual([
          'Alpha.[1]',
          'Beta\u2028gamma',
        ]);
      }
    },
  );

  test.each(['\n', '\r\n', '\u2028', '\u2029'])(
    'honors explicit line separator %j after a complete citation',
    (gap) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`Alpha.[1]${gap}beta.`, { caseNeutral })).toEqual([
          'Alpha.[1]',
          'beta.',
        ]);
        for (const prefix of ['Dr.', 'Wait...']) {
          const input = `${prefix}[1]${gap}smith.`;
          const expected = input.replace(/[\r\n]+/g, ' ');
          expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([expected]);
        }
      }
    },
  );

  test.each(['1', '١', '𝟙', 'Ⅳ', '½'])(
    'retains citation inference for Unicode Number %s',
    (number) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`Alpha.[${number}] Next.`, { caseNeutral })).toEqual([
          `Alpha.[${number}]`,
          'Next.',
        ]);
      }
    },
  );
});

describe('Bare hostname numeric components and explicit citations', () => {
  test.each(['com', 'COM', 'org', 'co.uk', 'io'])(
    'retains numeric hostname components after the existing label %s',
    (label) => {
      for (const caseNeutral of [false, true]) {
        const input = `See example.${label}.1 Next.`;
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        expect(rouge.sentenceSegment(`See example.${label}.[1] Next.`, { caseNeutral })).toEqual([
          `See example.${label}.[1]`,
          'Next.',
        ]);
      }
    },
  );
});

describe('Citation attachment stays within an explicit line', () => {
  test.each(['\n', '\r\n', '\u2028', '\u2029'])(
    'does not attach the following citation across %j',
    (gap) => {
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`Alpha.${gap}[1] Beta.`, { caseNeutral })).toEqual([
          'Alpha.',
          '[1] Beta.',
        ]);
        expect(rouge.sentenceSegment(`Alpha.[1]${gap}[2] Beta.`, { caseNeutral })).toEqual([
          'Alpha.[1]',
          '[2] Beta.',
        ]);
        for (const separator of [',', ';']) {
          expect(
            rouge.sentenceSegment(`Alpha.[1] ${gap}${separator} [2] Beta.`, { caseNeutral }),
          ).toEqual(['Alpha.[1]', `${separator} [2] Beta.`]);
        }
      }
    },
  );

  test.each(['\u2028', '\u2029'])('does not parse a numeric citation group across %j', (gap) => {
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(`Alpha.[1,${gap}2] Beta.`, { caseNeutral })).toEqual([
        'Alpha.',
        `[1,${gap}2] Beta.`,
      ]);
    }
  });

  test.each([' ', '\t', '\u00a0'])('retains horizontal citation whitespace %j', (gap) => {
    for (const caseNeutral of [false, true]) {
      for (const first of [`Alpha.${gap}[1]`, `Alpha.[1]${gap}[2]`, `Alpha.[1,${gap}2]`]) {
        expect(rouge.sentenceSegment(`${first} Beta.`, { caseNeutral })).toEqual([first, 'Beta.']);
      }
    }
  });
});

describe('Bare citation initial exclusions', () => {
  test.each([
    ['Á', 'A\u0301'],
    ['Å', 'A\u030a'],
    ['ά', 'α\u0301'],
  ])('retains composed %s and decomposed %s bare initial components', (composed, decomposed) => {
    for (const initial of [composed, decomposed]) {
      for (const prefix of ['', 'Use ']) {
        const input = `${prefix}${initial}.1 Next.`;
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
        }
      }
    }
  });

  test('reads the complete combining-mark run after an astral initial', () => {
    const initial = `𝒜${'\u0301'.repeat(16_384)}`;
    const input = `Use ${initial}.1 Next.`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
    }
  });

  test.each(['AB', 'A\u0301B', 'Cafe\u0301', '\u0345', 'prefix:A\u0301'])(
    'retains neutral bare-citation precedence for the noninitial %s',
    (word) => {
      const first = `${word}.1`;
      expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral: true })).toEqual([
        first,
        'Next.',
      ]);
    },
  );

  test('preserves structural identifier and explicit grouped-citation controls', () => {
    for (const caseNeutral of [false, true]) {
      for (const first of ['A\u0301_', 'A\u03012', 'Section A\u0301']) {
        const input = `${first}.1 Next.`;
        expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([input]);
      }
      expect(rouge.sentenceSegment('A\u0301.[1] Next.', { caseNeutral })).toEqual([
        'A\u0301.[1]',
        'Next.',
      ]);
    }
  });
});

describe('Citation state across quotation lookahead and partial closers', () => {
  test.each(['[1]', '(1)', '[¹]'])(
    'checks the final period of a four-dot citation %s during question lookahead',
    (citation) => {
      const question = `Was Alice choosing Alpha....${citation} or Beta?`;
      for (const quotation of ['"No."', '“No.”', '‹No.›']) {
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(`${quotation} ${question}`, { caseNeutral })).toEqual([
            quotation,
            question,
          ]);
          expect(
            rouge.sentenceSegment(
              `${quotation} Was Alice choosing Alpha....${citation} Next question?`,
              { caseNeutral },
            ),
          ).toEqual([`${quotation} Was Alice choosing Alpha....${citation}`, 'Next question?']);
        }
      }
    },
  );

  test('keeps repeated four-dot citation lookaheads independent', () => {
    const sentences = [
      '"No."',
      'Was Alice choosing Alpha....[1] or Beta?',
      '"Yes."',
      'Was Bob choosing Gamma....(2) or Delta?',
    ];
    const expected = Array.from({ length: 16 }, () => sentences).flat();
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(expected.join(' '), { caseNeutral })).toEqual(expected);
    }
  });

  test.each(['"No."', '“No.”', '‹No.›'])(
    'keeps the question after %s separate across a retained citation',
    (quotation) => {
      for (const body of [
        'Was Alice choosing Alpha.[1] or Beta?',
        'Was Alice choosing Alpha or Beta?',
        'Was Alice choosing Alpha or Beta?[1]',
        'Was x < 0.05 Alpha.[1] or Beta?',
        'Was Alice choosing https://site/Alpha.1 or Beta?',
      ]) {
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(`${quotation} ${body}`, { caseNeutral })).toEqual([
            quotation,
            body,
          ]);
        }
      }
    },
  );

  test.each(['()', '[]', '{}', '<>'])(
    'preserves the question prefix bracket state for %s',
    (brackets) => {
      const question = `${brackets[0]}Was Alice choosing Alpha.[1] or Beta?${brackets[1]}`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`"No." ${question}`, { caseNeutral })).toEqual([
          '"No."',
          question,
        ]);
      }
    },
  );

  test('combines confirmed list marker periods with retained question citations', () => {
    for (const outer of ['.', ')']) {
      for (const inner of ['.', ')']) {
        const first = `A${outer} "No."`;
        const body = `Was Alice choosing: 1${inner} Alpha.[1] or 2${inner} Beta?`;
        const last = `B${outer} Done.`;
        for (const caseNeutral of [false, true]) {
          expect(rouge.sentenceSegment(`${first} ${body} ${last}`, { caseNeutral })).toEqual([
            first,
            body,
            last,
          ]);
        }
      }
    }
  });

  test('distinguishes accepted citation boundaries from retained and malformed citations', () => {
    const quantity = '"No." Was Alice choosing Alpha.1 percent or Beta?';
    const malformed = '"No." Was Alice choosing Alpha.[x] or Beta?';
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(quantity, { caseNeutral })).toEqual(
        caseNeutral
          ? ['"No." Was Alice choosing Alpha.1', 'percent or Beta?']
          : ['"No."', 'Was Alice choosing Alpha.1 percent or Beta?'],
      );
      expect(rouge.sentenceSegment(malformed, { caseNeutral })).toEqual(
        caseNeutral
          ? ['"No." Was Alice choosing Alpha.', '[x] or Beta?']
          : ['"No."', 'Was Alice choosing Alpha.[x] or Beta?'],
      );
      expect(
        rouge.sentenceSegment('"No." Was Alice choosing Alpha.[1] Next question?', { caseNeutral }),
      ).toEqual(['"No." Was Alice choosing Alpha.[1]', 'Next question?']);
    }
  });

  test('preserves the citation overflow fallback during quotation lookahead', () => {
    const input = `${'“'.repeat(65)}inside${'”'.repeat(65)} "No." Was Alpha.[1] or Beta?`;
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual([
        input.slice(0, input.indexOf(' Was Alpha.')),
        'Was Alpha.[1] or Beta?',
      ]);
    }
  });

  test.each([64, 65])('uses citation or ordinary question boundaries at depth %i', (depth) => {
    const quotation = `${'“'.repeat(depth)}inside${'”'.repeat(depth)} "No."`;
    for (const caseNeutral of [false, true]) {
      expect(
        rouge.sentenceSegment(`${quotation} Was Alpha.[1] Next question?`, { caseNeutral }),
      ).toEqual(
        depth === 64
          ? [`${quotation} Was Alpha.[1]`, 'Next question?']
          : [quotation, 'Was Alpha.[1] Next question?'],
      );
    }
  });

  test('keeps repeated citation question consumers independent within a bounded subprocess', () => {
    expectBundledScriptToPass(
      `
        const expected = ['"No."', 'Was Alice choosing Alpha.[1] or Beta?',
          '"Yes."', 'Was Bob choosing Gamma.[2] or Delta?'];
        const input = Array(128).fill(expected.join(' ')).join(' ');
        for (const caseNeutral of [false, true]) {
          const actual = module.exports.sentenceSegment(input, { caseNeutral });
          if (actual.length !== 512 || actual.some((span, i) => span !== expected[i % 4])) {
            throw new Error('Repeated citation question boundaries changed');
          }
        }
        process.stdout.write('ok');
      `,
      5000,
    );
  }, 10_000);

  test.each(['「」', '『』'])(
    'retains a cited inner closer while the outer %s quotation remains pending',
    (outer) => {
      const first = `Han sa ${outer[0]}”Alpha.[1] Beta.” aloud.[2]${outer[1]}`;
      const uncitedOuter = `Han sa ${outer[0]}”Alpha.[1] Beta.” aloud.${outer[1]} Next.`;
      for (const caseNeutral of [false, true]) {
        expect(rouge.sentenceSegment(`${first} Next.`, { caseNeutral })).toEqual([first, 'Next.']);
        expect(rouge.sentenceSegment(uncitedOuter, { caseNeutral })).toEqual([uncitedOuter]);
      }
    },
  );

  test('does not borrow later citations or suppress ordinary terminals inside a quotation', () => {
    for (const caseNeutral of [false, true]) {
      expect(
        rouge.sentenceSegment('Han sa 「”Alpha. Beta.” aloud.」 Later.[2] Next.', { caseNeutral }),
      ).toEqual(
        caseNeutral
          ? ['Han sa 「”Alpha.', 'Beta.”', 'aloud.」 Later.[2]', 'Next.']
          : ['Han sa 「”Alpha.', 'Beta.” aloud.」 Later.[2]', 'Next.'],
      );
      expect(
        rouge.sentenceSegment('Han sa 「”Alpha.[1] Beta. Gamma.[2]」 Next.', { caseNeutral }),
      ).toEqual(['Han sa 「”Alpha.[1] Beta.', 'Gamma.[2]」 Next.']);
      expect(
        rouge.sentenceSegment('Han sa 「”Alpha.[1] Beta.”」 aloud.[2] Next.', { caseNeutral }),
      ).toEqual(['Han sa 「”Alpha.[1] Beta.”」 aloud.[2]', 'Next.']);
      const malformed = 'Han sa 「”Alpha.[x] Beta.” aloud.[2]」 Next.';
      expect(rouge.sentenceSegment(malformed, { caseNeutral })).toEqual(
        caseNeutral
          ? ['Han sa 「”Alpha.', '[x] Beta.”', 'aloud.[2]」', 'Next.']
          : ['Han sa 「”Alpha.[x] Beta.” aloud.[2]」', 'Next.'],
      );
    }
  });

  test('clears retained quotation ownership after a boundary and after a completed stack', () => {
    for (const caseNeutral of [false, true]) {
      expect(
        rouge.sentenceSegment('Han sa 「”Alpha.[1] Beta. Gamma.” aloud.[2]」 Next.', {
          caseNeutral,
        }),
      ).toEqual(
        caseNeutral
          ? ['Han sa 「”Alpha.[1] Beta.', 'Gamma.”', 'aloud.[2]」', 'Next.']
          : ['Han sa 「”Alpha.[1] Beta.', 'Gamma.” aloud.[2]」', 'Next.'],
      );
      expect(
        rouge.sentenceSegment(
          'Han sa 「”Alpha.[1] Beta.”」 Later 「”Gamma. Delta.” aloud.」 Last.[2] Next.',
          { caseNeutral },
        ),
      ).toEqual(
        caseNeutral
          ? [
              'Han sa 「”Alpha.[1] Beta.”」 Later 「”Gamma.',
              'Delta.”',
              'aloud.」 Last.[2]',
              'Next.',
            ]
          : ['Han sa 「”Alpha.[1] Beta.”」 Later 「”Gamma.', 'Delta.” aloud.」 Last.[2]', 'Next.'],
      );
    }
  });

  test('uses partial cited closers and accepted citation boundaries in question lookahead', () => {
    const input = '"No." Was Alice saying 「”Alpha.[1] Beta.” aloud.[2]」 or was Bob?';
    const malformed = input.replace('Alpha.[1]', 'Alpha.[x]');
    for (const caseNeutral of [false, true]) {
      expect(rouge.sentenceSegment(input, { caseNeutral })).toEqual(
        caseNeutral
          ? ['"No." Was Alice saying 「”Alpha.[1] Beta.” aloud.[2]」', 'or was Bob?']
          : ['"No."', 'Was Alice saying 「”Alpha.[1] Beta.” aloud.[2]」 or was Bob?'],
      );
      expect(rouge.sentenceSegment(malformed, { caseNeutral })).toEqual(
        caseNeutral
          ? ['"No." Was Alice saying 「”Alpha.', '[x] Beta.”', 'aloud.[2]」', 'or was Bob?']
          : [malformed],
      );
    }
  });
});

describe('Utility Functions', () => {
  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

    test.each(['(significant)', '(significant.)'])(
      'closes a bracketed smart quotation %s before a citation',
      (quotation) => {
        const first = `The result was ‘${quotation}’².`;
        const input = `${first} We use Acme Co.\nNext.`;
        const expected = [first, 'We use Acme Co.', 'Next.'];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
      },
    );

    test.each(['2', '²', '𝟚'])(
      'closes a punctuation-ending smart quotation before citation %s',
      (citation) => {
        for (const [open, close] of [
          ['‘', '’'],
          ['“', '”'],
        ]) {
          for (const terminal of ['.', '?', '!']) {
            const first = `The result was ${open}Stop${terminal}${close}${citation}.`;
            const input = `${first} We use Acme Co.\nNext.`;
            const expected = [first, 'We use Acme Co.', 'Next.'];
            expect(ss(input)).toEqual(expected);
            expect(segmentCaseNeutrally(input)).toEqual(expected);
            expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
              expected.map((sentence) => sentence.toLowerCase()),
            );
            const cited = `The result was ${open}Stop${terminal}${close}${citation}`;
            expect(ss(`${cited} Next sentence.`)).toEqual([cited, 'Next sentence.']);
            expect(segmentCaseNeutrally(`${cited} Next sentence.`)).toEqual([
              cited,
              'Next sentence.',
            ]);
            expect(segmentCaseNeutrally(`${cited} Next sentence.`.toLowerCase())).toEqual([
              cited.toLowerCase(),
              'next sentence.',
            ]);
          }
        }
      },
    );

    test('keeps a citation after a spaced smart closer with the quoted sentence', () => {
      const first = 'She said ‘Stop. ’2';
      expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
      expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
    });

    test.each(['ᵃ', 'ᵇ', 'ᶜ'])(
      'keeps an alphabetic footnote %s after a smart-single closer',
      (footnote) => {
        const input = `The study called it ‘significant at Acme Co.\nInternational Holdings’${footnote}.`;
        const expected = [input.replaceAll('\n', ' ')];
        expect(ss(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input)).toEqual(expected);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
          expected.map((sentence) => sentence.toLowerCase()),
        );
      },
    );

    test.each(['2', '²', '𝟚'])(
      'preserves a spaced smart-single closer before numeric footnote %s',
      (marker) => {
        for (const gap of [' ', '\t']) {
          const input = `The result was ‘significant at Acme Co.\nInternational Holdings${gap}’${marker}.`;
          const expected = [input.replace(/\s+/g, ' ')];
          expect(ss(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input)).toEqual(expected);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
            expected.map((part) => part.toLowerCase()),
          );
          const double = input.replace('‘', '“').replace('’', '”');
          expect(ss(double)).toEqual([double.replace(/\s+/g, ' ')]);
          expect(segmentCaseNeutrally(double)).toEqual([double.replace(/\s+/g, ' ')]);
        }
      },
    );

    test.each(['ᵃ', 'ᵇ', 'ᶜ'])(
      'attaches supported alphabetic footnote %s after a quoted terminal',
      (footnote) => {
        for (const [open, close] of [
          ['‘', '’'],
          ['“', '”'],
        ]) {
          for (const terminal of ['.', '?', '!']) {
            const first = `The result was ${open}Stop${terminal}${close}${footnote}.`;
            expect(ss(`${first} Next sentence.`)).toEqual([first, 'Next sentence.']);
            expect(segmentCaseNeutrally(`${first} Next sentence.`)).toEqual([
              first,
              'Next sentence.',
            ]);
            expect(segmentCaseNeutrally(`${first} Next sentence.`.toLowerCase())).toEqual([
              first.toLowerCase(),
              'next sentence.',
            ]);
          }
        }
      },
    );

    test.each([' ', '\t', '\n'])(
      'attaches alphabetic footnotes before whitespace %j',
      (separator) => {
        for (const [open, close] of [
          ['‘', '’'],
          ['“', '”'],
          ['"', '"'],
        ]) {
          const first = `${open}Stop?${close}ᵃ`;
          const input = `${first}${separator}Next sentence.`;
          expect(ss(input)).toEqual([first, 'Next sentence.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
            first.toLowerCase(),
            'next sentence.',
          ]);
        }
      },
    );

    test.each(['ᵃ', '²'])('attaches closing delimiters after a quotation footnote %s', (marker) => {
      for (const first of [
        `He said [“Stop?”${marker}]`,
        `He said [‘Stop?’${marker} ]`,
        `“He said ‘Stop?’${marker}”`,
        `‘He said “Stop?”${marker}’`,
      ]) {
        const input = `${first} Next sentence.`;
        expect(ss(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input)).toEqual([first, 'Next sentence.']);
        expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
          first.toLowerCase(),
          'next sentence.',
        ]);
      }
      const adjacentQuote = `He said "Stop?"${marker}"2 people agreed."`;
      for (const caseNeutral of [false, true]) {
        expect(ss(adjacentQuote, { caseNeutral })).toEqual([
          `He said "Stop?"${marker}`,
          '"2 people agreed."',
        ]);
      }
    });

    test.each(bracketPairs)('attaches numeric citations after enclosing %s%s', (open, close) => {
      for (const quote of [
        ['‘', '’'],
        ['“', '”'],
      ]) {
        for (const marker of ['2', '²', '𝟚']) {
          const first = `He said ${open}${quote[0]}Stop?${quote[1]}${close}${marker}`;
          const input = `${first} Next.`;
          expect(ss(input)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(input)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([first.toLowerCase(), 'next.']);
        }
      }
    });

    test.each(['²', '2', '𝟚', '²³', '12'])(
      'opens the next smart quotation after a quoted acronym and numeric citation %s',
      (citation) => {
        const first = `‘U.S.’${citation}`;
        for (const second of ['‘Next.’', '‘Tis true.’']) {
          const input = first + second;
          expect(ss(input)).toEqual([first, second]);
          expect(segmentCaseNeutrally(input)).toEqual([first, second]);
          expect(segmentCaseNeutrally(input.toLowerCase())).toEqual([
            first.toLowerCase(),
            second.toLowerCase(),
          ]);
        }
      },
    );

    test.each(['Use 2‘word’ as notation.', '‘U.S.’ ²‘Next.’', '‘U.S.’ text2‘word’ remained.'])(
      'requires an attached citation after the actual tentative closer: %s',
      (input) => {
        expect(ss(input)).toEqual([input]);
        expect(segmentCaseNeutrally(input)).toEqual([input]);
      },
    );

    test.each([
      ['“', '”'],
      ['‘', '’'],
    ])(
      'attaches isolated modifier footnotes before adjacent smart openers after %s%s',
      (open, close) => {
        for (const marker of ['ᵃ', 'ᵇ']) {
          const first = `${open}Stop?${close}${marker}`;
          for (const [nextOpen, nextClose] of [
            ['“', '”'],
            ['‘', '’'],
          ]) {
            const second = `${nextOpen}Next.${nextClose}`;
            expect(ss(`${first}${second}`)).toEqual([first, second]);
            expect(segmentCaseNeutrally(`${first}${second}`)).toEqual([first, second]);
            expect(segmentCaseNeutrally(`${first}${second}`.toLowerCase())).toEqual([
              first.toLowerCase(),
              second.toLowerCase(),
            ]);
          }
          const word = `${open}Stop?${close}${marker}word.`;
          expect(ss(word)).toEqual([word]);
          expect(segmentCaseNeutrally(word)).toEqual([`${open}Stop?${close}`, `${marker}word.`]);
        }
      },
    );

    test.each(['ᵃ', '2ᵃ', '𝟚ᵇ', '\u{107a5}'])(
      'opens a smart quotation after an acronym and modifier citation %s',
      (marker) => {
        const first = `‘U.S.’${marker}`;
        expect(ss(`${first}‘Next.’`)).toEqual([first, '‘Next.’']);
        expect(segmentCaseNeutrally(`${first}‘Next.’`)).toEqual([first, '‘Next.’']);
        expect(segmentCaseNeutrally(`${first}‘Next.’`.toLowerCase())).toEqual([
          first.toLowerCase(),
          '‘next.’',
        ]);
      },
    );

    test.each([
      ['[', ']'],
      ['(', ')'],
    ])('retains a bracketed modifier citation within %s%s', (left, right) => {
      for (const [open, close] of [
        ['“', '”'],
        ['‘', '’'],
      ]) {
        for (const marker of ['ᵃ', 'ᵇ', '\u{107a5}']) {
          const first = `The result was ${open}Stop?${close}${left}${marker}${right}.`;
          const expected = [first, 'Next.'];
          expect(ss(`${first} Next.`)).toEqual(expected);
          expect(segmentCaseNeutrally(`${first} Next.`)).toEqual(expected);
          expect(segmentCaseNeutrally(`${first} Next.`.toLowerCase())).toEqual(
            expected.map((sentence) => sentence.toLowerCase()),
          );
        }
      }
    });

    test.each(['[ᵃword]', '[a]', '[ᵃ)', '(ᵃ]'])(
      'retains ordinary delimited text instead of treating %s as a modifier citation',
      (tail) => {
        const input = `“Stop?”${tail}. Next.`;
        expect(ss(input)).toEqual([`“Stop?”${tail}.`, 'Next.']);
        expect(segmentCaseNeutrally(input)).toEqual(['“Stop?”', `${tail}.`, 'Next.']);
      },
    );

    test.each(['2', '²', '𝟚', 'ᵃ', '\u{107a5}'])(
      'attaches the citation %s after an inner ASCII single closer',
      (marker) => {
        for (const [open, close] of [
          ['“', '”'],
          ['‘', '’'],
        ]) {
          const first = `${open}He said 'Stop?'${marker}${close}`;
          expect(ss(first)).toEqual([first]);
          expect(segmentCaseNeutrally(first)).toEqual([first]);
          expect(ss(`${first} Next.`)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(`${first} Next.`)).toEqual([first, 'Next.']);
          expect(segmentCaseNeutrally(`${first} Next.`.toLowerCase())).toEqual([
            first.toLowerCase(),
            'next.',
          ]);
        }
      },
    );

    test.each(['²', '2', '𝟚'])('closes a quotation before a numeric citation %s', (citation) => {
      const first = `The result was ‘significant’${citation}.`;
      const input = `${first} We use Acme Co.\nNext sentence.`;
      const expected = [first, 'We use Acme Co.', 'Next sentence.'];
      expect(ss(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input)).toEqual(expected);
      expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(
        expected.map((sentence) => sentence.toLowerCase()),
      );
    });
  });
});

describe('Bracketed modifier footnote boundaries', () => {
  test.each(['[ᵃ]', '(ᵃ)', '[𐞥]', '(𐞥)'])(
    'attaches the supported marker %s before an independent sentence',
    (marker) => {
      for (const [open, close] of [
        ['“', '”'],
        ['‘', '’'],
        ['"', '"'],
      ]) {
        for (const terminal of ['.', '?', '!']) {
          const first = `The result was ${open}Stop${terminal}${close}${marker}`;
          const input = `${first} Next.`;
          expect(rouge.sentenceSegment(input)).toEqual([first, 'Next.']);
          expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([first, 'Next.']);
          expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
            first.toLowerCase(),
            'next.',
          ]);
        }
      }
    },
  );

  test.each([' Next.', 'Next.', '“Next.”'])(
    'keeps the next sentence opener after a marker and tail %j',
    (tail) => {
      const first = 'The result was “Stop?”[ᵃ]';
      const expected = [first, tail.trimStart()];
      expect(rouge.sentenceSegment(first + tail)).toEqual(expected);
      expect(rouge.sentenceSegment(first + tail, { caseNeutral: true })).toEqual(expected);
    },
  );

  test.each([
    'The result was (“Stop?”[ᵃ] today).',
    'He said “Inner ‘Stop?’[ᵃ] More.”',
    'He said “Inner ‘Stop?’[ᵃ]. More.”',
  ])('keeps a pending surrounding enclosure in %s', (first) => {
    const input = `${first} Next.`;
    expect(rouge.sentenceSegment(input)).toEqual([first, 'Next.']);
    expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([first, 'Next.']);
    expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
      first.toLowerCase(),
      'next.',
    ]);
  });

  test.each(['The result was (“Stop?”[ᵃ])', 'He said “Inner ‘Stop?’[ᵃ]”'])(
    'releases a completed surrounding enclosure in %s',
    (first) => {
      const input = `${first} Next.`;
      expect(rouge.sentenceSegment(input)).toEqual([first, 'Next.']);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([first, 'Next.']);
    },
  );

  test.each(['[ᵃ]', '(ᵃ)', '[𐞥]', '(𐞥)', '[2]ᵃ', '(2)ᵃ'])(
    'retains a scoped quoted question with marker %s',
    (marker) => {
      const first = 'She said “Use etc.';
      const question = `Which answer was ‘What?’${marker}”`;
      const input = `${first}\n${question}`;
      expect(rouge.sentenceSegment(input)).toEqual([first, question]);
      expect(rouge.sentenceSegment(input, { caseNeutral: true })).toEqual([first, question]);
      expect(rouge.sentenceSegment(input.toLowerCase(), { caseNeutral: true })).toEqual([
        first.toLowerCase(),
        question.toLowerCase(),
      ]);
    },
  );

  test.each(['[a]', '[ᵃword]', '[ᵃ)', '(ᵃ]', '[ᵃᵇ]', '{ᵃ}', '<ᵃ>'])(
    'preserves the literal annotation policy for %s',
    (literal) => {
      const first = 'The result was “Stop?”';
      const tail = `${literal} Next.`;
      expect(rouge.sentenceSegment(first + tail)).toEqual([first + tail]);
      expect(rouge.sentenceSegment(first + tail, { caseNeutral: true })).toEqual([first, tail]);
    },
  );
});
