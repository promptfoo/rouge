import * as utils from './utils';
export * from './utils';

/**
 * Computes the ROUGE-N score for a candidate summary.
 *
 * Configuration object schema and defaults:
 * ```
 * {
 * 	n: 1                            // The size of the ngram used
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
 * @return {number}                 The ROUGE-N score
 */
export function n(
  cand: string,
  ref: string,
  opts: {
    n?: number;
    nGram?: (tokens: string[], n: number) => string[];
    tokenizer?: (input: string) => string[];
  }
): number {
  if (cand.length === 0) throw new RangeError('Candidate cannot be an empty string');
  if (ref.length === 0) throw new RangeError('Reference cannot be an empty string');

  // Merge user-provided configuration with defaults
  const options = Object.assign(
    {
      n: 1,
      nGram: utils.nGram,
      tokenizer: utils.treeBankTokenize,
    },
    opts
  );

  const candGrams = options.nGram(options.tokenizer(cand), options.n);
  const refGrams = options.nGram(options.tokenizer(ref), options.n);

  const match = utils.intersection(candGrams, refGrams);
  return match.length / refGrams.length;
}

/**
 * Computes the ROUGE-S score for a candidate summary.
 *
 * Configuration object schema and defaults:
 * ```
 * {
 * 	beta: 1                             // The beta value used for the f-measure
 * 	gapLength: 2                        // The skip window
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
export function s(
  cand: string,
  ref: string,
  opts: {
    beta?: number;
    skipBigram?: (tokens: string[]) => string[];
    tokenizer?: (input: string) => string[];
  }
): number {
  if (cand.length === 0) throw new RangeError('Candidate cannot be an empty string');
  if (ref.length === 0) throw new RangeError('Reference cannot be an empty string');

  // Merge user-provided configuration with defaults
  const options = Object.assign(
    {
      beta: 0.5,
      skipBigram: utils.skipBigram,
      tokenizer: utils.treeBankTokenize,
    },
    opts
  );

  const candGrams = options.skipBigram(options.tokenizer(cand));
  const refGrams = options.skipBigram(options.tokenizer(ref));

  const skip2 = utils.intersection(candGrams, refGrams).length;

  if (skip2 === 0) {
    return 0;
  } else {
    const skip2Recall = skip2 / refGrams.length;
    const skip2Prec = skip2 / candGrams.length;

    return utils.fMeasure(skip2Prec, skip2Recall, options.beta);
  }
}

/**
 * Computes the ROUGE-L score for a candidate summary
 *
 * Configuration object schema and defaults:
 * ```
 * {
 * 	beta: 1                             // The beta value used for the f-measure
 * 	lcs: <inbuilt function>             // The least common subsequence function
 * 	segmenter: <inbuilt function>,      // The sentence segmenter
 * 	tokenizer: <inbuilt function>       // The string tokenizer
 * }
 * ```
 *
 * `lcs` has a type signature of ((Array<string>, Array<string>) => Array<string>)
 * `segmenter` has a type signature of ((string) => Array<string)
 * `tokenizer` has a type signature of ((string) => Array<string)
 *
 * @method l
 * @param  {string}     cand        The candidate summary to be evaluated
 * @param  {string}     ref         The reference summary to be evaluated against
 * @param  {Object}     opts        Configuration options (see example)
 * @return {number}                 The ROUGE-L score
 */
export function l(
  cand: string,
  ref: string,
  opts: {
    beta?: number;
    lcs?: (a: string[], b: string[]) => string[];
    segmenter?: (input: string) => string[];
    tokenizer?: (input: string) => string[];
  }
): number {
  if (cand.length === 0) throw new RangeError('Candidate cannot be an empty string');
  if (ref.length === 0) throw new RangeError('Reference cannot be an empty string');

  // Merge user-provided configuration with defaults
  const options = Object.assign(
    {
      beta: 0.5,
      lcs: utils.lcs,
      segmenter: utils.sentenceSegment,
      tokenizer: utils.treeBankTokenize,
    },
    opts
  );

  const candSents = options.segmenter(cand);
  const refSents = options.segmenter(ref);

  const candWords = options.tokenizer(cand);
  const refWords = options.tokenizer(ref);

  const lcsAcc = refSents.map((r) => {
    const rTokens = options.tokenizer(r);
    const lcsUnion = new Set(...candSents.map((c) => options.lcs(options.tokenizer(c), rTokens)));

    return lcsUnion.size;
  });

  // Sum the array as quickly as we can
  let lcsSum = 0;
  while (lcsAcc.length) lcsSum += lcsAcc.pop() || 0;

  const lcsRecall = lcsSum / candWords.length;
  const lcsPrec = lcsSum / refWords.length;

  return utils.fMeasure(lcsPrec, lcsRecall, options.beta);
}
