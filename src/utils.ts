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
      (opensDoubleQuote(text, index, insideQuotes) &&
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
  return !insideQuotes && (index === 0 || /[\s([{<]/.test(input[index - 1]));
}

function quotationState(input: string, index: number, insideQuotes: boolean): boolean {
  if (input[index] === '"') {
    return opensDoubleQuote(input, index, insideQuotes);
  }
  if (input.startsWith('``', index)) {
    return true;
  }
  if (!input.startsWith("''", index)) {
    return insideQuotes;
  }
  return (
    !insideQuotes &&
    opensDoubleQuote(input, index, false) &&
    /^[\p{Letter}\p{Number}\p{Sc}\p{Ps}]$/u.test(characterAt(input, index + 2)) &&
    input.slice(index + 2).includes("''")
  );
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const abbrvReg = new RegExp(`\\b(${GATE_SUBSTITUTIONS.map(escapeRegExp).join('|')})[.!?] ?$`, 'i');
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
const closingDelimiterReg = /[\])}>"']/;
const openingBracketReg = /[([{<]/;
const closingBracketReg = /[\])}>]/;
const listMarkerReg =
  /(?:^|\s)(?:(?:[•⁃]\s*|[-*+]\s+)?\d+|\p{Cased}\p{M}*)(?:\.\)|[.)])(?=\s+\S)/gu;
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
const geographicContinuationReg = /^(?:government|army|navy|military|congress)\b/i;
const sentenceContinuationReg =
  /^(?:and|or|but|nor|for|yet|so|at|in|on|of|to|from|with|by|as|then|because|while|after|before|although|though|since|unless|until|when|where|whether|if|once|whereas)\b/i;
const independentSentenceReg =
  /^(?:in\s+(?:fact|time)\b|\p{Letter}+\s+[^,.!?]{1,120},|(?:and|but|or|yet|so|then)\s+(?:(?:i|we|he|she|they|you|it)\b|(?:(?:the|a|an|my|our|their|his|her)\s+)?(?!(?:more|later|moved)\b)[\p{Letter}\p{Mark}'’-]+\s+[\p{Letter}\p{Mark}'’-]+\b))/iu;

/** Keep merged fragments separate; boundary rules only need a suffix and word casing. */
class SentenceBuffer {
  readonly #caseNeutral: boolean;
  #parts: string[] = [];
  #normalizedThrough = 0;
  #words: { titleCase: boolean; lowerCase: boolean }[] = [];
  #openingDelimiters: string[] = [];
  #insideDoubleQuotes = false;
  #insideSingleQuotes = false;
  #lastCharacter = '';
  hasLineBreaks = false;
  startsWithTitleCase = false;

