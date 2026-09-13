import * as rouge from '../src/rouge';
import { englishGoldenRules } from './fixtures/english-golden';
import { bracketPairs, expectBundledScriptToPass, geographicAcronyms } from './helpers';

describe('sentenceSegment', () => {
  const ss = rouge.sentenceSegment;
  const segmentCaseNeutrally = (input: string): string[] => ss(input, { caseNeutral: true });

  test('should return empty array for empty input', () => {
    expect(ss('')).toEqual([]);
  });

  // Golden Rule tests from https://github.com/diasks2/pragmatic_segmenter
  // =====================================================================

  test.each(englishGoldenRules)(
    'matches upstream English Golden Rule #%s',
    (_rule, input, expected) => {
      expect(ss(input)).toEqual(expected);
    },
  );

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
    expect(ss('1. "First item" 2. "Second item"')).toEqual(['1. "First item"', '2. "Second item"']);
    expect(ss('1. (First item) 2. (Second item)')).toEqual(['1. (First item)', '2. (Second item)']);
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
      expect(segmentCaseNeutrally(lowerCase)).toEqual([firstSentence.toLowerCase(), 'jones left.']);
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

  test('closes single-quoted words ending in s', () => {
    expect(ss("He called it 'Success' before we use etc.\nNext sentence.")).toEqual([
      "He called it 'Success' before we use etc.",
      'Next sentence.',
    ]);
  });

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
    expect(segmentCaseNeutrally(input.toLowerCase())).toEqual(['he moved to calif.', 'next year.']);
    expect(segmentCaseNeutrally(input)).toEqual(segmentCaseNeutrally(input.replaceAll('\n', ' ')));
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

  test.each(['U.S. Government', 'The U.S. Government policy.', 'E.U. Commission', 'U.S.A. Today'])(
    'preserves acronym tokens across boundaries in %s',
    (input) => {
      expect(ss(input).flatMap(rouge.treeBankTokenize)).toEqual(rouge.treeBankTokenize(input));
    },
  );

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
    expect(ss('It was a cold \nnight in the city.')).toEqual(['It was a cold night in the city.']);
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
    expect(ss(`Alpha.${lineBreak}Beta.${lineBreak}Gamma.`)).toEqual(['Alpha.', 'Beta.', 'Gamma.']);
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
