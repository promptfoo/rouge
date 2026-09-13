import { lcsIndices as builtInLcsIndices } from './lcs';
import { prepareSummary } from './prepare';
import * as utils from './utils';
import {
  validateBeta,
  validateMaxSkip,
  validateNGramMaterialization,
  validateNGramScoringMaterialization,
  validateNGramSize,
} from './validation';

export * from './utils';

const whitespaceOnlyReg = /^[\s\u0085]*$/;

/** Options for ROUGE-N evaluation */
export interface RougeNOptions {
  /** The size of the ngram used (default: 1) */
  n?: number;
  /** The beta value used for the f-measure (default: 1.0) */
  beta?: number;
  /** Whether comparison is case-sensitive (default: true) */
  caseSensitive?: boolean;
  /** Custom ngram generator function */
  nGram?: (tokens: string[], n: number) => string[];
  /** Custom string tokenizer */
  tokenizer?: (input: string) => string[];
}

/** Options for ROUGE-S (skip-bigram) evaluation */
export interface RougeSOptions {
  /** The beta value used for the f-measure (default: 1.0) */
  beta?: number;
  /** Whether comparison is case-sensitive (default: true) */
  caseSensitive?: boolean;
  /** Maximum token index distance (1 includes adjacent words; default: Infinity) */
  maxSkip?: number;
  /** Custom skip-bigram generator function */
  skipBigram?: (tokens: string[], maxSkip: number) => string[];
  /** Custom string tokenizer */
  tokenizer?: (input: string) => string[];
}

/** Options for ROUGE-L (LCS) evaluation */
export interface RougeLOptions {
  /** The beta value used for the f-measure (default: 1.0) */
  beta?: number;
  /** Whether comparison is case-sensitive (default: true) */
  caseSensitive?: boolean;
  /** Custom LCS returning values aligned to reference occurrences from left to right. */
  lcs?: (a: string[], b: string[]) => string[];
  /** Custom LCS returning exact, strictly increasing reference indices; cannot be combined with `lcs`. */
  lcsIndices?: (candidate: string[], reference: string[]) => number[];
  /** Custom sentence segmenter */
  segmenter?: (input: string) => string[];
  /** Custom string tokenizer */
  tokenizer?: (input: string) => string[];
}

function countMatchingGrams(candidate: string[], reference: string[]): number {
  const remaining = new Map<string, number>();
  for (const gram of reference) {
    remaining.set(gram, (remaining.get(gram) ?? 0) + 1);
  }

  let matches = 0;
  for (const gram of candidate) {
    const count = remaining.get(gram) ?? 0;
    if (count > 0) {
      matches++;
      remaining.set(gram, count - 1);
    }
  }
  return matches;
}

interface SharedTokenPositions {
  candidate: number[];
  reference: number[];
}

function tokenPositions(tokens: string[]): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const existing = positions.get(token);
    if (existing) {
      existing.push(index);
    } else {
      positions.set(token, [index]);
    }
  }
  return positions;
}

/** Count ordered position pairs for an unbounded skip window. */
function countUnboundedSkipPairs(first: number[], second: number[]): number {
  let firstValid = 0;
  let pairs = 0;

  for (const firstPosition of first) {
    while (firstValid < second.length && second[firstValid] <= firstPosition) {
      firstValid++;
    }
    pairs += second.length - firstValid;
  }
  return pairs;
}

