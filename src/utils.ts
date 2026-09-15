import { GATE_EXCEPTIONS, GATE_SUBSTITUTIONS, TREEBANK_CONTRACTIONS } from './constants';
import { lcsIndices } from './lcs';
import {
  validateBeta,
  validateMaxSkip,
  validateNGramMaterialization,
  validateNGramSize,
} from './validation';

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
export function treeBankTokenize(input: string): string[] {
  // Contraction rules below expect spaces, including at word boundaries.
  const text = input.replace(/[\s\u0085]+/g, ' ').trim();
  if (text.length === 0) {
    return [];
  }

  // Classify paired quotes before inserting spaces around punctuation.
  let insideQuotes = false;
  let parse = text.replace(/``|''|"/g, (quote: string, index: number): string => {
    insideQuotes =
      quote === '``' ||
      ((index + quote.length < text.length ||
        index === 0 ||
        /[\s\p{Ps}<]/u.test(text[index - 1])) &&
        opensDoubleQuote(text, index, insideQuotes) &&
        !/[.!?]/.test(text[index - 1] ?? '') &&
        (quote === '"' ||
          (index > 0 &&
            /^[\p{Letter}\p{Number}\p{Sc}\p{Ps}]$/u.test(characterAt(text, index + 2)) &&
            text.slice(index + 2).match(/``|''|"/)?.[0] === "''")));
    return insideQuotes ? ' `` ' : " '' ";
  });

  // Preserve numeric separators and acronym dots, even at a heuristic sentence boundary.
  parse = parse
    .replace(/\.{3}/g, ' ... ')
    .replace(/[:,](?!\p{Decimal_Number})/gu, ' $& ')
    .replace(/[;@#$%&]/g, ' $& ')
    .replace(/([^.])(?<!\b[A-Za-z]\.[A-Za-z])(\.)([\])}>'\s]*)$/g, '$1 $2$3 ')
    .replace(/[?!]/g, ' $& ')
    .replace(/[\][(){}<>]/g, ' $& ')
    .replace(/--/g, ' -- ');

  // Wrap spaces at the start and end of the sentence for consistency
  // i.e. reduce the number of Regex matches required
  parse = ` ${parse} `;

  // Split possessive/closing apostrophes and common contractions.
  parse = parse
    .replace(/([^'])' /g, "$1 ' ")
    .replace(/'([sSmMdD]) /g, " '$1 ")
    .replace(/('ll|'LL|'re|'RE|'ve|'VE|n't|N'T) /g, ' $1 ');

  for (const contraction of TREEBANK_CONTRACTIONS) {
    // Break uncommon contractions with a space and wrap-in spaces
    parse = parse.replace(contraction, ' $1 $2 ');
  }

  // Concatenate double spaces and remove start/end spaces
  parse = parse.replace(/ {2,}/g, ' ').replace(/^ | $/g, '');

  // Split on spaces (original and inserted) to return the tokenized result
  return parse.split(' ');
}

function opensDoubleQuote(input: string, index: number, insideQuotes: boolean): boolean {
  return !insideQuotes && quoteOpeningContext(input, index);
}

function quoteOpeningContext(input: string, index: number): boolean {
  return (
    index === 0 ||
    /[\s\p{Punctuation}<]/u.test(input[index - 1]) ||
    input.slice(index - 2, index) === '``'
  );
}

function isQuoteOpeningContent(character: string): boolean {
  return /^[\p{Letter}\p{Mark}\p{Number}\p{Symbol}\p{Ps}'‘“„«‹`]$/u.test(character);
}

function remainsInsideQuotation(
  input: string,
  start: number,
  end: number,
  closingQuotes: string,
  pairs: Int32Array,
): boolean {
  let pending = closingQuotes;
  for (let index = start + 1; index < end && pending.length > 0; index++) {
    const closing = pairedClosingQuote(input, index, pairs);
    if (closing !== undefined) {
      pending = pending.replace(closing, '');
    }
  }
  return pending.length > 0;
}

function pairedClosingQuote(input: string, index: number, pairs: Int32Array): string | undefined {
  return pairs[index] < 0 ? quotationClosers[quotationKind(input, -pairs[index] - 1)] : undefined;
}

function singleQuotationState(input: string, index: number, insideQuotes: boolean): boolean {
  const previous = input[index - 1] ?? '';
  const following = characterAt(input, index + 1);
  if (insideQuotes) {
    if (/[.!?]/.test(previous) && !/^'(?:s|m|d|ll|re|ve)\b/i.test(input.slice(index, index + 4))) {
      return false;
    }
    if (/^\p{Number}$/u.test(following)) {
      return numericQuoteIsElision(input, index);
    }
    return following.length > 0 && !/[\s.,!?;:)\]}"”»›\p{Pd}]/u.test(following);
  }
  return (
    quoteOpeningContext(input, index) &&
    !(/[.!?]/.test(previous) && /^'(?:s|m|d|ll|re|ve)\b/i.test(input.slice(index, index + 4))) &&
    /\S/.test(following)
  );
}

const leadingElisionReg =
  /^(?:t(?:is|was|were|will|would|il|ill)|em|cause|cos|round|bout|neath|fore|tween|gainst|cept|(?:twen|thir|for|fif|six|seven|eigh|nine)ties|\d{2}s?)\b/i;

function isPairedNElision(input: string, index: number): boolean {
  return (
    /^(['’])n\1$/i.test(input.slice(index, index + 3)) ||
    /^(['’])n\1$/i.test(input.slice(Math.max(0, index - 2), index + 1))
  );
}

function isLeadingElision(input: string, index: number | undefined): boolean {
  return index !== undefined && leadingElisionReg.test(input.slice(index + 1, index + 12));
}

function previousNonClosingIndex(input: string, index: number): number {
  let previous = index - 1;
  // Stop at another single quote so adjacent candidates never rescan the same span.
  while (previous >= 0 && /[\s\])}>"”»›]/.test(input[previous])) {
    previous--;
  }
  return previous;
}

/**
 * Classify elisions and possessives once. Ambiguous s-ending quotes need a later
 * unambiguous closer; guessing the last candidate can join unrelated sentences.
 */
function singleQuoteApostrophes(input: string): Uint8Array {
  // Separate bits retain overlapping curly-possessive and straight-elision classifications.
  const apostrophes = new Uint8Array(input.length);
  markCurlyApostrophes(input, apostrophes);
  markUnpairedElisions(input, apostrophes);
  markStraightPossessives(input, apostrophes);
  return apostrophes;
}

function numericQuoteIsElision(input: string, index: number): boolean {
  if (!/^\p{Number}$/u.test(characterAt(input, index + 1))) {
    return false;
  }
  const previous = previousNonClosingIndex(input, index);
  return (
    !/[.!?]/.test(input[previous] ?? '') &&
    (/\s/.test(input[index - 1] ?? '') ||
      !/[\p{Letter}\p{Mark}\p{Number}]$/u.test(
        input.slice(Math.max(0, previous - 1), previous + 1),
      ))
  );
}

function rightCurlyIsApostrophe(input: string, index: number): boolean {
  const following = characterAt(input, index + 1);
  const previous = previousNonClosingIndex(input, index);
  const afterTerminal = /[.!?]/.test(input[previous] ?? '');
  return (
    (/^[\p{Letter}\p{Mark}]$/u.test(following) &&
      (!afterTerminal || /^’(?:s|m|d|ll|re|ve)\b/i.test(input.slice(index, index + 4)))) ||
    numericQuoteIsElision(input, index) ||
    input.slice(index - 2, index).toLowerCase() === '’n'
  );
}

function isPossessiveCandidate(input: string, index: number): boolean {
  return (
    /s/iu.test(input[index - 1] ?? '') &&
    /^\s+[\p{Letter}\p{Mark}\p{Number}]/u.test(input.slice(index + 1))
  );
}

function markCurlyApostrophes(input: string, apostrophes: Uint8Array): void {
  let candidateStart: number | undefined;
  let opening: number | undefined;
  for (const quote of input.matchAll(/[‘’]/g)) {
    const index = quote.index;
    const following = characterAt(input, index + 1);
    if (quote[0] === '‘') {
      // A left mark opens a span only after a compatible right mark pairs with it.
      apostrophes[index] = 1;
      const wordInternal =
        /[\p{Letter}\p{Mark}\p{Number}]$/u.test(input.slice(Math.max(0, index - 2), index)) &&
        /^[\p{Letter}\p{Mark}\p{Number}]$/u.test(following);
      const openingIsElision = isLeadingElision(input, opening);
      const leadingElision =
        !openingIsElision &&
        (opening !== undefined || candidateStart !== undefined) &&
        (isLeadingElision(input, index) || /^\p{Number}$/u.test(following));
      if (!(wordInternal || leadingElision)) {
        opening = index;
        candidateStart = undefined;
      }
      continue;
    }

    if (rightCurlyIsApostrophe(input, index)) {
      apostrophes[index] = 1;
      continue;
    }
    if (isLeadingElision(input, opening) && isPossessiveCandidate(input, index)) {
      candidateStart ??= index;
      continue;
    }

    if (opening !== undefined) {
      apostrophes[opening] = 0;
      opening = undefined;
    }
    if (
      /(?:s|\p{Number}|\p{Letter}\.\p{Letter}\.)$/iu.test(
        input.slice(Math.max(0, index - 8), index),
      )
    ) {
      candidateStart ??= index;
    } else if (candidateStart !== undefined) {
      apostrophes.fill(1, candidateStart, index);
      candidateStart = undefined;
    }
  }
}

function markUnpairedElisions(input: string, apostrophes: Uint8Array): void {
  let insideStraight = false;
  let elisionOpening: number | undefined;
  for (const quote of input.matchAll(/'/g)) {
    const index = quote.index;
    if (isPairedNElision(input, index)) {
      apostrophes[index] |= 2;
      continue;
    }
    const elision = isLeadingElision(input, index);
    if (
      elisionOpening !== undefined &&
      !/[.!?]/.test(input[index - 1] ?? '') &&
      opensDoubleQuote(input, index, false) &&
      isQuoteOpeningContent(characterAt(input, index + 1))
    ) {
      elisionOpening = undefined;
      insideStraight = false;
    }
    if (elisionOpening !== undefined && isPossessiveCandidate(input, index)) {
      continue;
    }
    const nextState = singleQuotationState(input, index, insideStraight);
    if (nextState && !insideStraight && elision) {
      elisionOpening = index;
      apostrophes[index] |= 2;
    } else if (!nextState && insideStraight && elisionOpening !== undefined) {
      apostrophes[elisionOpening] &= ~2;
      elisionOpening = undefined;
    }
    insideStraight = nextState;
  }
}

function markStraightPossessives(input: string, apostrophes: Uint8Array): void {
  let opening: number | undefined;
  let candidate: number | undefined;
  for (const quote of input.matchAll(/'/g)) {
    const index = quote.index;
    if (isPairedNElision(input, index)) {
      continue;
    }
    const following = characterAt(input, index + 1);
    if (
      opening !== undefined &&
      (isLeadingElision(input, index) || numericQuoteIsElision(input, index))
    ) {
      continue;
    }
    if (
      opensDoubleQuote(input, index, false) &&
      (opening === undefined || !/[.!?]/.test(input[index - 1] ?? '')) &&
      isQuoteOpeningContent(following)
    ) {
      opening = index;
      candidate = undefined;
      continue;
    }
    if (opening === undefined || /^[\p{Letter}\p{Mark}]$/u.test(following)) {
      continue;
    }
    if (
      !/^\p{Number}$/u.test(following) &&
      /(?:s|\p{Number})$/iu.test(input.slice(Math.max(0, index - 2), index))
    ) {
      candidate ??= index;
      continue;
    }
    if (candidate !== undefined) {
      // A later closer confirms interior possessives and measurements in this span.
      // A new opening resets the candidate, so confirmed ranges never overlap.
      for (let position = candidate; position < index; position++) {
        apostrophes[position] |= 2;
      }
    }
    opening = undefined;
    candidate = undefined;
  }
}

interface QuotationState {
  straightDouble: boolean;
  curlyDouble: boolean;
  germanDouble: boolean;
  curlySingle: boolean;
  straightSingle: boolean;
  guillemetDouble: boolean;
  guillemetSingle: boolean;
}

interface QuotationSource extends QuotationState {
  input: string;
  index: number;
  pairs: Int32Array;
}

type QuotationKind = keyof QuotationState;
const quotationClosers: Record<QuotationKind, string> = {
  straightDouble: '"',
  straightSingle: "'",
  curlyDouble: '”',
  germanDouble: '“',
  curlySingle: '’',
  guillemetDouble: '»',
  guillemetSingle: '›',
};

/** Pair quote tokens once; negative entries point back to their matching opener. */
function quotationPairs(input: string, apostrophes: Uint8Array): Int32Array {
  const pairing = new QuotationPairing(input, apostrophes);
  for (const quote of input.matchAll(/["'`“”„‘’«»‹›]/g)) {
    pairing.add(quote.index);
  }
  return pairing.pairs;
}

class QuotationPairing {
  readonly pairs: Int32Array;
  readonly #input: string;
  readonly #apostrophes: Uint8Array;
  readonly #openings = {
    straightDouble: -1,
    straightSingle: -1,
    guillemetDouble: -1,
    guillemetSingle: -1,
    curlyDouble: -1,
    germanDouble: -1,
    curlySingle: -1,
  };
  #skipThrough = -1;
  #nextEnglishClose = -1;
  #nextCurlyBoundary = -1;
  #nextTreebankClose = -1;
  #contextCursor = 0;
  #precedingContent = '';
  #precedingPairedQuote = false;

  constructor(input: string, apostrophes: Uint8Array) {
    this.#input = input;
    this.#apostrophes = apostrophes;
    this.pairs = new Int32Array(input.length);
  }

  add(index: number): void {
    if (index <= this.#skipThrough || this.#treebank(index)) {
      return;
    }
    const character = this.#input[index];
    if (character === '"') {
      if (this.#openings.straightDouble >= 0 && this.#quotationRecovery(index) !== 'open') {
        this.#close('straightDouble', index);
      } else if (opensDoubleQuote(this.#input, index, false)) {
        this.#openings.straightDouble = index;
      }
    } else if (character === '“') {
      this.#curlyOpening(index);
    } else if (character === '”') {
      this.#close('curlyDouble', index);
    } else if (character === '„') {
      this.#openings.germanDouble = index;
    } else if (character === '«' || character === '‹') {
      this.#openings[character === '«' ? 'guillemetDouble' : 'guillemetSingle'] = index;
    } else if (character === '»' || character === '›') {
      this.#close(character === '»' ? 'guillemetDouble' : 'guillemetSingle', index);
    } else if (/['‘’]/.test(character)) {
      this.#single(index, character);
    }
  }

  #single(index: number, character: string): void {
    const kind = character === "'" ? 'straightSingle' : 'curlySingle';
    const inside = this.#openings[kind] >= 0;
    const next = singleQuoteState(this.#input, index, inside, this.#apostrophes);
    const recovery =
      next && inside && kind === 'straightSingle' ? this.#singleRecovery(index) : undefined;
    if (next && (!inside || recovery === 'open')) {
      this.#openings[kind] = index;
    } else if (inside && (!next || recovery === 'close')) {
      this.#close(kind, index);
    }
  }

  #singleRecovery(index: number): 'open' | 'close' | undefined {
    if (
      (this.#apostrophes[index] & 2) !== 0 ||
      isLeadingElision(this.#input, index) ||
      numericQuoteIsElision(this.#input, index)
    ) {
      return undefined;
    }
    return this.#quotationRecovery(index);
  }

  #quotationRecovery(index: number): 'open' | 'close' | undefined {
    if (
      !(
        opensDoubleQuote(this.#input, index, false) &&
        isQuoteOpeningContent(characterAt(this.#input, index + 1))
      )
    ) {
      return undefined;
    }
    // Reuse significant left context even across long runs of nested/spaced closers.
    while (this.#contextCursor < index) {
      const position = this.#contextCursor++;
      const character = this.#input[position];
      if (this.pairs[position] < 0) {
        this.#precedingPairedQuote = true;
      } else if (!/[\s"'”’“»›\])}>]/.test(character)) {
        this.#precedingContent = character;
        this.#precedingPairedQuote = false;
      }
    }
    if (this.#precedingPairedQuote) {
      return 'close';
    }
    return /[.!?]/.test(this.#precedingContent) ? undefined : 'open';
  }

  #close(kind: QuotationKind, index: number): void {
    const opening = this.#openings[kind];
    if (opening >= 0) {
      this.pairs[opening] = index + 1;
      this.pairs[index] = -(opening + 1);
      this.#openings[kind] = -1;
    }
  }

  #treebank(index: number): boolean {
    if (this.#input.startsWith('``', index)) {
      this.#openings.straightDouble = index;
      this.#skipThrough = index + 1;
      return true;
    }
    if (
      !this.#input.startsWith("''", index) ||
      (this.#openings.straightSingle >= 0 &&
        this.#openings.straightSingle > this.#openings.straightDouble)
    ) {
      return false;
    }
    if (this.#openings.straightDouble >= 0) {
      this.#close('straightDouble', index);
      this.#skipThrough = index + 1;
      return true;
    }
    this.#nextTreebankClose = this.#nextQuote(this.#nextTreebankClose, "''", index + 1);
    if (
      opensDoubleQuote(this.#input, index, false) &&
      /^[\p{Letter}\p{Number}\p{Sc}\p{Ps}]$/u.test(characterAt(this.#input, index + 2)) &&
      this.#nextTreebankClose < this.#input.length
    ) {
      this.#openings.straightDouble = index;
      this.#skipThrough = index + 1;
    }
    return true;
  }

  #curlyOpening(index: number): void {
    this.#nextEnglishClose = this.#nextQuote(this.#nextEnglishClose, '”', index);
    this.#nextCurlyBoundary = this.#nextQuote(this.#nextCurlyBoundary, '“', index);
    // A nearer English closer identifies an English inner span inside German quotes.
    if (
      this.#openings.germanDouble >= 0 &&
      (this.#openings.curlyDouble >= 0 || this.#nextEnglishClose >= this.#nextCurlyBoundary)
    ) {
      this.#close('germanDouble', index);
    } else {
      this.#openings.curlyDouble = index;
    }
  }

  #nextQuote(previous: number, quote: string, index: number): number {
    if (previous > index) {
      return previous;
    }
    const next = this.#input.indexOf(quote, index + 1);
    return next < 0 ? this.#input.length : next;
  }
}

function trackQuotations(
  input: string,
  index: number,
  state: QuotationState,
  pairs: Int32Array,
): void {
  const endpoint = pairs[index];
  if (endpoint === 0) {
    return;
  }
  const opening = endpoint > 0 ? index : -endpoint - 1;
  state[quotationKind(input, opening)] = endpoint > 0;
}

function quotationKind(input: string, opening: number): QuotationKind {
  const character = input[opening];
  if (character === '„') {
    return 'germanDouble';
  }
  if (character === '“') {
    return 'curlyDouble';
  }
  if (character === '‘') {
    return 'curlySingle';
  }
  if (character === '«') {
    return 'guillemetDouble';
  }
  if (character === '‹') {
    return 'guillemetSingle';
  }
  return character === "'" && !input.startsWith("''", opening)
    ? 'straightSingle'
    : 'straightDouble';
}

function closingQuotationMarks(state: QuotationState): string {
  return (
    (state.straightDouble ? '"' : '') +
    (state.straightSingle ? "'" : '') +
    (state.curlyDouble ? '”' : '') +
    (state.germanDouble ? '“' : '') +
    (state.curlySingle ? '’' : '') +
    (state.guillemetDouble ? '»' : '') +
    (state.guillemetSingle ? '›' : '')
  );
}

function singleQuoteState(
  input: string,
  index: number,
  inside: boolean,
  apostrophes: Uint8Array,
): boolean {
  const character = input[index];
  if (character === "'") {
    return (apostrophes[index] & 2) === 0 ? singleQuotationState(input, index, inside) : inside;
  }
  if ((apostrophes[index] & 1) !== 0) {
    return inside;
  }
  return character === '‘';
}

/** Preserve the existing Treebank alias grammar for list and angle ownership. */
function isTreebankQuoteOpening(input: string, index: number): boolean {
  return (
    (index === 0 || /[\s([{<]/.test(input[index - 1])) &&
    /^[\p{Letter}\p{Number}\p{Sc}\p{Ps}]$/u.test(characterAt(input, index + 2)) &&
    input.slice(index + 2).includes("''")
  );
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const abbrvReg = new RegExp(
  `\\b(?!v\\.?s[!?] ?$)(${GATE_SUBSTITUTIONS.map(escapeRegExp).join('|')})[.!?] ?$`,
  'i',
);
const acronymReg = /[ |.][A-Z].?$/i;
// Case mappings can add combining marks (for example, `İ` lowercases to `i` + dot above).
const caseNeutralAcronymReg = /(?:^|[ |.])\p{Cased}\p{M}*.?$/u;
const casedCharacterReg = /^\p{Cased}$/u;
const upperOrTitleCaseLetterReg = /^[\p{Lu}\p{Lt}]$/u;
const upperCaseReg = /^\p{Uppercase}$/u;
// Recognize unambiguous page-reference forms: p. 10, p. (10), and p. #10.
const pageNumberContinuationReg =
  /^\s*(?:\(\s*\p{Number}+\s*\)|#\s*\p{Number}+|\p{Number}+)(?=\s|[.,;:!?)]|$)/u;
const breakReg = /[\r\n]+/;
// Match a bounded ellipsis suffix to avoid excessive backtracking.
const ellipseReg = /\.{2,10}$/;
const excepReg = new RegExp(`\\b(${GATE_EXCEPTIONS.map(escapeRegExp).join('|')})[.!?] ?$`, 'i');
const sentenceSuffixLength = Math.max(10, ...GATE_SUBSTITUTIONS.map((word) => word.length + 2));
const closingDelimiterReg = /[\])}>"'”»›]/;
const openingBracketReg = /[([{<]/;
const closingBracketReg = /[\])}>]/;
const listMarkerReg =
  /(?:^|\s)(?:(?:[•⁃][^\S\r\n]*|[-*+][^\S\r\n]+)?\d+|\p{Cased}\p{M}*)(?:\.\)|[.)])(?=\s+\S)/gu;
const yearListMarkerReg = /^(?:1\d{3}|20\d{2})\.$/;
const nameWordPattern = String.raw`\p{Letter}[\p{Letter}\p{Mark}]*(?:['’\p{Pd}]\p{Letter}[\p{Letter}\p{Mark}]*)*`;
const firstAuthorNameReg = new RegExp(
  String.raw`^\s+${nameWordPattern}(?:\s+(?:and|or|&)|[,;])\s+\p{Cased}\p{M}*\.\s+\p{Letter}`,
  'iu',
);
const laterAuthorInitialReg = new RegExp(
  String.raw`:\s+\p{Cased}\p{M}*\.(?:\s+${nameWordPattern}(?:\s+(?:and|or|&)|[,;])\s+\p{Cased}\p{M}*\.)+$`,
  'iu',
);
const nestedListDepth = Symbol('nestedListDepth');
const skipListDetection = Symbol('skipListDetection');
const singleQuoteElisionReg =
  /^(?:t(?:is|was|were|will|would|il|ill)|em|cause|cos|round|bout|neath|fore|tween|gainst|cept|(?:twen|thir|for|fif|six|seven|eigh|nine)ties)\b/i;
const maxNestedListDepth = 32;
const geographicAcronymReg = /\bU\.S(?:\.A)?\.$/i;
const geographicContinuationReg =
  /^(?:government|army|navy|military|congress|senate|commission)\b/i;
const unspacedGeographicContinuationReg = /^(?:government|army|navy|military|congress)\b/i;
const sentenceContinuationReg =
  /^(?:and|or|but|nor|for|yet|so|at|in|on|of|to|from|with|by|as|then|because|while|after|before|although|though|since|unless|until|when|where|whether|if|once|whereas)\b/i;
const independentSentenceReg =
  /^(?:in\s+(?:fact|time)\b|\p{Letter}+\s+[^,.!?]{1,120},|(?:and|but|or|yet|so|then)\s+(?:(?:i|we|he|she|they|you|it)\b|(?:(?:the|a|an|my|our|their|his|her)\s+)?(?!(?:more|later|moved)\b)[\p{Letter}\p{Mark}'’-]+\s+[\p{Letter}\p{Mark}'’-]+\b))/iu;

function isAbbreviationException(
  suffix: string,
  following: string,
  endsDelimitedSentence = false,
): boolean {
  const continuation = following.trimStart();
  return (
    excepReg.test(suffix) &&
    !(
      /\bv\.?s\.$/i.test(suffix) &&
      (endsDelimitedSentence ||
        /\b(?:am|is|are|was|were|be|been|being)\s+v\.?s\.$/i.test(suffix) ||
        isStandalonePronounContinuation(continuation))
    )
  );
}

function isStandalonePronounContinuation(input: string): boolean {
  // Retain the existing ASCII /i matching; Unicode /iu would also match long-s in ſhe.
  const pronoun = input.match(/^(?:this|that|these|those|it|we|they|he|she|i)/i)?.[0];
  return (
    pronoun !== undefined &&
    !/^[\p{ID_Continue}\p{Pd}\u200c\u200d]$/u.test(characterAt(input, pronoun.length))
  );
}

/** Keep merged fragments separate; boundary rules only need a suffix and word casing. */
class SentenceBuffer {
  readonly #caseNeutral: boolean;
  readonly #quoteSource: QuotationSource;
  #parts: string[] = [];
  #normalizedThrough = 0;
  #words: { titleCase: boolean; lowerCase: boolean }[] = [];
  #openingDelimiters: string[] = [];
  hasLineBreaks = false;
  startsWithTitleCase = false;

  constructor(text: string, caseNeutral: boolean, quoteSource: QuotationSource) {
    this.#caseNeutral = caseNeutral;
    this.#quoteSource = quoteSource;
    this.append(trimSpaces(text));
  }

  get empty(): boolean {
    return this.#words.length === 0;
  }

  get lastWordIsLowerCase(): boolean {
    return this.#words.at(-1)?.lowerCase ?? true;
  }

  get previousWordIsTitleCase(): boolean {
    return this.#words.at(-2)?.titleCase ?? false;
  }

  get hasOpenDelimiter(): boolean {
    return this.#openingDelimiters.length > 0 || this.#insideQuotation;
  }

  get #insideQuotation(): boolean {
    return (
      this.#quoteSource.straightDouble ||
      this.#quoteSource.curlyDouble ||
      this.#quoteSource.germanDouble ||
      this.#quoteSource.curlySingle ||
      this.#quoteSource.straightSingle ||
      this.#quoteSource.guillemetDouble ||
      this.#quoteSource.guillemetSingle
    );
  }

  get suffix(): string {
    let suffix = '';
    for (let i = this.#parts.length - 1; i >= 0 && suffix.length < sentenceSuffixLength; i--) {
      suffix = `${this.#parts[i].slice(suffix.length - sentenceSuffixLength)}${suffix}`;
    }
    return suffix;
  }

  append(text: string): void {
    if (text.length === 0) {
      return;
    }

    this.#trackDelimiters(text);

    // A merge without separating whitespace can continue the previous word.
    const previous = this.#words.at(-1);
    for (const match of text.matchAll(/\S+/g)) {
      const word = match[0];
      const lowerCase = !this.#caseNeutral && word === word.toLowerCase();
      if (match.index === 0 && previous && !/\s/.test(this.#parts.at(-1)?.at(-1) ?? '')) {
        previous.lowerCase = previous.lowerCase && lowerCase;
      } else {
        // Neutral line-wrap handling can recognize a leading letter without treating it as a
        // title-cased name component.
        const titleCase = !this.#caseNeutral && strIsTitleCase(word);
        if (this.empty) {
          this.startsWithTitleCase = this.#caseNeutral ? startsWithCasedCharacter(word) : titleCase;
        }
        this.#words.push({ titleCase, lowerCase });
        if (this.#words.length > 2) {
          this.#words.shift();
        }
      }
    }

    this.hasLineBreaks = this.hasLineBreaks || breakReg.test(text);
    this.#parts.push(text);
  }

  #trackDelimiters(text: string): void {
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (/["'`“”„‘’«»‹›]/.test(character)) {
        this.#trackQuote(character);
      } else if (!this.#insideQuotation && isOpeningSentenceBracket(text, index)) {
        this.#openingDelimiters.push(character);
      } else if (!this.#insideQuotation && closingBracketReg.test(character)) {
        const opener = '([{<'[')]}>'.indexOf(character)];
        if (this.#openingDelimiters.at(-1) === opener) {
          this.#openingDelimiters.pop();
        }
      }
    }
  }

  #trackQuote(character: string): void {
    const source = this.#quoteSource;
    source.index = source.input.indexOf(character, source.index);
    trackQuotations(source.input, source.index, source, source.pairs);
    source.index++;
  }

  trimEnd(): void {
    while (this.#parts.length > 0) {
      const index = this.#parts.length - 1;
      const trimmed = trimEndSpaces(this.#parts[index]);
      if (trimmed.length > 0) {
        this.#parts[index] = trimmed;
        break;
      }
      this.#parts.pop();
    }
    this.#normalizedThrough = Math.min(this.#normalizedThrough, this.#parts.length);
  }

  normalizeWhitespace(): void {
    // Normalize each fragment once, including whitespace at fragment boundaries.
    let write = this.#normalizedThrough;
    for (let read = write; read < this.#parts.length; read++) {
      let part = this.#parts[read].replace(/\s+/g, ' ');
      if ((write === 0 || this.#parts[write - 1].endsWith(' ')) && part.startsWith(' ')) {
        part = part.slice(1);
      }
      if (part.length > 0) {
        this.#parts[write++] = part;
      }
    }
    this.#parts.length = write;
    this.trimEnd();
    this.#normalizedThrough = this.#parts.length;
    this.hasLineBreaks = false;
  }

  text(): string {
    return this.#parts.join('');
  }
}

/**
 * Splits a body of text into an array of sentences
 * using a rule-based segmentation approach.
 *
 * Adapted from Spencer Mountain's nlp_compromise library
 * found at https://github.com/spencermountain/nlp_compromise/
 *
 * @method sentenceSegment
 * @param  {string}         input     The document to be segmented
 * @param  {Object}         options   Optional sentence-boundary behavior
 * @return {Array<string>}            An array of sentences
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Sentence segmentation requires complex NLP logic
export function sentenceSegment(input: string, options: SentenceSegmentOptions = {}): string[] {
  const { caseNeutral = false } = options;
  const depth = (options as InternalSentenceSegmentOptions)[nestedListDepth] ?? 0;
  if (input.length === 0) {
    return [];
  }

  const normalizedInput = input.replace(/\u0085/g, ' ');
  const list = (options as InternalSentenceSegmentOptions)[skipListDetection]
    ? undefined
    : segmentList(normalizedInput, caseNeutral, depth);
  if (list !== undefined) {
    return list;
  }

  // Scan terminals before applying abbreviation and line-wrap rules.
  const source: QuotationSource = {
    input: normalizedInput,
    index: 0,
    pairs: quotationPairs(normalizedInput, singleQuoteApostrophes(normalizedInput)),
    straightDouble: false,
    curlyDouble: false,
    germanDouble: false,
    curlySingle: false,
    straightSingle: false,
    guillemetDouble: false,
    guillemetSingle: false,
  };
  const { chunks, quotedEnds } = sentenceChunks(
    source.input,
    caseNeutral,
    source.pairs,
    (options as InternalSentenceSegmentOptions)[skipListDetection]
      ? nestedMarkerPeriods(normalizedInput, caseNeutral)
      : undefined,
  );

  const acc: string[] = [];
  let pending: SentenceBuffer | undefined;
  for (let idx = 0; idx < chunks.length; idx++) {
    if (pending || chunks[idx]) {
      const chunk = pending ?? new SentenceBuffer(chunks[idx], caseNeutral, source);
      pending = undefined;
      // Trim only spaces (i.e. preserve line breaks/carriage feeds)
      chunk.trimEnd();

      // Separators are not sentences and have no character to test for titlecase.
      if (chunk.empty) {
        continue;
      }

      const suffix = chunk.suffix;
      const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
      const lastWord = suffix.match(/\S+$/)?.[0] ?? '';

      if (chunk.hasLineBreaks) {
        const nextChunk = chunks[idx + 1];
        const nextSentence = nextChunk?.slice(openingDelimiterEnd(nextChunk, 0));
        const abbreviation = gateSuffix.trimEnd();
        const separator =
          suffix.slice(suffix.trimEnd().length) + (nextChunk?.match(/^\s*/)?.[0] ?? '');
        const continuesAbbreviation =
          !/\n[^\S\n]*\n/.test(separator.replace(/\r\n?/g, '\n')) &&
          ((/\bv\.?s\.$/i.test(abbreviation) &&
            isAbbreviationException(abbreviation, nextSentence ?? '')) ||
            (geographicAcronymReg.test(abbreviation) &&
              geographicContinuationReg.test(nextChunk?.trimStart() ?? '')));
        if (
          nextSentence &&
          abbrvReg.test(abbreviation) &&
          !isAbbreviationException(abbreviation, nextSentence) &&
          (caseNeutral
            ? startsWithCasedCharacter(nextSentence) &&
              (!sentenceContinuationReg.test(nextSentence) ||
                independentSentenceReg.test(nextSentence))
            : strIsTitleCase(nextSentence)) &&
          !chunk.hasOpenDelimiter &&
          !(
            geographicAcronymReg.test(abbreviation) &&
            geographicContinuationReg.test(nextChunk?.trimStart() ?? '') &&
            !/[\r\n][^\S\r\n]*[\r\n]/.test(suffix.replace(/\r\n/g, '\n'))
          )
        ) {
          chunk.normalizeWhitespace();
          acc.push(chunk.text());
        } else if (
          nextChunk &&
          (chunk.startsWithTitleCase ||
            continuesAbbreviation ||
            (caseNeutral &&
              sentenceContinuationReg.test(nextChunk.trimStart()) &&
              /[.!?]["'”’“»›\])}>]\s*[\r\n]/.test(suffix)))
        ) {
          // Catch line breaks embedded within valid sentences
          // i.e. sentences that start with a capital letter
          // and normalize every wrap before reprocessing the joined chunk.
          chunk.append(` ${nextChunk}`);
          chunk.normalizeWhitespace();
          pending = chunk;
        } else {
          // Assume that all other embedded line breaks are
          // valid sentence breakpoints
          for (const line of chunk.text().split(breakReg)) {
            const sentence = line.trim();
            if (sentence.length > 0) {
              acc.push(sentence);
            }
          }
        }
      } else if (chunks[idx + 1] && abbrvReg.test(gateSuffix)) {
        const nextChunk = chunks[idx + 1];
        const nextSentence = /\bv\.?s\.$/i.test(gateSuffix)
          ? nextChunk.replace(/^[\s"'([{<]+/, '')
          : nextChunk;
        const paragraphBreak = /\n[^\S\n]*\n/.test(nextChunk.replace(/\r\n?/g, '\n'));
        if (
          (paragraphBreak &&
            /\bv\.?s\.$/i.test(gateSuffix) &&
            !chunk.hasOpenDelimiter &&
            !quotedEnds.has(idx)) ||
          ((caseNeutral
            ? startsWithCasedCharacter(nextSentence) &&
              (!sentenceContinuationReg.test(nextSentence) ||
                independentSentenceReg.test(nextSentence))
            : strIsTitleCase(nextSentence)) &&
            !isAbbreviationException(gateSuffix, nextSentence) &&
            !(
              geographicAcronymReg.test(gateSuffix) &&
              geographicContinuationReg.test(nextChunk.trimStart())
            ))
        ) {
          // Catch abbreviations followed by a capital letter and treat as a boundary.
          acc.push(chunk.text());
        } else {
          // Catch common abbreviations and merge them with a delimiting space
          chunk.append(` ${trimSpaces(nextChunk.replace(/[^\S\r\n]+/g, ' '))}`);
          pending = chunk;
        }
      } else if (chunks[idx + 1] && matchesAcronymSuffix(suffix, lastWord, caseNeutral)) {
        const nextSentence = chunks[idx + 2];
        if (caseNeutral) {
          const continuation = nextSentence || chunks[idx + 1];
          if (isPageNumberContinuation(lastWord, continuation)) {
            // Preserve the p./P. page-number convention without treating every initial alike.
            chunk.append(chunks[idx + 1].replace(/\s+/g, ' ') + (nextSentence || ''));
            pending = chunk;
            if (nextSentence) {
              idx++;
            }
          } else {
            // Casing cannot distinguish a name initial from an ordinary sentence boundary.
            acc.push(chunk.text());
          }
        } else if (chunk.lastWordIsLowerCase) {
          // Catch small-letter abbreviations and merge them.
          chunk.append(` ${chunks[idx + 1].replace(/ +/g, ' ')}`);
          pending = chunk;
        } else if (nextSentence && chunk.previousWordIsTitleCase && strIsTitleCase(nextSentence)) {
          // Catch name abbreviations (e.g. Albert I. Jones) by checking if
          // the previous and next words are all capitalized. Normalize line
          // wrapping in the separator so it cannot split the joined name again.
          chunk.append(chunks[idx + 1].replace(/\s+/g, ' ') + nextSentence);
          pending = chunk;
          idx++;
        } else {
          // Retain a boundary for other entities and unterminated final fragments.
          acc.push(chunk.text());
        }
      } else if (chunks[idx + 1] && ellipseReg.test(suffix)) {
        // Catch mid-sentence ellipses (and their derivatives) and merge them
        const nextChunk = chunks[idx + 1];
        const nextSentence = nextChunk.trim() || chunks[idx + 2] || '';
        if (
          /\.{4}$/.test(suffix) &&
          (caseNeutral ? startsWithCasedCharacter(nextSentence) : strIsTitleCase(nextSentence))
        ) {
          acc.push(chunk.text());
          continue;
        }
        chunk.append(nextChunk.replace(/ +/g, ' '));
        if (!(nextChunk.trim() || breakReg.test(nextChunk)) && chunks[idx + 2]) {
          // Keep the separator inside the sentence; leave line breaks to the newline rule.
          chunk.append(chunks[idx + 2].replace(/ +/g, ' '));
          idx++;
        }
        pending = chunk;
      } else {
        acc.push(chunk.text());
      }
    }
  }

  // If no matches were found, return the input treated as a single sentence
  return acc.length === 0 ? [input] : acc;
}

interface ListBracketState {
  bracketDepth: number[];
  bracketStack: Uint8Array;
  bracketStackLength: number;
  angleOpeners?: Uint8Array;
  parenthesisLabels?: Uint8Array;
}

interface ListScanState extends ListBracketState {
  cursor: number;
  caseNeutral: boolean;
  referenceThrough?: number;
  referenceBoundary?: number;
  quote: string | undefined;
  quoteFlags?: Uint8Array;
  yearList?: boolean;
}

/** Paired single-backtick spans are opaque to list detection, independent of Treebank aliases. */
function listCodeFlags(input: string): Uint8Array | undefined {
  let flags: Uint8Array | undefined;
  let opening = -1;
  for (const token of input.matchAll(/`+/g)) {
    if (token[0].length !== 1) {
      continue;
    }
    if (opening >= 0) {
      flags ??= new Uint8Array(input.length);
      flags.fill(4, opening, token.index + 1);
      opening = -1;
    } else if (!isEscapedListQuote(input, token.index)) {
      opening = token.index;
    }
  }
  return flags;
}

/** Confirm numeric quote openers without treating unpaired year elisions as quotes. */
function numericQuoteFlags(input: string): Uint8Array | undefined {
  let openings = listCodeFlags(input);
  let candidate: number | undefined;
  for (const quote of input.matchAll(/'/g)) {
    const index = quote.index;
    if (
      openings?.[index] === 4 ||
      isEscapedListQuote(input, index) ||
      isPairedNElision(input, index)
    ) {
      continue;
    }
    const previous = input[index - 1] ?? '';
    const following = characterAt(input, index + 1);
    const opener = index === 0 || /^[\s\p{Punctuation}<=>]$/u.test(previous);
    if (opener && /^\p{Number}$/u.test(following)) {
      candidate = index;
    } else if (candidate !== undefined) {
      const possiblePossessive = isListPossessiveCandidate(input, index);
      if (
        !possiblePossessive &&
        (/[.!?]/.test(previous) ||
          following.length === 0 ||
          /^[\s.,!?;:)\]}>"”»\p{Pd}]$/u.test(following))
      ) {
        openings ??= new Uint8Array(input.length);
        openings[candidate] = 1;
        // Confirmed numeric spans retain their internal possessive apostrophes.
        markListQuoteRange(input, openings, candidate + 1, index);
        candidate = undefined;
      } else if (
        opener &&
        /\S/.test(following) &&
        !singleQuoteElisionReg.test(input.slice(index + 1, index + 32))
      ) {
        candidate = undefined;
      }
    }
  }
  return openings;
}

/** Confirm ambiguous possessives only within a span with a later unambiguous closer. */
function confirmedListQuoteFlags(
  input: string,
  initialFlags: Uint8Array | undefined,
): Uint8Array | undefined {
  let flags = initialFlags;
  const pending = {
    "'": { opening: -1, candidate: -1 },
    '’': { opening: -1, candidate: -1 },
  };
  for (const quote of input.matchAll(/['‘’]/g)) {
    const index = quote.index;
    const character = quote[0];
    const closer = character === "'" ? "'" : '’';
    const state = pending[closer];
    markNestedNumericQuote(flags, index, state.opening >= 0);
    if (flags?.[index] === 4 || flags?.[index] === 2 || isLiteralListQuote(input, index)) {
      continue;
    }
    const opening = listQuoteCloser(input, index, flags) === closer;
    if (character === '‘' || state.opening < 0) {
      if (opening) {
        state.opening = index;
        state.candidate = -1;
      }
      continue;
    }
    if (isListPossessiveCandidate(input, index)) {
      state.candidate = state.candidate < 0 ? index : state.candidate;
      continue;
    }
    if (opening && /\S/.test(input[index + 1] ?? '') && !/[.!?]/.test(input[index - 1] ?? '')) {
      state.opening = index;
      state.candidate = -1;
      continue;
    }
    if (state.candidate >= 0) {
      flags ??= new Uint8Array(input.length);
      markListQuoteRange(input, flags, state.candidate, index, closer);
    }
    state.opening = -1;
    state.candidate = -1;
  }
  return flags;
}

/** A numeric opener inside a pending quote retains the existing outer span. */
function markNestedNumericQuote(
  flags: Uint8Array | undefined,
  index: number,
  insideQuote: boolean,
): void {
  if (insideQuote && flags?.[index] === 1) {
    flags[index] = 2;
  }
}

function isListPossessiveCandidate(input: string, index: number): boolean {
  return (
    /s/iu.test(input[index - 1] ?? '') &&
    // Stop at quote or sentence punctuation: each modifier scan ends before another candidate.
    /^\s(?:(?![.!?,;:"'`‘’“”«»‹›])[\s\p{Punctuation}\p{Symbol}])*[\p{Letter}\p{Mark}\p{Number}]/u.test(
      input.slice(index + 1),
    )
  );
}

function markListQuoteRange(
  input: string,
  flags: Uint8Array,
  start: number,
  end: number,
  closer?: string,
): void {
  // Confirmed ranges are disjoint within each quote family and the numeric pass.
  for (let index = start; index < end; index++) {
    if (flags[index] !== 4 && (closer === undefined || input[index] === closer)) {
      flags[index] = 2;
    }
  }
}

function listQuoteCloser(
  input: string,
  index: number,
  quoteFlags: Uint8Array | undefined,
): string | undefined {
  const character = input[index];
  if (isEscapedListQuote(input, index) || isPairedNElision(input, index)) {
    return undefined;
  }
  if (
    input.startsWith('``', index) ||
    (input.startsWith("''", index) && isTreebankQuoteOpening(input, index))
  ) {
    return "''";
  }
  if (character === '"') {
    return index === 0 || /^[\s\p{Punctuation}<=>]$/u.test(input[index - 1]) ? '"' : undefined;
  }
  if (
    character === "'" &&
    (index === 0 || /^[\s\p{Punctuation}<=>]$/u.test(input[index - 1])) &&
    (quoteFlags?.[index] === 1 || !/^\p{Number}$/u.test(characterAt(input, index + 1))) &&
    !singleQuoteElisionReg.test(input.slice(index + 1, index + 32))
  ) {
    return "'";
  }
  if (character === '“') {
    return '”';
  }
  if (character === '«') {
    return '»';
  }
  if (character === '‹') {
    return '›';
  }
  return character === '‘' ? '’' : undefined;
}

/** Backslash runs preceding distinct quote tokens are disjoint. */
function isEscapedListQuote(input: string, index: number): boolean {
  if (!/["'`“”‘’«»‹›]/.test(input[index])) {
    return false;
  }
  let preceding = index - 1;
  while (preceding >= 0 && input[preceding] === '\\') {
    preceding--;
  }
  return (index - preceding - 1) % 2 === 1;
}

function isLiteralListQuote(input: string, index: number, quoteFlags?: Uint8Array): boolean {
  if (isEscapedListQuote(input, index) || isPairedNElision(input, index)) {
    return true;
  }
  if (!/['’]/.test(input[index])) {
    return false;
  }
  return (
    quoteFlags?.[index] === 2 ||
    (/[\p{Letter}\p{Mark}]$/u.test(input.slice(Math.max(0, index - 2), index)) &&
      /^[\p{Letter}\p{Mark}]$/u.test(characterAt(input, index + 1))) ||
    (!/[.!?]/.test(input[index - 1] ?? '') &&
      singleQuoteElisionReg.test(input.slice(index + 1, index + 32)))
  );
}

/** Only paired, unquoted angle marks form delimiters; unmatched comparisons stay prose. */
function matchedAngleOpeners(
  input: string,
  quoteFlags: Uint8Array | undefined,
): Uint8Array | undefined {
  let pending = new Uint32Array(32);
  let depth = 0;
  let matched: Uint8Array | undefined;
  let quote: string | undefined;
  for (let index = 0; index < input.length; index++) {
    if (quoteFlags?.[index] === 4) {
      continue;
    }
    if (quote !== undefined) {
      if (input.startsWith(quote, index) && !isLiteralListQuote(input, index, quoteFlags)) {
        index += quote.length - 1;
        quote = undefined;
      }
      continue;
    }
    quote = listQuoteCloser(input, index, quoteFlags);
    if (quote !== undefined) {
      index += quote.length - 1;
    } else if (input[index] === '<') {
      if (depth === pending.length) {
        const grown = new Uint32Array(pending.length * 2);
        grown.set(pending);
        pending = grown;
      }
      pending[depth++] = index;
    } else if (input[index] === '>' && depth > 0) {
      matched ??= new Uint8Array(input.length);
      matched[pending[--depth]] = 1;
    }
  }
  return matched;
}

function* unquotedListParentheses(
  input: string,
  quoteFlags: Uint8Array | undefined,
  angleOpeners: Uint8Array | undefined,
): Generator<number> {
  const brackets: ListBracketState = {
    bracketDepth: [0, 0, 0, 0],
    bracketStack: new Uint8Array(32),
    bracketStackLength: 0,
    angleOpeners,
  };
  let quote: string | undefined;
  let skipThrough = -1;
  for (const token of input.matchAll(/[()[\]{}<>"'`“”‘’«»‹›]/g)) {
    const index = token.index;
    if (index <= skipThrough || quoteFlags?.[index] === 4) {
      continue;
    }
    if (quote !== undefined) {
      if (input.startsWith(quote, index) && !isLiteralListQuote(input, index, quoteFlags)) {
        skipThrough = index + quote.length - 1;
        quote = undefined;
      }
      continue;
    }
    quote = listQuoteCloser(input, index, quoteFlags);
    if (quote !== undefined) {
      skipThrough = index + quote.length - 1;
      continue;
    }
    if (
      /[()]/.test(token[0]) &&
      brackets.bracketDepth[1] + brackets.bracketDepth[2] + brackets.bracketDepth[3] === 0
    ) {
      yield index;
    }
    trackListBrackets(input, index, brackets);
  }
}

/** A final structural closer can confirm that earlier label-shaped closers were literal. */
function parenthesisLabelFlags(
  input: string,
  quoteFlags: Uint8Array | undefined,
  angleOpeners: Uint8Array | undefined,
): Uint8Array | undefined {
  const markers = input.matchAll(new RegExp(listMarkerReg));
  let marker = markers.next().value;
  let depth = 0;
  let candidate = -1;
  let flags: Uint8Array | undefined;
  for (const index of unquotedListParentheses(input, quoteFlags, angleOpeners)) {
    if (input[index] === '(') {
      depth++;
      candidate = -1;
    } else if (input[index] === ')') {
      while (marker !== undefined && marker.index + marker[0].length - 1 < index) {
        marker = markers.next().value;
      }
      const label = marker !== undefined && marker.index + marker[0].length - 1 === index;
      if (depth > 0) {
        depth--;
        if (depth === 0 && label) {
          candidate = index;
        }
      } else if (!label && candidate >= 0) {
        flags ??= new Uint8Array(input.length);
        flags.fill(1, candidate, index);
        candidate = -1;
      }
    }
  }
  return flags;
}

function listScanState(input: string, caseNeutral: boolean): ListScanState {
  const quoteFlags = confirmedListQuoteFlags(input, numericQuoteFlags(input));
  const angleOpeners = matchedAngleOpeners(input, quoteFlags);
  return {
    cursor: 0,
    caseNeutral,
    bracketDepth: [0, 0, 0, 0],
    bracketStack: new Uint8Array(32),
    bracketStackLength: 0,
    quote: undefined,
    quoteFlags,
    angleOpeners,
    parenthesisLabels: parenthesisLabelFlags(input, quoteFlags, angleOpeners),
  };
}

function advanceListScan(input: string, end: number, state: ListScanState): void {
  while (state.cursor < end) {
    const index = state.cursor++;
    if (state.quoteFlags?.[index] === 4) {
      continue;
    }
    if (state.quote !== undefined) {
      const apostrophe = isLiteralListQuote(input, index, state.quoteFlags);
      if (input.startsWith(state.quote, index) && !apostrophe) {
        state.cursor += state.quote.length - 1;
        state.quote = undefined;
      }
      continue;
    }
    const quote = listQuoteCloser(input, index, state.quoteFlags);
    if (quote !== undefined) {
      state.quote = quote;
      state.cursor += quote.length - 1;
      continue;
    }
    trackListBrackets(input, index, state);
    if (
      state.referenceThrough !== undefined &&
      state.bracketStackLength === 0 &&
      isListReferenceBoundary(input, index, state.caseNeutral)
    ) {
      state.referenceBoundary = index;
    }
  }
}

/** Match the current literal's closer; crossing or unmatched closers stay literal. */
function trackListBrackets(input: string, index: number, state: ListBracketState): void {
  const character = input[index];
  const opening = '([{<'.indexOf(character);
  if (opening !== -1 && (character !== '<' || state.angleOpeners?.[index] === 1)) {
    if (state.bracketStackLength === state.bracketStack.length) {
      const grown = new Uint8Array(Math.max(32, state.bracketStack.length * 2));
      grown.set(state.bracketStack);
      state.bracketStack = grown;
    }
    state.bracketStack[state.bracketStackLength++] = opening;
    state.bracketDepth[opening]++;
    return;
  }
  const closing = ')]}>'.indexOf(character);
  if (
    closing === -1 ||
    state.bracketDepth[closing] === 0 ||
    (character === ')' && state.parenthesisLabels?.[index] === 1)
  ) {
    return;
  }
  if (state.bracketStack[state.bracketStackLength - 1] === closing) {
    state.bracketStackLength--;
    state.bracketDepth[closing]--;
  }
}

function listMarkerPrefix(
  input: string,
  marker: RegExpExecArray,
  quoteFlags?: Uint8Array,
): {
  empty: boolean;
  boundary: boolean;
  joinedNameInitial: boolean;
} {
  let index = marker.index - 1;
  let lineBreak = /[\r\n]/.test(marker[0]);
  while (
    index >= 0 &&
    (/[\s"'”’»›\])}>]/.test(input[index]) || (input[index] === '`' && quoteFlags?.[index] === 4))
  ) {
    lineBreak ||= /[\r\n]/.test(input[index]);
    index--;
  }
  const joinedNameInitial =
    /^\p{Cased}\p{M}*\.$/u.test(marker[0].trim()) &&
    /(?:\b(?:and|or)|[,;&])\s*$/i.test(input.slice(Math.max(0, marker.index - 8), marker.index));
  return {
    empty: index < 0,
    boundary: lineBreak || /[.!?:\p{Pd}]/u.test(input[index] ?? ''),
    joinedNameInitial,
  };
}

function nextListMarker(
  input: string,
  expression: RegExp,
  state: ListScanState,
  family?: RegExp,
  previous?: RegExpExecArray,
): RegExpExecArray | null {
  let bodyStart = previous ? previous.index + previous[0].length : 0;
  let hasBody = previous === undefined;
  let marker = expression.exec(input);
  while (marker !== null) {
    advanceListScan(input, marker.index, state);
    if (family === undefined || family.test(marker[0])) {
      hasBody ||= input.slice(bodyStart, marker.index).trim().length > 0;
      bodyStart = marker.index + marker[0].length;
    }
    const enclosedMarker =
      state.bracketDepth.some((depth) => depth > 0) ||
      state.quote !== undefined ||
      state.quoteFlags?.[marker.index] === 4;
    const prefix = listMarkerPrefix(input, marker, state.quoteFlags);
    const crossReference = isListCrossReference(input, marker, state, enclosedMarker);
    const authorInitial =
      previous !== undefined &&
      /^\p{Cased}\p{M}*\.$/u.test(marker[0].trim()) &&
      (prefix.joinedNameInitial ||
        colonIntroducedNameBoundary(
          input,
          marker.index + marker[0].length - 1,
          state.caseNeutral,
        ) === -1);
    const yearInProse =
      yearListMarkerReg.test(marker[0].trim()) &&
      !(state.yearList || prefix.empty || prefix.boundary);
    const countInProse =
      /^\d+\.$/.test(marker[0].trim()) &&
      /\b(?:am|is|are|was|were|be|been|being|has|have|had|reached|numbered|total(?:ed)?|hit|equals?|equaled|became|remained|scored|costs?|in|of|at|by|to|from|about|around|roughly|approximately)$/i.test(
        input.slice(Math.max(0, marker.index - 24), marker.index).trimEnd(),
      );
    if (
      (family === undefined || family.test(marker[0])) &&
      hasBody &&
      !enclosedMarker &&
      !yearInProse &&
      !countInProse &&
      !crossReference &&
      !authorInitial
    ) {
      return marker;
    }
    marker = expression.exec(input);
  }
  return null;
}

/** Test only unquoted, unbracketed reference punctuation from the shared source cursor. */
function isListReferenceBoundary(input: string, index: number, caseNeutral: boolean): boolean {
  const terminal = input[index];
  if (!/[.!?:;\r\n]/.test(terminal)) {
    return false;
  }
  if (terminal !== '.') {
    return true;
  }
  const suffix = input.slice(Math.max(0, index + 1 - sentenceSuffixLength), index + 1);
  const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
  return !(
    (abbrvReg.test(gateSuffix) && excepReg.test(gateSuffix)) ||
    acronymReg.test(gateSuffix) ||
    (/\d/.test(input[index - 1] ?? '') && /\d/.test(input[index + 1] ?? ''))
  );
}

/** Reference labels continue through one prose run; strong punctuation starts a new context. */
function isListCrossReference(
  input: string,
  marker: RegExpExecArray,
  state: ListScanState,
  enclosed: boolean,
): boolean {
  if (
    state.referenceThrough !== undefined &&
    (state.referenceBoundary ?? -1) >= state.referenceThrough
  ) {
    state.referenceThrough = undefined;
  }
  if (
    !enclosed &&
    /\b(?:section|chapter|page|figure|table|paragraph|article|clause)s?$/i.test(
      input.slice(Math.max(0, marker.index - 24), marker.index).trimEnd(),
    )
  ) {
    state.referenceThrough = marker.index;
  }
  if (state.referenceThrough === undefined) {
    return false;
  }
  // Consecutive ranges are disjoint, including across nextListMarker calls.
  state.referenceThrough = marker.index + marker[0].length;
  return true;
}

interface ListCandidate {
  current: RegExpExecArray;
  next: RegExpExecArray;
  family: RegExp;
  prefix: string;
}

function listMarkerFamily(marker: string, caseNeutral: boolean): RegExp {
  let start: string;
  if (/\d/.test(marker)) {
    start = '^\\s*(?:[•⁃][^\\S\\r\\n]*|[-*+][^\\S\\r\\n]+)?\\d';
  } else if (caseNeutral) {
    start = '^\\s*\\p{Cased}';
  } else {
    start = /^[\p{Uppercase}\p{Lt}]/u.test(marker)
      ? '^\\s*[\\p{Uppercase}\\p{Lt}]'
      : '^\\s*\\p{Lowercase}';
  }
  const ending = marker.endsWith(')') ? '\\)' : '\\.';
  return new RegExp(`${start}[^\\r\\n]*${ending}$`, 'u');
}

function numericMarkerValue(marker: string): string | undefined {
  return marker.match(/^(?:[•⁃][^\S\r\n]*|[-*+][^\S\r\n]+)?(\d+)/)?.[1].replace(/^0+(?=\d)/, '');
}

function isDistantNumericMarker(
  first: string | undefined,
  marker: string,
  atBoundary: boolean,
): boolean {
  const current = numericMarkerValue(marker);
  if (atBoundary || first === undefined || current === undefined) {
    return false;
  }
  if (Math.abs(first.length - current.length) > 1) {
    return true;
  }
  // Equal-length/adjacent-length labels require at most the current label's digits plus one.
  // Keep only a bounded signed difference; no arbitrary-precision integer is constructed.
  let difference = 0;
  const length = Math.max(first.length, current.length);
  for (let index = 0; index < length; index++) {
    const firstDigit = Number(first[index - (length - first.length)] ?? '0');
    const currentDigit = Number(current[index - (length - current.length)] ?? '0');
    difference = difference * 10 + firstDigit - currentDigit;
    if (Math.abs(difference) > 10) {
      return true;
    }
  }
  return false;
}

function findListCandidate(
  input: string,
  caseNeutral: boolean,
  expression: RegExp,
  state: ListScanState,
  familyFilter?: RegExp,
): ListCandidate | undefined {
  const firstByFamily = new Map<
    string,
    {
      marker: RegExpExecArray;
      emptyPrefix: boolean;
      prefix?: string;
      identity: string;
      number: string | undefined;
      bodyStart: number;
      hasBody: boolean;
    }
  >();
  // At most six fixed marker families can remain deferred.
  const deferredByFamily = new Map<
    string,
    { candidate: ListCandidate; expressionIndex: number; state: ListScanState }
  >();
  let current = nextListMarker(input, expression, state, familyFilter);
  let proseInitialEnd: number | undefined;
  while (current !== null) {
    const marker = current[0].trim();
    const context = listMarkerPrefix(input, current, state.quoteFlags);
    const ambiguousMarker = /^\d+\.$/.test(marker) || /^\p{Cased}\p{M}*\.$/u.test(marker);

    const family = listMarkerFamily(marker, caseNeutral);
    const first = firstByFamily.get(family.source);
    proseInitialEnd = markProseInitial(
      input,
      current,
      first === undefined,
      context,
      proseInitialEnd,
    );
    const identity = caseNeutral ? marker.toLowerCase() : marker;
    if (context.joinedNameInitial) {
      firstByFamily.delete(family.source);
      deferredByFamily.delete(family.source);
      current = nextListMarker(input, expression, state, familyFilter);
      continue;
    }
    if (first !== undefined) {
      first.hasBody ||= input.slice(first.bodyStart, current.index).trim().length > 0;
      first.bodyStart = current.index + current[0].length;
    }
    const distinctMarker = first?.identity !== identity;
    if (first?.hasBody && (first.emptyPrefix || distinctMarker)) {
      first.prefix ??= input.slice(0, first.marker.index).trim();
      const candidate: ListCandidate = {
        current: first.marker,
        next: current,
        family,
        prefix: first.prefix,
      };
      const hasEarlierFamily = [...firstByFamily.values()].some(
        (entry) => entry.marker.index < first.marker.index,
      );
      const distantNumber = isDistantNumericMarker(first.number, marker, context.boundary);
      if (!(hasEarlierFamily || distantNumber)) {
        return candidate;
      }
      if (!deferredByFamily.has(family.source)) {
        deferredByFamily.set(family.source, {
          candidate,
          expressionIndex: expression.lastIndex,
          state: {
            ...state,
            bracketDepth: [...state.bracketDepth],
            bracketStack: state.bracketStack.slice(0, state.bracketStackLength),
          },
        });
      }
    }

    if (first === undefined && (context.empty || !ambiguousMarker || context.boundary)) {
      state.yearList ||= yearListMarkerReg.test(marker);
      firstByFamily.set(family.source, {
        marker: current,
        emptyPrefix: context.empty,
        identity,
        number: numericMarkerValue(marker),
        bodyStart: current.index + current[0].length,
        hasBody: false,
      });
    }

    current = nextListMarker(input, expression, state, familyFilter);
  }
  const deferred = [...deferredByFamily.values()].sort(
    (first, second) => first.candidate.current.index - second.candidate.current.index,
  )[0];
  if (deferred !== undefined) {
    expression.lastIndex = deferred.expressionIndex;
    Object.assign(state, deferred.state);
  }
  return deferred?.candidate;
}

function markProseInitial(
  input: string,
  marker: RegExpExecArray,
  firstMarker: boolean,
  context: { empty: boolean; boundary: boolean },
  previousEnd: number | undefined,
): number | undefined {
  if (
    firstMarker &&
    /^\p{Cased}\p{M}*\.$/u.test(marker[0].trim()) &&
    (!(context.empty || context.boundary) ||
      (previousEnd !== undefined && input.slice(previousEnd, marker.index).trim().length === 0))
  ) {
    context.boundary = false;
    return marker.index + marker[0].length;
  }
  return undefined;
}

function segmentNestedSentence(
  input: string,
  caseNeutral: boolean,
  depth: number,
  detectLists = true,
): string[] {
  const options: InternalSentenceSegmentOptions = {
    caseNeutral,
    [nestedListDepth]: depth + 1,
    [skipListDetection]: !detectLists,
  };
  return sentenceSegment(input, options);
}

function segmentList(input: string, caseNeutral: boolean, depth: number): string[] | undefined {
  if (depth >= maxNestedListDepth) {
    return undefined;
  }
  const expression = new RegExp(listMarkerReg);
  const state = listScanState(input, caseNeutral);
  const candidate = findListCandidate(input, caseNeutral, expression, state);
  if (candidate === undefined) {
    return undefined;
  }

  let current: RegExpExecArray | null = candidate.current;
  let next: RegExpExecArray | null = candidate.next;
  const { family, prefix } = candidate;
  const segments = prefix.length === 0 ? [] : segmentNestedSentence(prefix, caseNeutral, depth);
  do {
    const body = input.slice(current.index + current[0].length, next?.index ?? input.length).trim();
    const sentences = /[.!?\r\n]/.test(body)
      ? segmentNestedSentence(body, caseNeutral, depth, false)
      : [body];
    let firstSentenceEnd = 1;
    while (
      firstSentenceEnd < sentences.length &&
      /^\p{Cased}\p{M}*\.$/u.test(sentences[firstSentenceEnd - 1])
    ) {
      firstSentenceEnd++;
    }
    segments.push(`${current[0].trim()} ${sentences.slice(0, firstSentenceEnd).join(' ')}`);
    for (let index = firstSentenceEnd; index < sentences.length; index++) {
      segments.push(sentences[index]);
    }
    current = next;
    next = current && nextListMarker(input, expression, state, family, current);
  } while (current !== null);
  return segments;
}

/** Options for rule-based sentence segmentation. */
export interface SentenceSegmentOptions {
  /** Ignore letter casing when applying sentence-boundary heuristics (default: false). */
  caseNeutral?: boolean;
}

interface BracketContext {
  depth: number;
  standalone: boolean;
  bracketQuoteEnd: number;
  angles?: Uint8Array;
}

const angleQuoteClosers: Record<string, string> = {
  '“': '”',
  '‘': '’',
  '«': '»',
  '‹': '›',
  '„': '“',
  '‚': '‘',
};

function isAngleApostrophe(input: string, index: number): boolean {
  return (
    /['‘’]/.test(input[index]) &&
    /[\p{Letter}\p{Mark}]$/u.test(input.slice(Math.max(0, index - 2), index)) &&
    /^[\p{Letter}\p{Mark}]$/u.test(characterAt(input, index + 1))
  );
}

function isSingleBacktick(input: string, index: number): boolean {
  return input[index] === '`' && input[index - 1] !== '`' && input[index + 1] !== '`';
}

function angleQuoteCloser(input: string, index: number): string | undefined {
  const character = input[index];
  if (
    !/["'`“‘«‹„‚]/.test(character) ||
    isEscapedAngleQuote(input, index) ||
    isAngleApostrophe(input, index)
  ) {
    return undefined;
  }
  if (
    input.startsWith('``', index) ||
    (input.startsWith("''", index) && isTreebankQuoteOpening(input, index))
  ) {
    return "''";
  }
  if (character === '`') {
    return isSingleBacktick(input, index) ? '`' : undefined;
  }
  if (angleQuoteClosers[character] !== undefined) {
    return angleQuoteClosers[character];
  }
  if (
    /["']/.test(character) &&
    (index === 0 || /^[\s\p{Punctuation}<]$/u.test(input[index - 1])) &&
    /\S/.test(input[index + 1] ?? '')
  ) {
    return character;
  }
  return undefined;
}

function isEscapedAngleQuote(input: string, index: number): boolean {
  let escaped = false;
  for (let previous = index - 1; previous >= 0 && input[previous] === '\\'; previous--) {
    escaped = !escaped;
  }
  return escaped;
}

/** Leading elisions cannot borrow a closer across a later independent quotation. */
function hasLaterAngleElisionOpening(input: string, start: number, end: number): boolean {
  const opener = input[start];
  if (
    !(
      /['‘]/.test(opener) &&
      /^(?:(?:t(?:is|was)|em|cause|till?)(?![\p{ID_Continue}\u200c\u200d])|\p{Number})/iu.test(
        input.slice(start + 1, start + 16),
      )
    )
  ) {
    return false;
  }
  let next = input.indexOf(opener, start + 1);
  while (next !== -1 && next <= end) {
    let previous = next - 1;
    while (input[previous] === '\\') {
      previous--;
    }
    if (
      angleQuoteCloser(input, next) !== undefined &&
      (opener === '‘' || /^[\s([{<]$/.test(input[previous])) &&
      /\S/.test(input[next + 1] ?? '')
    ) {
      return true;
    }
    next = input.indexOf(opener, next + 1);
  }
  return false;
}

/** Search each fixed closer kind monotonically, including when no closer remains. */
function angleQuotationEnd(
  input: string,
  start: number,
  closer: string,
  positions: Record<string, number>,
): number {
  const cached = positions[closer];
  let index = Math.max(start + closer.length, cached ?? 0);
  while (index < input.length) {
    const found = input.indexOf(closer, index);
    if (found === -1) {
      break;
    }
    if (
      found === cached ||
      !(
        isEscapedAngleQuote(input, found) ||
        isAngleApostrophe(input, found) ||
        (closer === '`' && !isSingleBacktick(input, found))
      )
    ) {
      positions[closer] = found;
      const innerEnd = germanAngleInnerQuoteEnd(input, start, found, closer, positions);
      if (innerEnd !== -1) {
        index = innerEnd;
        continue;
      }
      return hasLaterAngleElisionOpening(input, start, found) ? -1 : found + closer.length;
    }
    index = found + 1;
  }
  positions[closer] = input.length;
  return -1;
}

/** A complete English pair before the next shared mark can nest inside a German quotation. */
function germanAngleInnerQuoteEnd(
  input: string,
  start: number,
  shared: number,
  closer: string,
  positions: Record<string, number>,
): number {
  if (input[start] !== '„' && input[start] !== '‚') {
    return -1;
  }
  const englishCloser = closer === '“' ? '”' : '’';
  // These searches start at a high quote, so they cannot recurse into this low-quote branch.
  const englishEnd = angleQuotationEnd(input, shared, englishCloser, positions);
  const germanEnd = angleQuotationEnd(input, shared, closer, positions);
  return englishEnd !== -1 && germanEnd > englishEnd ? englishEnd : -1;
}

/** Pair unquoted angles with a byte mask and scalar depths; unmatched comparisons stay prose. */
function matchedAngleDelimiters(input: string): Uint8Array | undefined {
  if (!(input.includes('<') && input.includes('>'))) {
    return undefined;
  }
  let depth = 0;
  let pairs = 0;
  let matched = new Uint8Array(0);
  const closerPositions: Record<string, number> = {};
  for (let index = 0; index < input.length; index++) {
    const quote = angleQuoteCloser(input, index);
    if (quote !== undefined) {
      const end = angleQuotationEnd(input, index, quote, closerPositions);
      if (end !== -1) {
        index = end - 1;
        continue;
      }
    }
    if (/[<>]/.test(input[index]) && isEscapedAngleQuote(input, index)) {
      continue;
    }
    if (input[index] === '<') {
      if (matched.length === 0) {
        matched = new Uint8Array(input.length);
      }
      matched[index] = 2;
      depth++;
    } else if (input[index] === '>' && depth > 0) {
      matched[index] = 1;
      depth--;
      pairs++;
    }
  }
  if (pairs === 0) {
    return undefined;
  }
  retainMatchedAngleOpeners(matched);
  return matched;
}

function retainMatchedAngleOpeners(matched: Uint8Array): void {
  let depth = 0;
  for (let index = matched.length - 1; index >= 0; index--) {
    if (matched[index] === 1) {
      depth++;
    } else if (matched[index] === 2) {
      matched[index] = depth > 0 ? 1 : 0;
      depth = Math.max(0, depth - 1);
    }
  }
}

/** Reuse paired-quote recognition only for the surrounding bracket context. */
function pairedBracketQuoteEnd(
  input: string,
  index: number,
  currentEnd: number,
  positions: Record<string, number>,
): number {
  if (index <= currentEnd || !/["'`‘“«‹„‚]/.test(input[index]) || input[index - 1] === "'") {
    return currentEnd;
  }
  const closer = angleQuoteCloser(input, index);
  return closer === undefined ? currentEnd : angleQuotationEnd(input, index, closer, positions) - 1;
}

function followsParagraph(input: string, index: number): boolean {
  let breaks = 0;
  for (let previous = index - 1; previous >= 0 && /\s/.test(input[previous]); previous--) {
    if (input[previous] === '\n' || (input[previous] === '\r' && input[previous + 1] !== '\n')) {
      breaks++;
      if (breaks === 2) {
        return true;
      }
    }
  }
  return false;
}

function updateBracketContext(
  input: string,
  index: number,
  standalone: boolean,
  brackets: BracketContext,
  insideQuotes: boolean,
): void {
  if (insideQuotes || index < brackets.bracketQuoteEnd) {
    return;
  }
  const character = input[index];
  if (
    !/[()[\]{}<>]/.test(character) ||
    (/[<>]/.test(character) && brackets.angles?.[index] !== 1) ||
    isEscapedAngleQuote(input, index)
  ) {
    return;
  }
  if (openingBracketReg.test(character)) {
    if (brackets.depth === 0) {
      brackets.standalone = standalone || followsParagraph(input, index);
    }
    brackets.depth++;
  } else if (closingBracketReg.test(character)) {
    brackets.depth = Math.max(0, brackets.depth - 1);
  }
}

interface InternalSentenceSegmentOptions extends SentenceSegmentOptions {
  [skipListDetection]?: boolean;
  [nestedListDepth]?: number;
}

/** Preserve confirmed nested marker periods while still splitting ordinary item-body sentences. */
function nestedMarkerPeriods(input: string, caseNeutral: boolean): Uint8Array | undefined {
  const families = new Map<string, RegExp>();
  for (const marker of input.matchAll(new RegExp(listMarkerReg))) {
    if (marker[0].includes('.')) {
      const family = listMarkerFamily(marker[0].trim(), caseNeutral);
      families.set(family.source, family);
    }
  }
  if (families.size === 0) {
    return undefined;
  }
  const context = listScanState(input, caseNeutral);
  let periods: Uint8Array | undefined;
  // The configured marker grammar has at most six families, independent of input size.
  for (const family of families.values()) {
    const expression = new RegExp(listMarkerReg);
    const state = {
      ...context,
      bracketDepth: [0, 0, 0, 0],
      bracketStack: new Uint8Array(32),
      bracketStackLength: 0,
    };
    const candidate = findListCandidate(input, caseNeutral, expression, state, family);
    if (candidate === undefined) {
      continue;
    }
    periods ??= new Uint8Array(input.length);
    markListPeriod(periods, candidate.current);
    let marker: RegExpExecArray | null = candidate.next;
    while (marker !== null) {
      markListPeriod(periods, marker);
      marker = nextListMarker(input, expression, state, family, marker);
    }
  }
  return periods;
}

function markListPeriod(periods: Uint8Array, marker: RegExpExecArray): void {
  const offset = marker[0].indexOf('.');
  if (offset >= 0) {
    periods[marker.index + offset] = 1;
  }
}

/** Scan sentence boundaries once, preserving the former captured-split layout. */
function sentenceChunks(
  input: string,
  caseNeutral: boolean,
  pairs: Int32Array,
  markerPeriods?: Uint8Array,
): { chunks: string[]; quotedEnds: Set<number> } {
  const chunks: string[] = [];
  const quotedEnds = new Set<number>();
  const protectedPeriods = spacedEllipsisRanges(input, caseNeutral);
  const ellipsisCursor = { index: 0 };
  const questionTerminal = questionTerminalChecker(
    input,
    protectedPeriods,
    caseNeutral,
    pairs,
    markerPeriods,
  );
  const hasUrlPrefix = urlPrefixChecker(input);
  const hasFollowingAt = followingAtChecker(input);
  let lastEnd = 0;
  let start = -1;
  const quotations: QuotationState = {
    straightDouble: false,
    curlyDouble: false,
    germanDouble: false,
    curlySingle: false,
    straightSingle: false,
    guillemetDouble: false,
    guillemetSingle: false,
  };
  let sentenceStarted = false;
  let closingQuotes = '';
  const bracketQuotePositions: Record<string, number> = {};
  const brackets: BracketContext = {
    depth: 0,
    standalone: false,
    bracketQuoteEnd: -1,
    angles: matchedAngleDelimiters(input),
  };

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (pairs[index] !== 0) {
      trackQuotations(input, index, quotations, pairs);
      closingQuotes = closingQuotationMarks(quotations);
    }
    const insideQuotes = closingQuotes.length > 0;
    brackets.bracketQuoteEnd = pairedBracketQuoteEnd(
      input,
      index,
      brackets.bracketQuoteEnd,
      bracketQuotePositions,
    );
    updateBracketContext(input, index, !sentenceStarted, brackets, insideQuotes);
    if (index < lastEnd || char === '\r' || char === '\n') {
      // Only closing-delimiter lookahead can cross CR/LF; other wraps reset the prefix.
      start = -1;
      continue;
    }
    sentenceStarted ||= /\S/.test(char);
    if (start === -1) {
      if (/\S/.test(char)) {
        start = index;
      }
      // A terminal must follow the initial character, even if it is punctuation.
      continue;
    }
    if (
      markerPeriods?.[index] === 1 ||
      !isUnprotectedTerminal(char, index, protectedPeriods, ellipsisCursor)
    ) {
      continue;
    }
    const unspacedDelimitedBoundary =
      !insideQuotes &&
      index >= brackets.bracketQuoteEnd &&
      brackets.depth === 0 &&
      isUnspacedDelimitedSentenceStart(input, index, caseNeutral);
    const end = unspacedDelimitedBoundary
      ? index + 1
      : sentenceEnd(
          input,
          index,
          closingQuotes,
          brackets,
          caseNeutral,
          questionTerminal,
          hasUrlPrefix,
          pairs,
          hasFollowingAt,
        );
    if (
      end === -1 ||
      (closingQuotes.length > 1 && remainsInsideQuotation(input, index, end, closingQuotes, pairs))
    ) {
      continue;
    }
    // Captured line wraps can only occur between the terminal and closing delimiters.
    chunks.push(input.slice(lastEnd, start), input.slice(start, end).replace(/[\r\n]+/g, ' '));
    if (
      end <= brackets.bracketQuoteEnd &&
      /\bv\.?s\.$/i.test(input.slice(Math.max(0, index - 4), index + 1))
    ) {
      quotedEnds.add(chunks.length - 1);
    }
    lastEnd = end;
    start = -1;
    sentenceStarted =
      !unspacedDelimitedBoundary && keepsAbbreviationContext(input, index, end, caseNeutral);
  }

  chunks.push(input.slice(lastEnd));
  return { chunks, quotedEnds };
}

function keepsAbbreviationContext(
  input: string,
  index: number,
  end: number,
  caseNeutral: boolean,
): boolean {
  const suffix = input.slice(Math.max(0, index + 1 - sentenceSuffixLength), index + 1);
  const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
  return (
    end === index + 1 &&
    abbrvReg.test(gateSuffix) &&
    !(
      /\bv\.?s\.$/i.test(gateSuffix) &&
      !isAbbreviationException(gateSuffix, input.slice(end).replace(/^[\s"'([{<]+/, ''))
    )
  );
}

interface SpacedEllipsisRange {
  start: number;
  end: number;
  boundary: number;
}

function spacedEllipsisRanges(input: string, caseNeutral: boolean): SpacedEllipsisRange[] {
  const ranges: SpacedEllipsisRange[] = [];
  for (const match of input.matchAll(/(?:\.[^\S\r\n]+){2,}\./g)) {
    let periods = 0;
    for (const character of match[0]) {
      if (character === '.') {
        periods++;
      }
    }

    const next = openingDelimiterEnd(input, match.index + match[0].length);
    const following = characterAt(input, next);
    const sentenceStart =
      /^\p{Number}$/u.test(following) ||
      (caseNeutral
        ? isCasedCharacter(following)
        : following.length > 0 && charIsUpperCase(following));
    let boundary = -1;
    if (periods >= 4 && sentenceStart) {
      boundary = /\S/.test(input[match.index - 1] ?? '')
        ? match.index
        : match.index + match[0].lastIndexOf('.');
    }
    ranges.push({ start: match.index, end: match.index + match[0].length, boundary });
  }
  return ranges;
}

function isProtectedEllipsisPeriod(
  position: number,
  ranges: SpacedEllipsisRange[],
  cursor: { index: number },
): boolean {
  while (cursor.index < ranges.length && position >= ranges[cursor.index].end) {
    cursor.index++;
  }
  const range = ranges[cursor.index];
  return range !== undefined && position >= range.start && position !== range.boundary;
}

/** Quoted literal marks stay consumable until their real enclosing closer. */
function isUnmatchedAngleCloser(
  input: string,
  index: number,
  quotePending: boolean,
  brackets: BracketContext,
): boolean {
  return (
    input[index] === '>' &&
    !quotePending &&
    index >= brackets.bracketQuoteEnd &&
    brackets.angles?.[index] !== 1
  );
}

function isUnprotectedTerminal(
  character: string,
  index: number,
  ranges: SpacedEllipsisRange[],
  cursor: { index: number },
): boolean {
  return (
    (character === '.' && !isProtectedEllipsisPeriod(index, ranges, cursor)) ||
    character === '?' ||
    character === '!'
  );
}

/** Scan closing delimiters, including whitespace before a pending closing quote. */
function closingDelimiterEnd(
  input: string,
  index: number,
  closingQuotes: string,
  pairs: Int32Array,
  brackets: BracketContext,
): number {
  let end = index + 1;
  let pendingQuotes = closingQuotes;
  while (end < input.length) {
    const closing = pairedClosingQuote(input, end, pairs);
    const treebankCloser =
      input.startsWith("''", end) && closing === '"' && pendingQuotes.includes('"');
    if (treebankCloser) {
      pendingQuotes = pendingQuotes.replace('"', '');
      end += 2;
      continue;
    }
    if (
      /["'”’“»›]/.test(input[end]) &&
      closingQuotes.length > 0 &&
      (closing === undefined || !pendingQuotes.includes(closing))
    ) {
      break;
    }
    if (
      (closingDelimiterReg.test(input[end]) || pendingQuotes.includes(input[end])) &&
      !isUnmatchedAngleCloser(input, end, pendingQuotes.length > 0, brackets)
    ) {
      if (pendingQuotes.includes(input[end])) {
        pendingQuotes = pendingQuotes.replace(input[end], '');
      }
      end++;
      continue;
    }

    // Only consume a spaced quote when it closes an existing quotation.
    let next = end;
    while (next < input.length && /\s/.test(input[next])) {
      next++;
    }
    if (
      next > end &&
      next < input.length &&
      ((closingBracketReg.test(input[next]) &&
        !isUnmatchedAngleCloser(input, next, pendingQuotes.length > 0, brackets)) ||
        pendingQuotes.includes(pairedClosingQuote(input, next, pairs) ?? '\0'))
    ) {
      end = next;
      continue;
    }
    break;
  }
  return end;
}

/** Include closing delimiters, or return -1 when the sentence continues. */
function sentenceEnd(
  input: string,
  index: number,
  closingQuotes: string,
  brackets: BracketContext,
  caseNeutral: boolean,
  questionTerminal: (start: number) => boolean,
  hasUrlPrefix: (end: number) => boolean,
  pairs: Int32Array,
  hasFollowingAt: (next: number) => boolean,
): number {
  const insideQuotes = closingQuotes.length > 0;
  const end = closingDelimiterEnd(input, index, closingQuotes, pairs, brackets);
  const suffix = input.slice(Math.max(0, index + 1 - sentenceSuffixLength), index + 1);
  const {
    closedBrackets,
    containsBracket,
    endsDelimitedSentence,
    endsDelimitedVersus,
    closesQuotation,
  } = closingDelimiterContext(input, index + 1, end, closingQuotes, suffix, brackets, pairs);
  if (end > index + 1 && end <= brackets.bracketQuoteEnd && /\bv\.?s\.$/i.test(suffix)) {
    return -1;
  }
  if (endsDelimitedVersus && closedBrackets < brackets.depth) {
    return -1;
  }
  if (end < input.length && !/\s/.test(input[end])) {
    return isUnspacedSentenceBoundary(
      input,
      index,
      end,
      caseNeutral,
      hasUrlPrefix(end),
      hasFollowingAt,
      endsDelimitedSentence,
      closingQuotes,
      pairs,
    )
      ? end
      : -1;
  }
  if (end === index + 1) {
    return standaloneTerminalEnd(input, end, insideQuotes) === -1
      ? -1
      : colonIntroducedNameBoundary(input, index, caseNeutral);
  }

  if (
    closedBrackets > 0 &&
    (closedBrackets < brackets.depth ||
      !(
        brackets.standalone ||
        closesQuotation ||
        endsDelimitedVersus ||
        /^\s*$/.test(input.slice(end))
      ))
  ) {
    return -1;
  }

  const next = openingDelimiterEnd(input, end);
  if (next === input.length) {
    return end;
  }
  const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
  const continuation = input.slice(next);
  if (
    isDialogueAttribution(
      continuation,
      closesQuotation,
      questionTerminal,
      next,
      input.slice(end, next),
    )
  ) {
    return -1;
  }
  const nextCharacter = characterAt(input, next);
  const startsWithLetter = caseNeutral
    ? isNeutralSentenceStart(input, end, next)
    : charIsUpperCase(nextCharacter);
  const startsWithNumber = isNumericSentenceStart(input, next, gateSuffix, endsDelimitedSentence);
  if (!(startsWithLetter || startsWithNumber)) {
    return -1;
  }

  // Keep bracketed ellipses inside the surrounding sentence.
  if (ellipseReg.test(suffix) && containsBracket) {
    return -1;
  }
  return abbrvReg.test(gateSuffix) &&
    isAbbreviationException(gateSuffix, input.slice(next), endsDelimitedSentence)
    ? -1
    : end;
}

function colonIntroducedNameBoundary(input: string, index: number, caseNeutral: boolean): number {
  if (input[index] !== '.') {
    return index + 1;
  }
  let before = input.slice(Math.max(0, index - 96), index + 1);
  let after = input.slice(index + 1, index + 96);
  if (caseNeutral) {
    // Lowercasing can expand a code point (İ → i + combining dot). Apply the
    // same bounded window to that text so the lowercased input has equal context.
    before = before.toLowerCase().slice(-97);
    after = after.toLowerCase().slice(0, 95);
  }
  const firstInitial = /:\s+\p{Cased}\p{M}*\.$/iu.test(before) && firstAuthorNameReg.test(after);
  const laterInitial = laterAuthorInitialReg.test(before);
  const joinsName =
    (firstInitial || laterInitial) &&
    /^\s+\p{Cased}(?:\p{Mark}|['’\p{Pd}])*\p{Letter}/u.test(after);
  return joinsName ? -1 : index + 1;
}

function isNumericSentenceStart(
  input: string,
  next: number,
  suffix: string,
  endsDelimitedSentence: boolean,
): boolean {
  const delimitedVersus = endsDelimitedSentence && /\bv\.?s\.$/i.test(suffix);
  return (
    /^\p{Number}$/u.test(characterAt(input, next)) &&
    (!abbrvReg.test(suffix) || delimitedVersus) &&
    !/^\S+(?:\s*%|\s+(?:time|year)s?\b|\s+(?:month|week|day|hour|minute|second|star|point|percent)s?(?=\s*[.!?](?:\s|$)|\s*$))/iu.test(
      input.slice(next),
    )
  );
}

const auxiliaryPrefixReg =
  /^(?:(?:am|is|are|was|were|be|been|being|has|have|had|will|would|could|should|must)(?:n['’]t)?|can(?:not|['’]t)?|won['’]t)\b/i;

function isDialogueAttribution(
  input: string,
  closesQuotation: boolean,
  questionTerminal: (start: number) => boolean,
  start: number,
  leadingDelimiters: string,
): boolean {
  const auxiliary = input.match(auxiliaryPrefixReg);
  if (
    !closesQuotation ||
    /["'“‘„«‹]|``/.test(leadingDelimiters) ||
    (auxiliary !== null && questionTerminal(start))
  ) {
    return false;
  }
  const aloud = input.match(/^aloud\b(?:\s*,\s*)?/i);
  if (aloud !== null) {
    return !aloud[0].includes(',') || isReportingAttribution(input.slice(aloud[0].length));
  }
  return (
    (auxiliary !== null &&
      /^\s+(?!(?:i|we|he|she|they|you|it|this|that|these|those)\b)/i.test(
        input.slice(auxiliary[0].length),
      )) ||
    isReportingAttribution(input)
  );
}

function isReportingAttribution(input: string): boolean {
  return (
    /^(?:(?!(?:am|is|are|was|were|be|been|being|has|have|had)\b)[\p{Letter}\p{Mark}'’-]+\s+){1,3}(?:said|thought|asked|replied|answered)(?:\s+(?:[\p{Letter}\p{Mark}]+ly|me|you|him|her|us|them))*(?=\s*[,.;!?]|\s*$)/iu.test(
      input,
    ) ||
    /^(?:said|thought|asked|replied|answered)\s+[\p{Letter}\p{Mark}'’-]+(?:\s+[\p{Letter}\p{Mark}'’-]+){0,2}(?=\s*[,.;!?]|\s*$)/iu.test(
      input,
    )
  );
}

/** A literal angle opener precedes a letter or an already-confirmed quoted span. */
function isOpeningSentenceBracket(input: string, index: number, nextQuoteEnd = 0): boolean {
  return (
    openingBracketReg.test(input[index]) &&
    (input[index] !== '<' ||
      nextQuoteEnd > 0 ||
      /^\p{Letter}$/u.test(characterAt(input, index + 1)))
  );
}

interface SentenceTerminal extends RegExpExecArray {
  enclosed?: boolean;
}

/** Advance enclosure context and terminal matches together, without rescanning source tails. */
function unquotedTerminalScanner(
  input: string,
  pairs: Int32Array,
  caseNeutral: boolean,
): (start: number, argumentStart: number) => SentenceTerminal | null {
  const terminals = /\.{2,}|[.!?]/g;
  let cursor = 0;
  let quotedThrough = -1;
  let bracketDepth = 0;
  let bracketStart = -1;
  const matchEnclosedTerminal = (index: number): SentenceTerminal | null => {
    terminals.lastIndex = index;
    const match: SentenceTerminal | null = terminals.exec(input);
    if (match !== null) {
      match.enclosed = true;
    }
    return match;
  };
  const advanceContext = (end: number, start: number, argumentStart: number): number => {
    while (cursor <= end) {
      const index = cursor++;
      if (pairs[index] > 0) {
        quotedThrough = Math.max(quotedThrough, pairs[index] - 1);
      }
      if (index <= quotedThrough) {
        continue;
      }
      if (isOpeningSentenceBracket(input, index, pairs[index + 1])) {
        if (bracketDepth === 0) {
          bracketStart = index;
        }
        bracketDepth++;
        continue;
      }
      if (!closingBracketReg.test(input[index]) || bracketDepth === 0) {
        continue;
      }
      bracketDepth--;
      if (bracketDepth > 0) {
        continue;
      }
      const enclosedIndex = enclosedTerminal(
        input,
        index,
        caseNeutral,
        bracketStart === argumentStart,
      );
      if (enclosedIndex >= start) {
        return enclosedIndex;
      }
    }
    return -1;
  };
  return (start, argumentStart) => {
    terminals.lastIndex = start;
    let terminal = terminals.exec(input);
    do {
      // Scan through EOF as well: a final bracket can supply the enclosing terminal.
      const enclosedIndex = advanceContext(
        terminal?.index ?? input.length - 1,
        start,
        argumentStart,
      );
      if (enclosedIndex >= start) {
        return matchEnclosedTerminal(enclosedIndex);
      }
      if (terminal === null) {
        return null;
      }
      if (terminal.index >= quotedThrough && bracketDepth === 0) {
        return terminal;
      }
      if (terminal.index < quotedThrough) {
        const enclosedIndex =
          bracketDepth === 0 ? enclosedTerminal(input, quotedThrough, caseNeutral) : -1;
        cursor = quotedThrough + 1;
        if (enclosedIndex >= terminal.index) {
          return matchEnclosedTerminal(enclosedIndex);
        }
        terminals.lastIndex = quotedThrough + 1;
      }
      terminal = terminals.exec(input);
    } while (terminal !== null || cursor < input.length);
    return null;
  };
}

/** A terminal at the end of an enclosure can terminate its surrounding predicate. */
function enclosedTerminal(
  input: string,
  enclosureEnd: number,
  caseNeutral: boolean,
  allowProseBoundary = true,
): number {
  let terminal = enclosureEnd - 1;
  while (terminal >= 0 && /[\s"'”’“»›\])}>]/.test(input[terminal])) {
    terminal--;
  }
  if (!/[.!?]/.test(input[terminal] ?? '')) {
    return -1;
  }
  while (input[terminal] === '.' && input[terminal - 1] === '.') {
    terminal--;
  }
  let end = enclosureEnd + 1;
  while (end < input.length && /['”’“»›\])}>]/.test(input[end])) {
    end++;
  }
  const next = openingDelimiterEnd(input, end);
  const character = characterAt(input, next);
  const explicitBreak = /[\r\n"'‘“„«‹]|``/.test(input.slice(end, next));
  const boundary =
    (allowProseBoundary || explicitBreak) &&
    (input[terminal] === '?' || explicitBreak || auxiliaryPrefixReg.test(input.slice(next)));
  return next === input.length ||
    (boundary &&
      ((caseNeutral ? isNeutralSentenceStart(input, end, next) : charIsUpperCase(character)) ||
        isNumericSentenceStart(input, next, '?', false)))
    ? terminal
    : -1;
}

function auxiliaryArgumentStart(input: string, start: number): number {
  let end = start + (input.slice(start).match(auxiliaryPrefixReg)?.[0].length ?? 0);
  while (/\s/.test(input[end] ?? '')) {
    end++;
  }
  return end;
}

function isQuestionAbbreviation(
  input: string,
  terminal: SentenceTerminal,
  caseNeutral: boolean,
): boolean {
  if (terminal[0] !== '.') {
    return false;
  }
  const suffix = input.slice(
    Math.max(0, terminal.index + 1 - sentenceSuffixLength),
    terminal.index + 1,
  );
  const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
  return terminal.enclosed
    ? abbrvReg.test(gateSuffix) && excepReg.test(gateSuffix)
    : abbrvReg.test(gateSuffix) ||
        matchesAcronymSuffix(suffix, suffix.match(/\S+$/)?.[0] ?? '', true);
}

/** Reuse the next real terminal across monotone quotation-boundary lookaheads. */
function questionTerminalChecker(
  input: string,
  ellipses: SpacedEllipsisRange[],
  caseNeutral: boolean,
  pairs: Int32Array,
  markerPeriods?: Uint8Array,
): (start: number) => boolean {
  const nextTerminal = unquotedTerminalScanner(input, pairs, caseNeutral);
  const hasUrlPrefix = urlPrefixChecker(input);
  const hasFollowingAt = followingAtChecker(input);
  const ellipsisCursor = { index: 0 };
  let through = -1;
  let question = false;
  return (start) => {
    if (start <= through) {
      return question;
    }
    through = input.length;
    question = false;
    // Callers already recognized an auxiliary; its bounded word and following
    // whitespace precede any later query start, so these prefix scans are disjoint.
    const argumentStart = auxiliaryArgumentStart(input, start);
    let terminal = nextTerminal(start, argumentStart);
    while (terminal !== null) {
      if (
        markerPeriods?.[terminal.index] === 1 ||
        (terminal[0].length > 1 && terminal[0].length !== 4) ||
        isProtectedEllipsisPeriod(terminal.index, ellipses, ellipsisCursor)
      ) {
        terminal = nextTerminal(terminal.index + terminal[0].length, argumentStart);
        continue;
      }
      const following = characterAt(input, terminal.index + 1);
      const insideUrl = hasUrlPrefix(terminal.index + 1);
      if (
        (terminal[0].length === 1 && insideUrl && /^[^\s"'`”’“»›\])}>]$/u.test(following)) ||
        ((/^[\p{Letter}\p{Mark}\p{Number}]$/u.test(following) ||
          (terminal[0] === '.' && !terminal.enclosed && openingBracketReg.test(following))) &&
          !isUnspacedSentenceBoundary(
            input,
            terminal.index,
            terminal.index + 1,
            caseNeutral,
            insideUrl,
            hasFollowingAt,
          ))
      ) {
        terminal = nextTerminal(terminal.index + terminal[0].length, argumentStart);
        continue;
      }
      if (!isQuestionAbbreviation(input, terminal, caseNeutral)) {
        through = terminal.index;
        question = terminal[0] === '?';
        break;
      }
      terminal = nextTerminal(terminal.index + terminal[0].length, argumentStart);
    }
    return question;
  };
}

function standaloneTerminalEnd(input: string, end: number, insideQuotes: boolean): number {
  return insideQuotes && !/[\r\n]/.test(input[end] ?? '') ? -1 : end;
}

function closingDelimiterContext(
  input: string,
  start: number,
  end: number,
  closingQuotes: string,
  suffix: string,
  brackets: BracketContext,
  pairs: Int32Array,
): {
  closedBrackets: number;
  containsBracket: boolean;
  endsDelimitedSentence: boolean;
  endsDelimitedVersus: boolean;
  closesQuotation: boolean;
} {
  let closedBrackets = 0;
  let containsBracket = false;
  let closesQuote = false;
  let pendingQuotes = closingQuotes;
  for (let index = start; index < end; index++) {
    const closing = pairedClosingQuote(input, index, pairs);
    if (closing !== undefined) {
      pendingQuotes = pendingQuotes.replace(closing, '');
    }
    if (
      closingBracketReg.test(input[index]) &&
      (input[index] !== '>' || brackets.angles?.[index] === 1)
    ) {
      containsBracket = true;
      closedBrackets += Number(pendingQuotes.length === 0 && index >= brackets.bracketQuoteEnd);
    }
    closesQuote ||=
      pendingQuotes.length === 0 &&
      index >= brackets.bracketQuoteEnd &&
      (input[index] === "'" || (closingQuotes.length > 0 && closing !== undefined));
  }
  const endsDelimitedSentence =
    closesQuote || (brackets.standalone && closedBrackets > 0 && closedBrackets >= brackets.depth);
  return {
    closedBrackets,
    containsBracket,
    endsDelimitedSentence,
    endsDelimitedVersus: endsDelimitedSentence && /\bv\.?s\.$/i.test(suffix),
    closesQuotation:
      closingQuotes.length > 0 &&
      (closingQuotes.includes(input[end - 1]) || input.slice(end - 2, end) === "''"),
  };
}

/** Skip opening delimiters, treating the Treebank opener as one two-character token. */
function openingDelimiterEnd(input: string, start: number, allowWhitespace = true): number {
  let next = start;
  while (next < input.length) {
    if (/["'“‘„«‹([{<]/.test(input[next]) || (allowWhitespace && /\s/.test(input[next]))) {
      next++;
    } else if (input.startsWith('``', next)) {
      next += 2;
    } else {
      break;
    }
  }
  return next;
}

function isUnspacedDelimitedSentenceStart(
  input: string,
  index: number,
  caseNeutral: boolean,
): boolean {
  const start = index + 1;
  const next = openingDelimiterEnd(input, start, false);
  if (next === start) {
    return false;
  }
  if (/^(?:\[\p{Number}+\]|\(\p{Number}+\))/u.test(input.slice(start))) {
    return false;
  }
  const character = characterAt(input, next);
  return (
    character.length > 0 &&
    (/^\p{Number}$/u.test(character) ||
      (caseNeutral ? isCasedCharacter(character) : charIsUpperCase(character)))
  );
}

/** Keep URL-prefix context across arbitrarily long tokens for one monotone consumer. */
function urlPrefixChecker(input: string): (end: number) => boolean {
  const context = /\s|https?:\/\/|www\./gi;
  let next = context.exec(input);
  let insideUrl = false;
  return (end) => {
    while (next !== null && next.index + next[0].length <= end) {
      insideUrl = !/\s/.test(next[0]);
      next = context.exec(input);
    }
    return insideUrl;
  };
}

/** Cache the last @ in each whitespace-delimited token for one monotone consumer. */
function followingAtChecker(input: string): (next: number) => boolean {
  let end = 0;
  let lastAt = -1;
  return (next) => {
    if (next >= end) {
      end = next;
      lastAt = -1;
      while (end < input.length && !/\s/.test(input[end])) {
        if (input[end] === '@') {
          lastAt = end;
        }
        end++;
      }
    }
    return lastAt >= next;
  };
}

function precedingIdentifierToken(input: string, index: number): string {
  let tokenStart = index;
  while (tokenStart > 0) {
    const previousUnit = input.charCodeAt(tokenStart - 1);
    const width = previousUnit >= 0xdc_00 && previousUnit <= 0xdf_ff ? 2 : 1;
    const character = input.slice(tokenStart - width, tokenStart);
    if (!/^[\p{Letter}\p{Mark}\p{Number}_-]$/u.test(character)) {
      break;
    }
    tokenStart -= width;
  }
  return input.slice(tokenStart, index);
}

function hasCaseNeutralTrailingInitial(input: string, index: number, tokenLength: number): boolean {
  let start = index - tokenLength;
  // A cased symbol can precede the token's marks; include its predecessor too.
  for (let context = 0; context < 2 && start > 0; context++) {
    const previous = input.codePointAt(start - 2);
    start -= previous !== undefined && previous > 0xff_ff ? 2 : 1;
  }
  return /(?:^|[^\p{Letter}\p{Mark}\p{Number}_-])(?!\p{Mark})\p{Cased}\p{M}*$/u.test(
    input.slice(start, index),
  );
}

function caseNeutralIdentifierContext(token: string): boolean {
  if (!/\p{Cased}/u.test(token)) {
    return false;
  }
  return (
    hasStableAsciiIdentifierEvidence(token) ||
    (/\p{Script=Latin}/u.test(token) && /(?:\p{Script=Greek}|(?=\p{Mark})\p{Cased})/u.test(token))
  );
}

function isDottedIdentifierContinuation(input: string): boolean {
  let cursor = 0;
  for (let atoms = 0; atoms < 2; atoms++) {
    const base = characterAt(input, cursor);
    if (!/^[\p{Cased}\p{Number}_-]$/u.test(base)) {
      return false;
    }
    cursor += base.length;
    let next = characterAt(input, cursor);
    if (base === 'İ' || next === '\u0307') {
      // A marked atom accepts the entire mark run; splitting it into another atom
      // cannot extend that run and needlessly introduces backtracking.
      while (/^\p{Mark}$/u.test(next)) {
        cursor += next.length;
        next = characterAt(input, cursor);
      }
    }
    if (next === '' || /^[\s/.]$/u.test(next)) {
      return true;
    }
  }
  return false;
}

function hasStableAsciiIdentifierEvidence(token: string): boolean {
  for (let cursor = 0; cursor < token.length; cursor++) {
    const code = token.charCodeAt(cursor);
    if ((code >= 48 && code <= 57) || code === 95) {
      return true;
    }
    const lowerCode = code === 0x21_2a ? 107 : code | 32;
    if (lowerCode < 97 || lowerCode > 122) {
      continue;
    }
    if (/^\p{Mark}$/u.test(characterAt(token, cursor + 1))) {
      continue;
    }
    return true;
  }
  return false;
}

function isUnspacedSentenceBoundary(
  input: string,
  index: number,
  next: number,
  caseNeutral: boolean,
  insideUrl: boolean,
  hasFollowingAt: (next: number) => boolean,
  endsDelimitedSentence = false,
  closingQuotes = '',
  pairs?: Int32Array,
): boolean {
  if (pairs !== undefined && remainsInsideQuotation(input, index, next, closingQuotes, pairs)) {
    return false;
  }
  if (isUnspacedDelimitedSentenceStart(input, next - 1, caseNeutral)) {
    return true;
  }
  const nextCharacter = characterAt(input, next);
  const startsWithLetter = caseNeutral
    ? isCasedCharacter(nextCharacter)
    : charIsUpperCase(nextCharacter);
  if (!(startsWithLetter || (input[index] !== '.' && /^\p{Number}$/u.test(nextCharacter)))) {
    return false;
  }
  const precedingToken = input.slice(Math.max(0, index - 320), next).match(/\S+$/)?.[0] ?? '';
  if (input[index] !== '.') {
    return !insideUrl;
  }

  const suffix = input.slice(Math.max(0, index + 1 - sentenceSuffixLength), index + 1);
  const token = caseNeutral ? precedingIdentifierToken(input, index) : '';
  const following = input.slice(next);
  const insideAddress =
    precedingToken.includes('@') && !/@[^\s.]+(?:\.[^\s.]+)+\.$/u.test(precedingToken);
  const insideHostname = isHostnameContinuation(following, caseNeutral, insideUrl);
  const dottedIdentifier = caseNeutral
    ? caseNeutralIdentifierContext(token) && isDottedIdentifierContinuation(following)
    : /\b\p{Lu}[\p{Letter}\p{Number}_-]*\.$/u.test(suffix) &&
      /^[\p{Lu}\p{Number}_-]+(?=\s|[/.]|$)/u.test(following);
  const initial = caseNeutral ? /^\p{Cased}\p{M}*\./u : /^\p{Lu}\./u;
  const trailingInitial = caseNeutral
    ? hasCaseNeutralTrailingInitial(input, index, token.length)
    : /\b\p{Lu}\.$/u.test(suffix);
  const nextInitial = caseNeutral
    ? /^(?![ai](?:\s|$))\p{Cased}\p{M}*(?=\s|$)/iu
    : /^\p{Lu}(?=\s|$)/u;
  const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
  const contextChangingGreekInitial = /^[Σσς]\p{M}+\.\p{Case_Ignorable}*\p{Cased}/u.test(following);
  const continuesAbbreviation =
    abbrvReg.test(gateSuffix) &&
    (isAbbreviationException(gateSuffix, following, endsDelimitedSentence) ||
      (geographicAcronymReg.test(gateSuffix) && unspacedGeographicContinuationReg.test(following)));
  return !(
    continuesAbbreviation ||
    ((initial.test(following) || dottedIdentifier) && !contextChangingGreekInitial) ||
    (trailingInitial && nextInitial.test(following)) ||
    insideAddress ||
    insideHostname ||
    hasFollowingAt(next)
  );
}

function isHostnameContinuation(
  following: string,
  caseNeutral: boolean,
  insideUrl: boolean,
): boolean {
  const hostnameLabel = following.match(
    /^(com|org|net|edu|gov|mil|io|dev|app|co|uk|us|ca|ai|info|biz|me|tv)(?=[/.\s]|$)/i,
  )?.[0];
  return (
    insideUrl ||
    (hostnameLabel !== undefined &&
      (caseNeutral ||
        hostnameLabel === hostnameLabel.toLowerCase() ||
        hostnameLabel === hostnameLabel.toUpperCase()))
  );
}

function isNeutralSentenceStart(input: string, previousEnd: number, next: number): boolean {
  if (!isCasedCharacter(characterAt(input, next))) {
    return false;
  }

  const continuation = input.slice(next);
  return (
    !sentenceContinuationReg.test(continuation) ||
    independentSentenceReg.test(continuation) ||
    input.slice(previousEnd, next).includes('"')
  );
}

function trimSpaces(input: string): string {
  let start = 0;
  while (start < input.length && input[start] === ' ') {
    start++;
  }
  return trimEndSpaces(input.slice(start));
}

function trimEndSpaces(input: string): string {
  let end = input.length;
  while (end > 0 && input[end - 1] === ' ') {
    end--;
  }
  return input.slice(0, end);
}

/**
 * Checks if a string is titlecase
 * @method strIsTitleCase
 * @param  {string}   input       The string to be checked
 * @return {boolean}              True if the string is titlecase and false otherwise
 */
export function strIsTitleCase(input: string): boolean {
  const firstChar = characterAt(input.trim(), 0);
  return firstChar.length > 0 && charIsUpperCase(firstChar);
}

/**
 * Checks if a character is uppercase (i18n-compatible)
 * @method charIsUpperCase
 * @param  {string}   input     The character to be tested
 * @return {boolean}            True if the character is uppercase and false otherwise.
 */
export function charIsUpperCase(input: string): boolean {
  const value = characterAt(input, 0);
  if (value.length === 0 || value.length !== input.length) {
    throw new RangeError('Input should be a single character');
  }

  // Some Uppercase-property symbols have no JavaScript case mapping; preserve the legacy result.
  return (
    upperOrTitleCaseLetterReg.test(value) ||
    (upperCaseReg.test(value) && value.toUpperCase() === value && value.toLowerCase() !== value)
  );
}

function characterAt(input: string, index: number): string {
  const codePoint = input.codePointAt(index);
  return codePoint === undefined ? '' : String.fromCodePoint(codePoint);
}

function isCasedCharacter(input: string): boolean {
  return casedCharacterReg.test(input);
}

function matchesAcronymSuffix(suffix: string, lastWord: string, caseNeutral: boolean): boolean {
  return caseNeutral ? caseNeutralAcronymReg.test(lastWord) : acronymReg.test(suffix);
}

function isPageNumberContinuation(lastWord: string, nextSentence: string): boolean {
  return lastWord.toLowerCase() === 'p.' && pageNumberContinuationReg.test(nextSentence);
}

function startsWithCasedCharacter(input: string): boolean {
  return isCasedCharacter(characterAt(input.trim(), 0));
}

/**
 * Computes the factorial of an integer from 0 through 170.
 *
 * Values above 170 are rejected because their factorials overflow
 * JavaScript's finite number range.
 *
 * @method fact
 * @param  {number} x     The integer for which the factorial is to be computed
 * @return {number}       The finite factorial result
 */
export function fact(x: number): number {
  if (!Number.isInteger(x) || x < 0 || x > 170) {
    throw new RangeError('Input must be an integer between 0 and 170');
  }

  let result = 1;
  // Preserve the floating-point multiplication order of the former recursive implementation.
  for (let factor = x; factor >= 2; factor--) {
    result *= factor;
  }
  return result;
}

/**
 * Returns the skip bigrams for an array of word tokens.
 *
 * @method skipBigram
 * @param  {Array<string>}    tokens      An array of word tokens
 * @param  {number}           maxSkip     Maximum token index distance; 1 includes adjacent words. Defaults to Infinity (all pairs).
 * @return {Array<string>}                An array of skip bigram strings
 */
export function skipBigram(tokens: string[], maxSkip: number = Number.POSITIVE_INFINITY): string[] {
  validateMaxSkip(maxSkip);
  if (tokens.length < 2) {
    throw new RangeError('Input must have at least two words');
  }

  const distance = Math.min(maxSkip, tokens.length - 1);
  let work = distance * tokens.length - (distance * (distance + 1)) / 2;
  for (let index = 0; index < tokens.length && work <= 1_000_000; index++) {
    work +=
      tokens[index].length *
      (Math.min(distance, index) + Math.min(distance, tokens.length - index - 1));
  }
  if (work > 1_000_000) {
    throw new RangeError('Skip-bigram generation exceeds the materialization limit');
  }

  const acc: string[] = [];
  for (let baseIdx = 0; baseIdx < tokens.length - 1; baseIdx++) {
    const maxIdx = Math.min(baseIdx + 1 + maxSkip, tokens.length);
    for (let sweepIdx = baseIdx + 1; sweepIdx < maxIdx; sweepIdx++) {
      acc.push(`${tokens[baseIdx]} ${tokens[sweepIdx]}`);
    }
  }

  return acc;
}

interface NGramOptions {
  start: boolean;
  end: boolean;
  val: string;
}

export const NGRAM_DEFAULT_OPTS: NGramOptions = {
  start: false,
  end: false,
  val: '<S>',
};

/**
 * Returns n-grams for an array of word tokens.
 *
 * @method nGram
 * @param  {Array<string>}          tokens    An array of word tokens
 * @param  {number}                 n         The size of the n-gram. Defaults to 2.
 * @param  {Object}                 pad       String padding options. See example.
 * @return {Array<string>}                    An array of n-gram strings
 */
export function nGram(tokens: string[], n = 2, pad: Partial<NGramOptions> = {}): string[] {
  validateNGramSize(n);

  const start = pad.start ?? NGRAM_DEFAULT_OPTS.start;
  const end = pad.end ?? NGRAM_DEFAULT_OPTS.end;
  const value = pad.val ?? NGRAM_DEFAULT_OPTS.val;
  const paddingSize = n - 1;
  const startPaddingSize = start ? paddingSize : 0;
  const endPaddingSize = end ? paddingSize : 0;
  const paddingLength = startPaddingSize + endPaddingSize;
  const paddedLength = tokens.length + paddingLength;
  if (paddedLength < n) {
    throw new RangeError('ngram size cannot be larger than the number of tokens available');
  }

  const gramCount = paddedLength - n + 1;
  validateNGramMaterialization(tokens, n, startPaddingSize, endPaddingSize, value);

  const startPadding = new Array<string>(startPaddingSize).fill(value);
  const endPadding = new Array<string>(endPaddingSize).fill(value);
  const workingTokens = paddingLength === 0 ? tokens : startPadding.concat(tokens, endPadding);

  const acc: string[] = [];
  for (let idx = 0; idx < gramCount; idx++) {
    acc.push(workingTokens.slice(idx, idx + n).join(' '));
  }

  return acc;
}

/**
 * Calculates C(val, 2), i.e. the number of ways 2
 * items can be chosen from `val` items.
 *
 * @method comb2
 * @param  {number} val     The total number of items to choose from
 * @return {number}         The number of ways in which 2 items can be chosen from `val`
 */
export function comb2(val: number): number {
  if (!Number.isSafeInteger(val) || val < 2) {
    throw new RangeError('Input must be a safe integer greater than or equal to 2');
  }
  const result = (val * (val - 1)) / 2;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Result exceeds Number.MAX_SAFE_INTEGER');
  }
  return result;
}

/**
 * Computes the arithmetic mean of an array
 * @method arithmeticMean
 * @param  {Array<number>}   input    Data distribution
 * @return {number}                   The mean of the distribution
 */
export function arithmeticMean(input: number[]): number {
  if (input.length === 0) {
    throw new RangeError('Input array must have at least 1 element');
  }
  const sum = input.reduce((x, y) => x + y);
  if (Number.isFinite(sum) || !input.every(Number.isFinite)) {
    return sum / input.length;
  }

  // Sum exact multiples of 2^-1074 only when ordinary addition overflows.
  const view = new DataView(new ArrayBuffer(8));
  const implicitBit = 1n << 52n;
  const total = input.reduce((acc, value) => {
    view.setFloat64(0, value);
    const bits = view.getBigUint64(0);
    const exponent = Number((bits >> 52n) & 0x7ffn);
    const fraction = bits & (implicitBit - 1n);
    const significand = exponent === 0 ? fraction : fraction + implicitBit;
    const units = significand << BigInt(Math.max(0, exponent - 1));
    return acc + (value < 0 ? -units : units);
  }, 0n);

  const negative = total < 0n;
  const magnitude = negative ? -total : total;
  const count = BigInt(input.length);
  const shift = Math.max(0, (magnitude / count).toString(2).length - 53);
  const denominator = count << BigInt(shift);
  let significand = magnitude / denominator;
  const remainder = magnitude % denominator;
  // Round once to the nearest double, breaking exact ties toward an even significand.
  if (2n * remainder > denominator || (2n * remainder === denominator && significand % 2n === 1n)) {
    significand++;
  }
  return (negative ? -1 : 1) * Number(significand) * 2 ** (shift - 1074);
}

/**
 * Scores each candidate against a fixed reference, then applies test to the
 * leave-one-out maxima (arithmetic mean by default). Requires at least two candidates.
 * Calls func(candidate, ref) once per candidate.
 *
 * For reference resampling, preserve scorer argument order with
 * jackKnife(references, candidate, (reference, summary) => scorer(summary, reference)).
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
export function jackKnife(
  cands: string[],
  ref: string,
  func: (x: string, y: string) => number,
  test: (x: number[]) => number = arithmeticMean,
): number {
  if (cands.length < 2) {
    throw new RangeError('Candidate array must contain more than one element');
  }

  const scores = cands.map((candidate) => func(candidate, ref));

  const suffixMax = new Array<number>(scores.length + 1);
  suffixMax[scores.length] = Number.NEGATIVE_INFINITY;
  for (let idx = scores.length - 1; idx >= 0; idx--) {
    suffixMax[idx] = Math.max(suffixMax[idx + 1], scores[idx]);
  }

  const leaveOneOutMaxima = new Array<number>(scores.length);
  let prefixMax = Number.NEGATIVE_INFINITY;
  for (let idx = 0; idx < scores.length; idx++) {
    leaveOneOutMaxima[idx] = Math.max(prefixMax, suffixMax[idx + 1]);
    prefixMax = Math.max(prefixMax, scores[idx]);
  }

  return test(leaveOneOutMaxima);
}

/**
 * Calculates the ROUGE f-measure for a given precision
 * and recall score.
 *
 * Uses the standard F-beta formula:
 * F_β = ((1 + β²) × P × R) / (β² × P + R)
 *
 * Beta controls the tradeoff between precision and recall:
 * - beta = 0: Pure precision when recall is positive; zero when recall is zero
 * - beta = 1: F1 score (harmonic mean, equal weight)
 * - beta = 2: F2 score (weighs recall twice as much as precision)
 * - beta = Infinity: Pure recall
 *
 * @method fMeasure
 * @param  {number}     p       Precision score (0 to 1)
 * @param  {number}     r       Recall score (0 to 1)
 * @param  {number}     beta    Weighing value (precision vs. recall). Defaults to 1.0 (F1).
 * @return {number}             Computed f-score
 */
export function fMeasure(p: number, r: number, beta = 1.0): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new RangeError('Precision value p must have bounds 0 ≤ p ≤ 1');
  }
  if (!Number.isFinite(r) || r < 0 || r > 1) {
    throw new RangeError('Recall value r must have bounds 0 ≤ r ≤ 1');
  }
  validateBeta(beta);

  // Handle special cases
  if (p === r) {
    return p;
  }
  if (beta === Number.POSITIVE_INFINITY) {
    return r; // β → ∞ means pure recall
  }
  if (p === 0 || r === 0) {
    return 0;
  }

  if (beta === 0) {
    return p;
  }

  // F-beta(P, R) = F-(1/beta)(R, P). This keeps the weight at least one.
  if (beta < 1) {
    return fMeasure(r, p, 1 / beta);
  }
  // Scale by the smaller score instead of multiplying precision and recall.
  // Roundoff can overshoot the larger score, so bound each scaled result.
  if (p > r) {
    const inverseBeta = 1 / beta;
    const weight = inverseBeta * inverseBeta;
    return Math.min(p, r * ((1 + weight) / (1 + weight * (r / p))));
  }

  const betaSq = beta * beta;
  if (Number.isFinite(betaSq)) {
    return Math.min(r, p * ((1 + betaSq) / (1 + betaSq * (p / r))));
  }

  // Multiplying precision by beta first rescales even the smallest subnormal.
  // Here 1 / beta² is too small to affect the rounded numerator weight.
  const ratio = ((p * beta) / r) * beta;
  return ratio === Number.POSITIVE_INFINITY ? r : r * (ratio / (1 + ratio));
}

/**
 * Computes the set intersection of two arrays
 *
 * @method intersection
 * @template T
 * @param  {Array<T>}    a     The first array
 * @param  {Array<T>}    b     The second array
 * @return {Array<T>}          Elements common to both the first and second array
 */
export function intersection<T>(a: T[], b: T[]): T[] {
  const test = new Set(a);
  const ref = new Set(b);

  return Array.from(test).filter((elem): elem is T => ref.has(elem));
}

/**
 * Computes the longest common subsequence for two arrays.
 * This function returns the elements from the two arrays
 * that form the LCS, in order of their appearance.
 *
 * @method lcs
 * @param  {Array<string>}    a     The first array
 * @param  {Array<string>}    b     The second array
 * @return {Array<string>}          The longest common subsequence between the first and second array
 */
export function lcs(a: string[], b: string[]): string[] {
  return lcsIndices(a, b).map((index) => b[index]);
}