  constructor(text: string, caseNeutral: boolean) {
    this.#caseNeutral = caseNeutral;
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
    return (
      this.#openingDelimiters.length > 0 || this.#insideDoubleQuotes || this.#insideSingleQuotes
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
      if (character === '"') {
        const previous = index === 0 ? this.#lastCharacter : text[index - 1];
        this.#insideDoubleQuotes =
          !this.#insideDoubleQuotes &&
          (previous.length === 0 || /^[\s\p{Punctuation}]$/u.test(previous));
      } else if (character === "'") {
        this.#trackSingleQuote(text, index);
      } else if (
        !(this.#insideDoubleQuotes || this.#insideSingleQuotes) &&
        openingBracketReg.test(character) &&
        (character !== '<' || /^\p{Letter}$/u.test(characterAt(text, index + 1)))
      ) {
        this.#openingDelimiters.push(character);
      } else if (
        !(this.#insideDoubleQuotes || this.#insideSingleQuotes) &&
        closingBracketReg.test(character)
      ) {
        const opener = '([{<'[')]}>'.indexOf(character)];
        if (this.#openingDelimiters.at(-1) === opener) {
          this.#openingDelimiters.pop();
        }
      }
    }
    this.#lastCharacter = text.at(-1) ?? this.#lastCharacter;
  }

  #trackSingleQuote(text: string, index: number): void {
    const previous = index === 0 ? this.#lastCharacter : text[index - 1];
    const following = text[index + 1] ?? '';
    if (this.#insideSingleQuotes) {
      const possessive =
        previous.toLowerCase() === 's' &&
        /\s/.test(following) &&
        /^(?:\p{Lu}|\p{Ll}+\s+\p{Lu})/u.test(text.slice(index + 1).trimStart());
      this.#insideSingleQuotes =
        possessive || (following.length > 0 && !/[\s.,!?;:)\]}]/.test(following));
      return;
    }
    this.#insideSingleQuotes =
      (previous.length === 0 || /^[\s\p{Punctuation}]$/u.test(previous)) && /\S/.test(following);
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
  const chunks = sentenceChunks(
    normalizedInput,
    caseNeutral,
    (options as InternalSentenceSegmentOptions)[skipListDetection]
      ? nestedMarkerPeriods(normalizedInput, caseNeutral)
      : undefined,
  );

  const acc: string[] = [];
  let pending: SentenceBuffer | undefined;
  for (let idx = 0; idx < chunks.length; idx++) {
    if (pending || chunks[idx]) {
      const chunk = pending ?? new SentenceBuffer(chunks[idx], caseNeutral);
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
        const nextSentence = nextChunk?.replace(/^[\s"'([{<]+/, '');
        const abbreviation = gateSuffix.trimEnd();
        if (
          nextSentence &&
          abbrvReg.test(abbreviation) &&
          !excepReg.test(abbreviation) &&
          (caseNeutral
            ? startsWithCasedCharacter(nextSentence) &&
              (!sentenceContinuationReg.test(nextSentence) ||
                independentSentenceReg.test(nextSentence))
            : strIsTitleCase(nextSentence)) &&
          !chunk.hasOpenDelimiter
        ) {
          chunk.normalizeWhitespace();
          acc.push(chunk.text());
        } else if (
          nextChunk &&
          (chunk.startsWithTitleCase ||
            (caseNeutral &&
              sentenceContinuationReg.test(nextChunk.trimStart()) &&
              /[.!?]["'\])}>]\s*[\r\n]/.test(suffix)))
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
        if (
          (caseNeutral
            ? startsWithCasedCharacter(nextChunk) &&
              (!sentenceContinuationReg.test(nextChunk.trimStart()) ||
                independentSentenceReg.test(nextChunk.trimStart()))
            : strIsTitleCase(nextChunk)) &&
          !excepReg.test(gateSuffix) &&
          !(
            geographicAcronymReg.test(gateSuffix) &&
            geographicContinuationReg.test(nextChunk.trim())
          )
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
    const opener = index === 0 || /^[\s\p{Punctuation}<=]$/u.test(previous);
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
    (input.startsWith("''", index) && quotationState(input, index, false))
  ) {
    return "''";
  }
  if (character === '"') {
    return index === 0 || /^[\s\p{Punctuation}<=]$/u.test(input[index - 1]) ? '"' : undefined;
  }
  if (
    character === "'" &&
    (index === 0 || /^[\s\p{Punctuation}<=]$/u.test(input[index - 1])) &&
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

function isPairedNElision(input: string, index: number): boolean {
  return (
    /^(['’])n\1$/i.test(input.slice(index, index + 3)) ||
    /^(['’])n\1$/i.test(input.slice(Math.max(0, index - 2), index + 1))
  );
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
): {
  empty: boolean;
  boundary: boolean;
  joinedNameInitial: boolean;
} {
  let index = marker.index - 1;
  let lineBreak = /[\r\n]/.test(marker[0]);
  while (index >= 0 && /[\s"'”’»›\])}>]/.test(input[index])) {
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
    const prefix = listMarkerPrefix(input, marker);
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

/** Reference labels continue through one prose run; strong punctuation starts a new context. */
function isListCrossReference(
  input: string,
  marker: RegExpExecArray,
  state: ListScanState,
  enclosed: boolean,
): boolean {
  if (
    state.referenceThrough !== undefined &&
    /[.!?:;\r\n]/.test(input.slice(state.referenceThrough, marker.index))
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
    start = '^\\s*(?:[•⁃]\\s*|[-*+]\\s+)?\\d';
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
  return marker.match(/^(?:[•⁃]\s*|[-*+]\s+)?(\d+)/)?.[1].replace(/^0+(?=\d)/, '');
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
    const context = listMarkerPrefix(input, current);
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
function sentenceChunks(input: string, caseNeutral: boolean, markerPeriods?: Uint8Array): string[] {
  const chunks: string[] = [];
  const protectedPeriods = spacedEllipsisRanges(input, caseNeutral);
  const ellipsisCursor = { index: 0 };
  let lastEnd = 0;
  let start = -1;
  let insideQuotes = false;
  const brackets = { depth: 0, standalone: false };

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    insideQuotes = quotationState(input, index, insideQuotes);
    if (openingBracketReg.test(char)) {
      if (brackets.depth === 0) {
        brackets.standalone = start === -1;
      }
      brackets.depth++;
    } else if (closingBracketReg.test(char)) {
      brackets.depth = Math.max(0, brackets.depth - 1);
    }
    if (index < lastEnd || char === '\r' || char === '\n') {
      // Only closing-delimiter lookahead can cross CR/LF; other wraps reset the prefix.
      start = -1;
      continue;
    }
    if (start === -1) {
      if (/\S/.test(char)) {
        start = index;
      }
      // A terminal must follow the initial character, even if it is punctuation.
      continue;
    }
    if (
      (char === '.' &&
        markerPeriods?.[index] !== 1 &&
        !isProtectedEllipsisPeriod(index, protectedPeriods, ellipsisCursor)) ||
      char === '?' ||
      char === '!'
    ) {
      const end = sentenceEnd(input, index, insideQuotes, brackets, caseNeutral);
      if (end === -1) {
        continue;
      }
      // Captured line wraps can only occur between the terminal and closing delimiters.
      chunks.push(input.slice(lastEnd, start), input.slice(start, end).replace(/[\r\n]+/g, ' '));
      lastEnd = end;
      start = -1;
    }
  }

  chunks.push(input.slice(lastEnd));
  return chunks;
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

    let next = match.index + match[0].length;
    while (next < input.length && /[\s"'([{<]/.test(input[next])) {
      next++;
    }
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

/** Scan closing delimiters, including whitespace before a pending closing quote. */
function closingDelimiterEnd(input: string, index: number, insideQuotes: boolean): number {
  let end = index + 1;
  let quotePending = insideQuotes;
  while (end < input.length) {
    if (closingDelimiterReg.test(input[end])) {
      quotePending &&= input[end] !== '"';
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
      (closingBracketReg.test(input[next]) || (quotePending && input[next] === '"'))
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
  insideQuotes: boolean,
  brackets: { depth: number; standalone: boolean },
  caseNeutral: boolean,
): number {
  if (
    !insideQuotes &&
    brackets.depth === 0 &&
    isUnspacedDelimitedSentenceStart(input, index, caseNeutral)
  ) {
    return index + 1;
  }
  const end = closingDelimiterEnd(input, index, insideQuotes);
  if (end < input.length && !/\s/.test(input[end])) {
    return isUnspacedSentenceBoundary(input, index, end, caseNeutral) ? end : -1;
  }
  if (end === index + 1) {
    return colonIntroducedNameBoundary(input, index, caseNeutral);
  }

  const closedBrackets = countClosingBrackets(input, index + 1, end);
  const closesQuotation =
    insideQuotes && (input[end - 1] === '"' || input.slice(end - 2, end) === "''");
  if (
    closedBrackets > 0 &&
    (closedBrackets < brackets.depth || !(brackets.standalone || closesQuotation))
  ) {
    return -1;
  }

  let next = end;
  while (next < input.length && /[\s"'([{<]/.test(input[next])) {
    next++;
  }
  if (next === input.length) {
    return end;
  }
  const suffix = input.slice(Math.max(0, index + 1 - sentenceSuffixLength), index + 1);
  const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
  const nextCharacter = characterAt(input, next);
  const startsWithLetter = caseNeutral
    ? isNeutralSentenceStart(input, end, next)
    : charIsUpperCase(nextCharacter);
  const startsWithNumber =
    /^\p{Number}$/u.test(nextCharacter) &&
    !abbrvReg.test(gateSuffix) &&
    !/^\S+(?:\s*%|\s+(?:time|year)s?\b|\s+(?:month|week|day|hour|minute|second|star|point|percent)s?(?=\s*[.!?](?:\s|$)|\s*$))/iu.test(
      input.slice(next),
    );
  if (!(startsWithLetter || startsWithNumber)) {
    return -1;
  }

  // Keep bracketed ellipses inside the surrounding sentence.
  if (ellipseReg.test(suffix) && closedBrackets > 0) {
    return -1;
  }
  return abbrvReg.test(gateSuffix) && excepReg.test(gateSuffix) ? -1 : end;
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

function countClosingBrackets(input: string, start: number, end: number): number {
  let count = 0;
  for (let index = start; index < end; index++) {
    if (closingBracketReg.test(input[index])) {
      count++;
    }
  }
  return count;
}

function isUnspacedDelimitedSentenceStart(
  input: string,
  index: number,
  caseNeutral: boolean,
): boolean {
  let next = index + 1;
  if (!/["'([{<]/.test(input[next] ?? '')) {
    return false;
  }
  if (/^(?:\[\p{Number}+\]|\(\p{Number}+\))/u.test(input.slice(next))) {
    return false;
  }
  while (next < input.length && /["'([{<]/.test(input[next])) {
    next++;
  }
  const character = characterAt(input, next);
  return (
    character.length > 0 &&
    (/^\p{Number}$/u.test(character) ||
      (caseNeutral ? isCasedCharacter(character) : charIsUpperCase(character)))
  );
}

function isUnspacedSentenceBoundary(
  input: string,
  index: number,
  next: number,
  caseNeutral: boolean,
): boolean {
  const nextCharacter = characterAt(input, next);
  const startsWithLetter = caseNeutral
    ? isCasedCharacter(nextCharacter)
    : charIsUpperCase(nextCharacter);
  if (!(startsWithLetter || (input[index] !== '.' && /^\p{Number}$/u.test(nextCharacter)))) {
    return false;
  }
  const precedingToken = input.slice(Math.max(0, index - 320), next).match(/\S+$/)?.[0] ?? '';
  const insideUrl = /https?:\/\/|www\./i.test(precedingToken);
  if (input[index] !== '.') {
    return !insideUrl;
  }

  const suffix = input.slice(Math.max(0, index + 1 - sentenceSuffixLength), index + 1);
  const following = input.slice(next);
  const insideAddress =
    precedingToken.includes('@') && !/@[^\s.]+(?:\.[^\s.]+)+\.$/u.test(precedingToken);
  const hostnameLabel = following.match(
    /^(com|org|net|edu|gov|mil|io|dev|app|co|uk|us|ca|ai|info|biz|me|tv)(?=[/.\s]|$)/i,
  )?.[0];
  const insideHostname =
    insideUrl ||
    (hostnameLabel !== undefined &&
      (caseNeutral ||
        hostnameLabel === hostnameLabel.toLowerCase() ||
        hostnameLabel === hostnameLabel.toUpperCase()));
  const dottedIdentifier = caseNeutral
    ? /\b\p{Cased}[\p{Letter}\p{Number}_-]*\.$/u.test(suffix) &&
      /^[\p{Cased}\p{Number}_-]{1,2}(?=\s|[/.]|$)/u.test(following)
    : /\b\p{Lu}[\p{Letter}\p{Number}_-]*\.$/u.test(suffix) &&
      /^[\p{Lu}\p{Number}_-]+(?=\s|[/.]|$)/u.test(following);
  const initial = caseNeutral ? /^\p{Cased}\./u : /^\p{Lu}\./u;
  const trailingInitial = caseNeutral ? /\b\p{Cased}\.$/u : /\b\p{Lu}\.$/u;
  const nextInitial = caseNeutral ? /^\p{Cased}(?=\s|$)/u : /^\p{Lu}(?=\s|$)/u;
  const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
  const continuesAbbreviation =
    abbrvReg.test(gateSuffix) &&
    (excepReg.test(gateSuffix) ||
      (geographicAcronymReg.test(gateSuffix) && geographicContinuationReg.test(following)));
  return !(
    continuesAbbreviation ||
    initial.test(following) ||
    (trailingInitial.test(suffix) && nextInitial.test(following)) ||
    /^[^\s]*@/.test(following) ||
    insideAddress ||
    insideHostname ||
    dottedIdentifier
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
  return input.reduce((x, y) => x + y) / input.length;
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
