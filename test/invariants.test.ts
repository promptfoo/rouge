import { l, n, s, sentenceSegment } from '../src/rouge';

const summaries = [
  'Alpha beta. Gamma delta.',
  'Dr. Jones arrived. Everyone cheered.',
  '1. First item 2. Second item',
  'He said "Hello." She said "Goodbye."',
];

test.each(summaries)('preserves case, whitespace, and content invariants: %s', (summary) => {
  for (const separator of [' ', '\t', '\n', '\r\n']) {
    const variant = summary.replaceAll(' ', separator);
    expect(sentenceSegment(variant).join('').replace(/\s/g, '')).toBe(summary.replace(/\s/g, ''));
    for (const score of [n, s, l]) {
      expect(score(variant, summary)).toBe(1);
      expect(score(variant, summary.toLowerCase(), { caseSensitive: false })).toBe(1);
    }
  }
});

test.each([
  ['"Alpha beta."', "``Alpha beta.''"],
  ['He said "Alpha beta."', "He said ``Alpha beta.''"],
])('preserves supported quote-style equivalence: %s', (straight, treebank) => {
  for (const score of [n, s, l]) {
    expect(score(straight, treebank)).toBe(1);
  }
});

function clippedScore(candidate: string[], reference: string[]): number {
  const remaining = [...reference];
  let matches = 0;
  for (const gram of candidate) {
    const index = remaining.indexOf(gram);
    if (index !== -1) {
      matches++;
      remaining.splice(index, 1);
    }
  }
  return matches === 0 ? 0 : (2 * matches) / (candidate.length + reference.length);
}

function grams(tokens: string[], size: number): string[] {
  const result: string[] = [];
  for (let i = 0; i + size <= tokens.length; i++) {
    result.push(JSON.stringify(tokens.slice(i, i + size)));
  }
  return result;
}

function pairs(tokens: string[], distance: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length && j - i <= distance; j++) {
      result.push(JSON.stringify([tokens[i], tokens[j]]));
    }
  }
  return result;
}

test('matches independent materialized n-gram and skip-pair oracles', () => {
  const inputs = ['a', 'b', 'a a', 'a b', 'b a', 'a b a', 'b a b', 'a a b b'];
  for (const candidate of inputs) {
    for (const reference of inputs) {
      const a = candidate.split(' ');
      const b = reference.split(' ');
      for (const size of [1, 2, 3]) {
        expect(n(candidate, reference, { n: size })).toBeCloseTo(
          clippedScore(grams(a, size), grams(b, size)),
          14,
        );
      }
      for (const distance of [0, 1, 2, Number.POSITIVE_INFINITY]) {
        expect(s(candidate, reference, { maxSkip: distance })).toBeCloseTo(
          clippedScore(pairs(a, distance), pairs(b, distance)),
          14,
        );
      }
    }
  }
});
