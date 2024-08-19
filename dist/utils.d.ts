/**
 * Splits a sentence into an array of word tokens
 * in accordance with the Penn Treebank guidelines.
 *
 * NOTE: This method assumes that the input is a single
 * sentence only. Providing multiple sentences within a
 * single string can trigger edge cases which have not
 * been accounted for.
 *
 * Adapted from Titus Wormer's port of the Penn Treebank Tokenizer
 * found at https://gist.github.com/wooorm/8504606
 *
 *
 * @method treeBankTokenize
 * @param  {string}           input     The sentence to be tokenized
 * @return {Array<string>}              An array of word tokens
 */
export declare function treeBankTokenize(input: string): string[];
/**
 * Splits a body of text into an array of sentences
 * using a rule-based segmentation approach.
 *
 * Adapted from Spencer Mountain's nlp_compromise library
 * found at https://github.com/spencermountain/nlp_compromise/
 *
 * @method sentenceSegment
 * @param  {string}         input     The document to be segmented
 * @return {Array<string>}            An array of sentences
 */
export declare function sentenceSegment(input: string): string[];
/**
 * Checks if a string is titlecase
 * @method strIsTitleCase
 * @param  {string}   input       The string to be checked
 * @return {boolean}              True if the string is titlecase and false otherwise
 */
export declare function strIsTitleCase(input: string): boolean;
/**
 * Checks if a character is uppercase
 * @method charIsUpperCase
 * @param  {string}   input     The character to be tested
 * @return {boolean}            True if the character is uppercase and false otherwise.
 */
export declare function charIsUpperCase(input: string): boolean;
export declare const fact: (arg: number) => number;
/**
 * Returns the skip bigrams for an array of word tokens.
 *
 * @method skipBigram
 * @param  {Array<string>}    tokens      An array of word tokens
 * @return {Array<string>}                An array of skip bigram strings
 */
export declare function skipBigram(tokens: string[]): string[];
interface NGramOptions {
    start: boolean;
    end: boolean;
    val: string;
}
export declare const NGRAM_DEFAULT_OPTS: NGramOptions;
/**
 * Returns n-grams for an array of word tokens.
 *
 * @method nGram
 * @param  {Array<string>}          tokens    An array of word tokens
 * @param  {number}                 n         The size of the n-gram. Defaults to 2.
 * @param  {Object}                 pad       String padding options. See example.
 * @return {Array<string>}                    An array of n-gram strings
 */
export declare function nGram(tokens: string[], n?: number, pad?: Partial<NGramOptions>): string[];
/**
 * Calculates C(val, 2), i.e. the number of ways 2
 * items can be chosen from `val` items.
 *
 * @method comb2
 * @param  {number} val     The total number of items to choose from
 * @return {number}         The number of ways in which 2 items can be chosen from `val`
 */
export declare function comb2(val: number): number;
/**
 * Computes the arithmetic mean of an array
 * @method arithmeticMean
 * @param  {Array<number>}   input    Data distribution
 * @return {number}                   The mean of the distribution
 */
export declare function arithmeticMean(input: number[]): number;
/**
 * Evaluates the jackknife resampling result for a set of
 * candidate summaries vs. a reference summary.
 *
 * @method jackKnife
 * @param  {Array<string>}  cands      An array of candidate summaries to be evaluated
 * @param  {string}         ref        The reference summary to be evaluated against
 * @param  {Function}       func       The function used to evaluate a candidate against a reference.
 *                                     Should be of the type signature (string, string) => number
 * @param  {Function}       test       The function used to compute the test statistic.
 *                                     Defaults to the arithmetic mean.
 *                                     Should be of the type signature (Array<number>) => number
 * @return {number}                    The result computed by applying `test` to the resampled data
 */
export declare function jackKnife(cands: string[], ref: string, func: (x: string, y: string) => number, test?: (x: number[]) => number): number;
/**
 * Calculates the ROUGE f-measure for a given precision
 * and recall score.
 *
 * DUC evaluation favors precision by setting beta to an
 * arbitrary large number. To replicate this, set beta to
 * any value larger than 1.
 *
 * @method fMeasure
 * @param  {number}     p       Precision score
 * @param  {number}     r       Recall score
 * @param  {number}     beta    Weighing value (precision vs. recall).
 *                              Defaults to 0.5, i.e. mean f-score
 * @return {number}             Computed f-score
 */
export declare function fMeasure(p: number, r: number, beta?: number): number;
/**
 * Computes the set intersection of two arrays
 *
 * @method intersection
 * @template T
 * @param  {Array<T>}    a     The first array
 * @param  {Array<T>}    b     The second array
 * @return {Array<T>}          Elements common to both the first and second array
 */
export declare function intersection<T>(a: T[], b: T[]): T[];
/**
 * Computes the longest common subsequence for two arrays.
 * This function returns the elements from the two arrays
 * that form the LCS, in order of their appearance.
 *
 * For speed, the search-space is pruned by eliminating
 * common entities at the start and end of both input arrays.
 *
 * @method lcs
 * @param  {Array<string>}    a     The first array
 * @param  {Array<string>}    b     The second array
 * @return {Array<string>}          The longest common subsequence between the first and second array
 */
export declare function lcs(a: string[], b: string[]): string[];
export {};
//# sourceMappingURL=utils.d.ts.map