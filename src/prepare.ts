import { sentenceSegment, treeBankTokenize } from './utils';

interface PreparedSummary {
  readonly sentences: readonly (readonly string[])[];
  readonly tokenCount: number;
}

/** Preserve whole-summary Unicode casing when segmentation changes only whitespace. */
function foldSentences(input: string, sentences: string[]): string[] {
  const folded = input.toLowerCase().replace(/[\s\u0085]+/g, '');
  let offset = 0;
  return sentences.map((sentence) =>
    sentence.replace(/[^\s\u0085]+/g, (word) => {
      const length = word.toLowerCase().length;
      const value = folded.slice(offset, offset + length);
      offset += length;
      return value;
    }),
  );
}

/** Snapshot tokens once; custom tokenizers receive whole summaries unless a segmenter is given. */
export function prepareSummary(
  input: string,
  caseSensitive: boolean,
  tokenizer: (input: string) => string[] = treeBankTokenize,
  segmenter = tokenizer === treeBankTokenize ? sentenceSegment : undefined,
): PreparedSummary {
  let sentences: string[];
  if (segmenter === sentenceSegment) {
    sentences = sentenceSegment(input, { caseNeutral: !caseSensitive });
  } else {
    sentences = segmenter === undefined ? [input] : segmenter(input);
  }
  if (!caseSensitive) {
    sentences =
      segmenter === sentenceSegment
        ? foldSentences(input, sentences)
        : sentences.map((sentence) => sentence.toLowerCase());
  }
  const tokens = sentences.map((sentence) => {
    const result = tokenizer(sentence);
    return tokenizer === treeBankTokenize ? result : [...result];
  });
  return {
    sentences: tokens,
    tokenCount: tokens.reduce((total, sentence) => total + sentence.length, 0),
  };
}