/** Count finite-window followers for one first-token value without retaining all pair types. */
function countFollowingSharedTokens(
  tokens: string[],
  firstPositions: number[],
  sharedPositions: ReadonlyMap<string, number[]>,
  maxSkip: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const firstPosition of firstPositions) {
    const lastPosition = Math.min(firstPosition + maxSkip, tokens.length - 1);
    for (let secondPosition = firstPosition + 1; secondPosition <= lastPosition; secondPosition++) {
      const token = tokens[secondPosition];
      if (sharedPositions.has(token)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Count clipped built-in skip-bigram matches without materializing pair strings. */
function countMatchingSkipBigrams(
  candidate: string[],
  reference: string[],
  maxSkip: number,
): number {
  const candidatePositions = tokenPositions(candidate);
  const referencePositions = tokenPositions(reference);
  const shared: SharedTokenPositions[] = [];

  for (const [token, candidateTokenPositions] of candidatePositions) {
    const referenceTokenPositions = referencePositions.get(token);
    if (referenceTokenPositions) {
      shared.push({
        candidate: candidateTokenPositions,
        reference: referenceTokenPositions,
      });
    }
  }

  let matches = 0;
  if (maxSkip !== Number.POSITIVE_INFINITY) {
    for (const first of shared) {
      const candidateCounts = countFollowingSharedTokens(
        candidate,
        first.candidate,
        referencePositions,
        maxSkip,
      );
      const referenceCounts = countFollowingSharedTokens(
        reference,
        first.reference,
        candidatePositions,
        maxSkip,
      );
      for (const [secondToken, candidateCount] of candidateCounts) {
        matches += Math.min(candidateCount, referenceCounts.get(secondToken) ?? 0);
      }
    }
    return matches;
  }

  for (const first of shared) {
    for (const second of shared) {
      const candidateCount = countUnboundedSkipPairs(first.candidate, second.candidate);
      if (candidateCount > 0) {
        const referenceCount = countUnboundedSkipPairs(first.reference, second.reference);
        matches += Math.min(candidateCount, referenceCount);
      }
    }
  }
  return matches;
}

function skipBigramCount(tokenCount: number, maxSkip: number): number {
  const distance = Math.min(maxSkip, tokenCount - 1);
  return distance * tokenCount - (distance * (distance + 1)) / 2;
}

/** The built-in tokenizer expects sentences; custom tokenizers receive whole summaries. */
function tokenizeSummary(
  input: string,
  caseSensitive: boolean,
  tokenizer?: (input: string) => string[],
): string[] {
  return prepareSummary(input, caseSensitive, tokenizer).sentences.flat();
}

/** JSON string tokens remain unambiguous when the built-in gram utilities join them. */
function encodeTokens(tokens: string[]): string[] {
  return tokens.map((token) => JSON.stringify(token));
}

/**
 * Computes the ROUGE-N score for a candidate summary.
 *
 * Configuration object schema and defaults:
 * ```
 * {
 * 	n: 1                            // The size of the ngram used
 * 	beta: 1.0                       // The beta value used for the f-measure
 * 	caseSensitive: true             // Whether comparison is case-sensitive
 * 	nGram: <inbuilt function>,      // The ngram generator function
 * 	tokenizer: <inbuilt function>   // The string tokenizer
 * }
 * ```
 *
 * `nGram` has a type signature of ((Array<string>, number) => Array<string>)
 * `tokenizer` has a type signature of ((string) => Array<string)
 *
 * @method n
 * @param  {string}     cand        The candidate summary to be evaluated
 * @param  {string}     ref         The reference summary to be evaluated against
 * @param  {Object}     opts        Configuration options (see example)
 * @return {number}                 The ROUGE-N F-score
 */
export function n(cand: string, ref: string, opts?: RougeNOptions): number {
  if (whitespaceOnlyReg.test(cand)) {
    throw new RangeError('Candidate cannot be an empty string');
  }
  if (whitespaceOnlyReg.test(ref)) {
    throw new RangeError('Reference cannot be an empty string');
  }

  const {
    n: size = 1,
    beta = 1.0,
    caseSensitive = true,
    nGram = utils.nGram,
    tokenizer,
  } = opts ?? {};
  validateNGramSize(size);
  validateBeta(beta);

  const candTokens = tokenizeSummary(cand, caseSensitive, tokenizer);
  let candGrams: string[];
  let refGrams: string[];
  if (nGram === utils.nGram) {
    const candidateWork =
      candTokens.length < size ? 0 : validateNGramMaterialization(candTokens, size, 0, 0, '', true);
    const refTokens = tokenizeSummary(ref, caseSensitive, tokenizer);
    if (candTokens.length < size || refTokens.length < size) {
      return 0;
    }
    validateNGramScoringMaterialization(candidateWork, refTokens, size);
    candGrams = nGram(encodeTokens(candTokens), size);
    refGrams = nGram(encodeTokens(refTokens), size);
  } else {
    candGrams = [...nGram(candTokens, size)];
    refGrams = nGram(tokenizeSummary(ref, caseSensitive, tokenizer), size);
  }

  const matches = countMatchingGrams(candGrams, refGrams);

  if (matches === 0) {
    return 0;
  }

  const precision = matches / candGrams.length;
  const recall = matches / refGrams.length;

  return utils.fMeasure(precision, recall, beta);
}

/**
 * Computes the ROUGE-S score for a candidate summary.
 *
 * Configuration object schema and defaults:
 * ```
 * {
 * 	beta: 1.0                           // The beta value used for the f-measure
 * 	caseSensitive: true                 // Whether comparison is case-sensitive
 * 	maxSkip: Infinity                   // Maximum token index distance
 * 	skipBigram: <inbuilt function>,     // The skip-bigram generator function
 * 	tokenizer: <inbuilt function>       // The string tokenizer
 * }
 * ```
 *
 * `skipBigram` has a type signature of ((Array<string>, number) => Array<string>)
 * `tokenizer` has a type signature of ((string) => Array<string)
 *
 * @method s
 * @param  {string}     cand        The candidate summary to be evaluated
 * @param  {string}     ref         The reference summary to be evaluated against
 * @param  {Object}     opts        Configuration options (see example)
 * @return {number}                 The ROUGE-S score
 */
export function s(cand: string, ref: string, opts?: RougeSOptions): number {
  if (whitespaceOnlyReg.test(cand)) {
    throw new RangeError('Candidate cannot be an empty string');
  }
  if (whitespaceOnlyReg.test(ref)) {
    throw new RangeError('Reference cannot be an empty string');
  }

  const {
    beta = 1.0,
    caseSensitive = true,
    maxSkip = Number.POSITIVE_INFINITY,
    skipBigram = utils.skipBigram,
    tokenizer,
  } = opts ?? {};
  validateMaxSkip(maxSkip);
  validateBeta(beta);

  if (skipBigram !== utils.skipBigram) {
    const candGrams = [...skipBigram(tokenizeSummary(cand, caseSensitive, tokenizer), maxSkip)];
    const refGrams = skipBigram(tokenizeSummary(ref, caseSensitive, tokenizer), maxSkip);
    const skip2 = countMatchingGrams(candGrams, refGrams);
    if (skip2 === 0) {
      return 0;
    }
    return utils.fMeasure(skip2 / candGrams.length, skip2 / refGrams.length, beta);
  }

  const candTokens = tokenizeSummary(cand, caseSensitive, tokenizer);
  const refTokens = tokenizeSummary(ref, caseSensitive, tokenizer);
  if (candTokens.length < 2 || refTokens.length < 2) {
    return 0;
  }
  if (maxSkip === 0) {
    return 0;
  }
  if (
    candTokens.length === refTokens.length &&
    candTokens.every((token, index) => token === refTokens[index])
  ) {
    return 1;
  }

  const effectiveMaxSkip =
    maxSkip >= Math.max(candTokens.length, refTokens.length) - 1
      ? Number.POSITIVE_INFINITY
      : maxSkip;
  const skip2 = countMatchingSkipBigrams(candTokens, refTokens, effectiveMaxSkip);
  if (skip2 === 0) {
    return 0;
  }
  const skip2Recall = skip2 / skipBigramCount(refTokens.length, effectiveMaxSkip);
  const skip2Prec = skip2 / skipBigramCount(candTokens.length, effectiveMaxSkip);

  return utils.fMeasure(skip2Prec, skip2Recall, beta);
}

/**
 * Computes the ROUGE-L score for a candidate summary
 *
 * Configuration object schema and defaults:
 * ```
 * {
 * 	beta: 1.0                           // The beta value used for the f-measure
 * 	caseSensitive: true                 // Whether comparison is case-sensitive
 * 	lcs: <inbuilt function>             // The longest common subsequence function
 * 	lcsIndices: undefined                // A position-aware custom LCS function
 * 	segmenter: <inbuilt function>,      // The sentence segmenter
 * 	tokenizer: <inbuilt function>       // The string tokenizer
 * }
 * ```
 *
 * `lcs` has a type signature of ((Array<string>, Array<string>) => Array<string>)
 * `lcsIndices` has a type signature of ((Array<string>, Array<string>) => Array<number>)
 * `segmenter` has a type signature of ((string) => Array<string)
 * `tokenizer` has a type signature of ((string) => Array<string)
 *
 * @method l
 * @param  {string}     cand        The candidate summary to be evaluated
 * @param  {string}     ref         The reference summary to be evaluated against
 * @param  {Object}     opts        Configuration options (see example)
 * @return {number}                 The ROUGE-L score
 */
export function l(cand: string, ref: string, opts?: RougeLOptions): number {
  if (whitespaceOnlyReg.test(cand)) {
    throw new RangeError('Candidate cannot be an empty string');
  }
  if (whitespaceOnlyReg.test(ref)) {
    throw new RangeError('Reference cannot be an empty string');
  }

  const {
    beta = 1.0,
    caseSensitive = true,
    lcs: getLcs = utils.lcs,
    lcsIndices: getLcsIndices,
    segmenter = utils.sentenceSegment,
    tokenizer = utils.treeBankTokenize,
  } = opts ?? {};
  if (opts?.lcs !== undefined && getLcsIndices !== undefined) {
    throw new RangeError('ROUGE-L options cannot specify both lcs and lcsIndices');
  }
  validateBeta(beta);

  const candidate = prepareSummary(cand, caseSensitive, tokenizer, segmenter);
  const reference = prepareSummary(ref, caseSensitive, tokenizer, segmenter);
  const candLength = candidate.tokenCount;
  const refLength = reference.tokenCount;
  const remaining = new Map<string, number>();
  for (const sentence of candidate.sentences) {
    for (const token of sentence) {
      remaining.set(token, (remaining.get(token) ?? 0) + 1);
    }
  }

  if (candLength === 0 || refLength === 0) {
    return 0;
  }

  const matches = countSummaryLcsMatches(
    candidate.sentences,
    reference.sentences,
    remaining,
    getLcs,
    getLcsIndices,
  );
  if (matches === 0) {
    return 0;
  }
  return utils.fMeasure(matches / candLength, matches / refLength, beta);
}

function countSummaryLcsMatches(
  candidates: readonly (readonly string[])[],
  references: readonly (readonly string[])[],
  remaining: Map<string, number>,
  getLcs: (a: string[], b: string[]) => string[],
  getLcsIndices?: (candidate: string[], reference: string[]) => number[],
): number {
  let matches = 0;
  for (const reference of references) {
    if (getLcs === utils.lcs && getLcsIndices === undefined && remaining.size === 0) {
      break;
    }

    const union = new Set<number>();
    for (const candidate of candidates) {
      for (const index of matchedReferenceIndices(candidate, reference, getLcs, getLcsIndices)) {
        union.add(index);
      }
    }

    // Each reference position counts once, and candidate occurrences cannot be reused.
    for (const index of union) {
      const token = reference[index];
      const count = remaining.get(token) ?? 0;
      if (count > 0) {
        matches++;
        if (count === 1) {
          remaining.delete(token);
        } else {
          remaining.set(token, count - 1);
        }
      }
    }
  }
  return matches;
}

function matchedReferenceIndices(
  candidate: readonly string[],
  reference: readonly string[],
  getLcs: (a: string[], b: string[]) => string[],
  getLcsIndices?: (candidate: string[], reference: string[]) => number[],
): number[] {
  if (getLcsIndices !== undefined) {
    return validateCustomLcsIndices(
      candidate,
      reference,
      getLcsIndices([...candidate], [...reference]),
    );
  }
  if (getLcs === utils.lcs) {
    return builtInLcsIndices(candidate, reference);
  }

  // Preserve the value-only callback's legacy best-effort alignment.
  const indices: number[] = [];
  let next = 0;
  for (const token of getLcs([...candidate], [...reference])) {
    const index = reference.indexOf(token, next);
    if (index !== -1) {
      indices.push(index);
      next = index + 1;
    }
  }
  return indices;
}

function validateCustomLcsIndices(
  candidate: readonly string[],
  reference: readonly string[],
  result: number[],
): number[] {
  if (!Array.isArray(result)) {
    throw new RangeError('Custom lcsIndices must return an array of reference token indices');
  }

  let previous = -1;
  let nextCandidate = 0;
  for (const index of result) {
    if (!Number.isInteger(index) || index < 0 || index >= reference.length || index <= previous) {
      throw new RangeError(
        'Custom lcsIndices must return strictly increasing integer indices within the reference',
      );
    }
    const candidateIndex = candidate.indexOf(reference[index], nextCandidate);
    if (candidateIndex === -1) {
      throw new RangeError(
        'Custom lcsIndices must select reference tokens that form a subsequence of the candidate',
      );
    }
    previous = index;
    nextCandidate = candidateIndex + 1;
  }
  return result;
}
