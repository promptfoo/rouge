import * as rouge from '../src/rouge';

describe('Utility Functions', () => {
  describe('fact', () => {
    const { fact } = rouge;

    test('should throw RangeError for -1!', () => {
      expect(() => fact(-1)).toThrow(RangeError);
    });

    test('should return 1 for 0!', () => {
      expect(fact(0)).toBe(1);
    });
    test('should return 1 for 1!', () => {
      expect(fact(1)).toBe(1);
    });

    test('should return 120 for 5!', () => {
      expect(fact(5)).toBe(120);
    });
    test('should return 3628800 for 10!', () => {
      expect(fact(10)).toBe(3628800);
    });
    test('should return 2432902008176640000 for 20!', () => {
      expect(fact(20)).toBe(2432902008176640000);
    });
    test('should return 2432902008176640000 for 20! using cache', () => {
      expect(fact(20)).toBe(2432902008176640000);
    });
  });

  describe('comb2', () => {
    const { comb2 } = rouge;

    test('should throw RangeError for C(1,2)', () => {
      expect(() => comb2(1)).toThrow(RangeError);
    });

    test('should return 1 for C(2,2)', () => {
      expect(comb2(2)).toBe(1);
    });
    test('should return 45 for C(10,2)', () => {
      expect(comb2(10)).toBe(45);
    });
    test('should return 499500 for C(1000,2)', () => {
      expect(comb2(1000)).toBe(499500);
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
    test('should return ["w1", "w3", "w5"] for ["w1", "w2", "w3", "w4", "w5"] and ["w1", "w3", "w8", "w9", "w5"]', () => {
      expect(lcs(['w1', 'w2', 'w3', 'w4', 'w5'], ['w1', 'w3', 'w8', 'w9', 'w5'])).toEqual([
        'w1',
        'w3',
        'w5',
      ]);
    });
  });

  describe('nGram', () => {
    const { nGram } = rouge;
    const data = ['a', 'b', 'c', 'd'];

    test('should throw RangeError for ngram size < 1', () => {
      expect(() => nGram(data, 0)).toThrow(RangeError);
    });
    test('should throw RangeError for invalid ngram size', () => {
      expect(() => nGram(data, 5)).toThrow(RangeError);
    });

    test("should return ['a', 'b', 'c', 'd'] for n = 1", () => {
      expect(nGram(data, 1)).toEqual(['a', 'b', 'c', 'd']);
    });
    test("should return ['a b', 'b c', 'c d'] for n = 2", () => {
      expect(nGram(data)).toEqual(['a b', 'b c', 'c d']);
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
  });

  describe('skipBigram', () => {
    const sb = rouge.skipBigram;

    const data = ['a', 'b', 'c', 'd'];
    const result = ['a b', 'a c', 'a d', 'b c', 'b d', 'c d'];

    test('should throw RangeError for inputs with insufficient words', () => {
      expect(() => sb(['a'])).toThrow(RangeError);
    });

    test('should return the correct result', () => {
      expect(sb(data)).toEqual(result);
    });
  });

  describe('sentenceSegment', () => {
    const ss = rouge.sentenceSegment;

    test('should return empty array for empty input', () => {
      expect(ss('')).toEqual([]);
    });

    // Golden Rule tests from https://github.com/diasks2/pragmatic_segmenter
    // =====================================================================

    test('should split simple periods', () => {
      expect(ss('Hello World. My name is Jonas.')).toEqual(['Hello World.', 'My name is Jonas.']);
    });

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
    });

    test('should not split U.S. as non-sentence boundary', () => {
      expect(ss('I have lived in the U.S. for 20 years.')).toEqual([
        'I have lived in the U.S. for 20 years.',
      ]);
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
          'He teaches science (He previously worked for 5 years as an engineer.) at the local University.'
        )
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
          'The site is: https://www.example.50.com/new-site/awesome_content.html. Please check it out.'
        )
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
          'Thoreau argues that by simplifying one\'s life, "the laws of the universe will appear less complex...."'
        )
      ).toEqual([
        'Thoreau argues that by simplifying one\'s life, "the laws of the universe will appear less complex...."',
      ]);
    });

    test('should not split ellipsis with square brackets', () => {
      expect(ss('"Bohr [...] used the analogy of parallel stairways [...]" (Smith 55).')).toEqual([
        '"Bohr [...] used the analogy of parallel stairways [...]" (Smith 55).',
      ]);
    });
  });

  describe('treeBankTokenize', () => {
    const tbt = rouge.treeBankTokenize;

    test('should return empty array for empty input', () => {
      expect(tbt('')).toEqual([]);
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
  });

  describe('fMeasure', () => {
    const fm = rouge.fMeasure;

    test('should throw RangeError for OOB precision input', () => {
      expect(() => fm(10, 0.5)).toThrow(RangeError);
    });
    test('should throw RangeError for OOB recall input', () => {
      expect(() => fm(0.5, 10)).toThrow(RangeError);
    });
    test('should throw RangeError for OOB beta input', () => {
      expect(() => fm(0.5, 0.75, -1)).toThrow(RangeError);
    });

    test('should ignore precision when beta > 1', () => {
      expect(fm(0.5, 0.75, Infinity)).toBe(0.75);
    });
    test('should correctly compute DUC score', () => {
      expect(fm(0.5, 0.75, 1)).toBe(0.6);
    });
  });

  describe('charIsUpperCase', () => {
    const isUpper = rouge.charIsUpperCase;

    test('should throw RangeError for non-character input', () => {
      expect(() => isUpper('abcd')).toThrow(RangeError);
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
  });
});

describe('Core Functions', () => {
  describe('ROUGE-N', () => {
    const { n } = rouge;

    const cand = 'pulses may ease schizophrenic voices';
    const refs = [
      'magnetic pulse series sent through brain may ease schizophrenic voices',
      'yale finds magnetic stimulation some relief to schizophrenics imaginary voices',
    ];

    test('should throw RangeError for empty candidate', () => {
      expect(() => n('', refs[0], { n: 2 })).toThrow(RangeError);
    });
    test('should throw RangeError for empty ref', () => {
      expect(() => n(cand, '', { n: 2 })).toThrow(RangeError);
    });

    test('should correctly compute ROUGE-N score for ref 1', () => {
      expect(n(cand, refs[0], { n: 2 })).toBe(1 / 3);
    });
    test('should correctly compute ROUGE-N score for ref 2', () => {
      expect(n(cand, refs[1], { n: 2 })).toBe(0);
    });

    test('should correctly compute ROUGE-N score for ref 1 with different opts', () => {
      expect(n(cand, refs[0], { n: 2 })).toBe(1 / 3);
    });
    test('should correctly compute ROUGE-N score for ref 2 with different opts', () => {
      expect(n(cand, refs[1], { n: 2 })).toBe(0);
    });
  });

  describe('ROUGE-S', () => {
    const { s } = rouge;

    const ref = 'police killed the gunman';
    const cands = ['police kill the gunman', 'the gunman kill police', 'the gunman police killed'];

    test('should throw RangeError for empty candidate', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => s('', ref, undefined as any)).toThrow(RangeError);
    });
    test('should throw RangeError for empty ref', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => s(cands[0], '', undefined as any)).toThrow(RangeError);
    });

    test('should return 0 for summaries with zero overlap', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(s('banana yoghurt', ref, undefined as any)).toBe(0);
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
  });

  describe('ROUGE-L', () => {
    const { l } = rouge;

    const ref = 'police killed the gunman';
    const cands = ['police kill the gunman', 'the gunman kill police', 'the gunman police killed'];

    test('should throw RangeError for empty candidate', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => l('', ref, undefined as any)).toThrow(RangeError);
    });
    test('should throw RangeError for empty ref', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => l(cands[0], '', undefined as any)).toThrow(RangeError);
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
  });
});
