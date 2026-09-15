import {
  ABBR_DATES,
  ABBR_PLACES,
  GATE_EXCEPTIONS,
  GATE_SUBSTITUTIONS,
  TREEBANK_CONTRACTIONS,
} from './constants';
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
const numericSentenceContinuationReg =
  /^\S+(?:\s*%|\s+(?:time|year)s?\b|\s+(?:month|week|day|hour|minute|second|star|point|percent)s?(?=\s*[.!?](?:\s|$)|\s*$))/iu;
const breakReg = /[\r\n]+/;
// Match a bounded ellipsis suffix to avoid excessive backtracking.
const ellipseReg = /\.{2,10}$/;
const excepReg = new RegExp(`\\b(${GATE_EXCEPTIONS.map(escapeRegExp).join('|')})[.!?] ?$`, 'i');
const sentenceSuffixLength = Math.max(10, ...GATE_SUBSTITUTIONS.map((word) => word.length + 2));
const closingDelimiterReg = /[\])}>"']/;
const openingBracketReg = /[([{<]/;
const closingBracketReg = /[\])}>]/;
const listMarkerReg =
  /(?:^|\s)(?:(?:[•⁃]\s*)?\d+(?:\.\)|[.)])|\p{Cased}\.)(?=\s+["'([{<]*\p{Cased})/gu;
const geographicAcronymReg = /\bU\.S(?:\.A)?\.$/i;
const hostnameLabels = 'com|org|net|edu|gov|mil|io|dev|app|co|uk|us|ca|ai|info|biz|me|tv';
const hostnameLabelReg = new RegExp(`^(${hostnameLabels})(?=[/.\\s]|$)`, 'i');
const hostnameTokenReg = new RegExp(`\\.(${hostnameLabels})(?=[/.\\s]|$)`, 'gi');
const numericCitationReg =
  /(?:\[\p{Number}+(?:[^\S\r\n\u2028\u2029]*[,;\p{Pd}][^\S\r\n\u2028\u2029]*\p{Number}+)*\]|\(\p{Number}+(?:[^\S\r\n\u2028\u2029]*[,;\p{Pd}][^\S\r\n\u2028\u2029]*\p{Number}+)*\)|\p{Number}+)/uy;
const geographicContinuationReg = /^(?:government|army|navy|military|congress)\b/i;
const citedPlaceAcronymReg = new RegExp(
  `\\b(?:${ABBR_PLACES.filter((place) => place.includes('.'))
    .map(escapeRegExp)
    .join('|')})\\.$`,
  'i',
);
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
export function sentenceSegment(
  input: string,
  { caseNeutral = false }: SentenceSegmentOptions = {},
): string[] {
  if (input.length === 0) {
    return [];
  }

  const list = segmentList(input, caseNeutral);
  if (list !== undefined) {
    return list;
  }

  // Scan terminals before applying abbreviation and line-wrap rules.
  const chunks = sentenceChunks(input.replace(/\u0085/g, ' '), caseNeutral);

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

function nextListMarker(
  input: string,
  expression: RegExp,
  family?: RegExp,
): RegExpExecArray | null {
  let marker = expression.exec(input);
  while (marker !== null) {
    if (
      (family === undefined || family.test(marker[0])) &&
      (marker.index === 0 ||
        !/\b(?:section|chapter|page|figure|table|paragraph|article|clause)$/i.test(
          input.slice(Math.max(0, marker.index - 24), marker.index).trimEnd(),
        ))
    ) {
      return marker;
    }
    marker = expression.exec(input);
  }
  return null;
}

function segmentList(input: string, caseNeutral: boolean): string[] | undefined {
  const expression = new RegExp(listMarkerReg);
  let current = nextListMarker(input, expression);
  if (current === null || input.slice(0, current.index).trim().length > 0) {
    return undefined;
  }
  const firstMarker = current[0];
  const family = [/\d/, /^\s*\p{Lu}/u, /^\s*\p{Ll}/u].find((pattern) => pattern.test(firstMarker));
  let next = nextListMarker(input, expression, family);
  if (next === null) {
    return undefined;
  }

  const segments: string[] = [];
  do {
    const body = input.slice(current.index + current[0].length, next?.index ?? input.length).trim();
    const sentences = /[.!?\r\n]/.test(body) ? sentenceSegment(body, { caseNeutral }) : [body];
    if (sentences.length > 1 && /^\p{Cased}\.$/u.test(sentences[0])) {
      sentences.splice(0, 2, `${sentences[0]} ${sentences[1]}`);
    }
    segments.push(`${current[0].trim()} ${sentences[0]}`, ...sentences.slice(1));
    current = next;
    next = nextListMarker(input, expression, family);
  } while (current !== null);
  return segments;
}

/** Options for rule-based sentence segmentation. */
export interface SentenceSegmentOptions {
  /** Ignore letter casing when applying sentence-boundary heuristics (default: false). */
  caseNeutral?: boolean;
}

interface SentenceBracketState {
  depth: number;
  standalone: boolean;
  citationDepth: number;
  citationStandalone: boolean;
  angles: number;
}

/** Preserve ordinary depth while reserving angle closers for citation inference. */
function updateSentenceBrackets(
  input: string,
  index: number,
  standalone: boolean,
  brackets: SentenceBracketState,
): void {
  const char = input[index];
  if (openingBracketReg.test(char)) {
    if (brackets.depth === 0) {
      brackets.standalone = standalone;
    }
    brackets.depth++;
    if (char !== '<' || !isNumericComparisonAngle(input, index)) {
      if (brackets.citationDepth === 0) {
        brackets.citationStandalone = standalone;
      }
      brackets.citationDepth++;
      brackets.angles += Number(char === '<');
    }
  } else if (closingBracketReg.test(char)) {
    brackets.depth = Math.max(0, brackets.depth - 1);
    if (char !== '>' || brackets.angles > 0) {
      brackets.citationDepth = Math.max(0, brackets.citationDepth - 1);
      brackets.angles -= Number(char === '>');
    }
  }
}

/** Scan sentence boundaries once, preserving the former captured-split layout. */
function sentenceChunks(input: string, caseNeutral: boolean): string[] {
  const chunks: string[] = [];
  const protectedPeriods = spacedEllipsisRanges(input, caseNeutral);
  const ellipsisCursor = { index: 0 };
  let lastEnd = 0;
  let start = -1;
  let insideQuotes = false;
  const brackets = {
    depth: 0,
    standalone: false,
    citationDepth: 0,
    citationStandalone: false,
    angles: 0,
  };
  const citationQuotes = citationQuotationState(input);
  const isPathOrAddress = pathOrAddressTokenChecker(input, caseNeutral);
  const hasIdentifierEvidence = citationIdentifierEvidenceChecker(input);
  const isNumericContinuation = numericContinuationChecker(input);
  let citationThrough = 0;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const previousQuotes = insideQuotes;
    insideQuotes = quotationState(input, index, insideQuotes);
    updateCitationQuotationState(
      input,
      index,
      citationQuotes,
      index < citationThrough,
      previousQuotes,
      insideQuotes,
    );
    updateSentenceBrackets(input, index, start === -1, brackets);
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
      (char === '.' && !isProtectedEllipsisPeriod(index, protectedPeriods, ellipsisCursor)) ||
      char === '?' ||
      char === '!'
    ) {
      const citationBoundary = citationEnd(
        input,
        index,
        caseNeutral,
        brackets,
        citationQuotes,
        isPathOrAddress,
        isNumericContinuation,
        hasIdentifierEvidence,
      );
      const end =
        citationBoundary ?? sentenceEnd(input, index, insideQuotes, brackets, caseNeutral);
      if (end === -1) {
        continue;
      }
      citationThrough = citationBoundary ?? citationThrough;
      // Captured line wraps can only occur between the terminal and closing delimiters.
      chunks.push(input.slice(lastEnd, start), input.slice(start, end).replace(/[\r\n]+/g, ' '));
      lastEnd = end;
      start = -1;
    }
  }

  const tail = input.slice(lastEnd);
  // A final fragment has no later terminal to separate its leading citation whitespace.
  chunks.push(citationThrough > 0 && lastEnd === citationThrough ? tail.trimStart() : tail);
  return chunks;
}

const singleQuoteClosingContextReg = /^[\s.,!?;:)\]}”’»›」』\p{Pd}]$/u;
const citationElisionReg =
  /^(?:\d{2}s|t(?:is|was|were|will|would|il|ill)|n|em|cause|cos|round|bout|neath|fore|tween|gainst|cept|(?:twen|thir|for|fif|six|seven|eigh|nine)ties)\b/i;

function isCitationElision(input: string, index: number): boolean {
  return citationElisionReg.test(input.slice(index + 1, index + 32));
}

function isRightCitationElision(input: string, index: number): boolean {
  return (
    input[index] === '’' &&
    (index === 0 || /^[\s,;:([{<"'‘“«‹„「『\p{Pd}]$/u.test(input[index - 1])) &&
    isCitationElision(input, index)
  );
}

/** Reserve required curly closers before deciding whether an elision opens a quote. */
class CurlyCitationElisions {
  #entries = new Uint32Array(32);
  #length = 0;

  constructor(input: string, flags: Uint8Array) {
    let available = 0;
    for (let index = input.length - 1; index >= 0; index--) {
      const character = input[index];
      if (
        !/[‘’]/.test(character) ||
        (flags[index] & 16) !== 0 ||
        isWordInternalApostrophe(input, index) ||
        isRightCitationElision(input, index)
      ) {
        continue;
      }
      if (character === '’') {
        if (!/[sS]/.test(input[index - 1] ?? '')) {
          available++;
        }
      } else if (isCitationElision(input, index)) {
        this.#add(available);
      } else {
        available = Math.max(0, available - 1);
      }
    }
  }

  #add(available: number): void {
    if (this.#length === this.#entries.length) {
      const expanded = new Uint32Array(this.#entries.length * 2);
      expanded.set(this.#entries);
      this.#entries = expanded;
    }
    this.#entries[this.#length++] = available;
  }

  nextAvailable(): number {
    // The forward pass visits the same filtered elision marks in reverse storage order.
    return this.#entries[--this.#length];
  }
}

function isWordInternalApostrophe(input: string, index: number): boolean {
  return (
    /[\p{Letter}\p{Mark}]$/u.test(input.slice(Math.max(0, index - 2), index)) &&
    /^[\p{Letter}\p{Mark}]$/u.test(characterAt(input, index + 1))
  );
}

interface CurlyCitationCandidates {
  positions: Uint32Array;
  openers: Uint32Array;
  depth: number;
  overflowed: boolean;
}

/** A later unambiguous closer confirms candidates at the same tentative depth. */
function citationApostrophes(input: string): { apostrophes: Uint8Array; overflowed: boolean } {
  const apostrophes = new Uint8Array(input.length);
  markEnglishCitationOpenings(input, apostrophes, '“', '”', 4);
  markEnglishCitationOpenings(input, apostrophes, '‘', '’', 8);
  const germanOverflowed = markGermanSingleCitationClosers(input, apostrophes);
  const elisions = new CurlyCitationElisions(input, apostrophes);
  const curly: CurlyCitationCandidates = {
    positions: new Uint32Array(64),
    openers: new Uint32Array(64),
    depth: 0,
    overflowed: false,
  };
  const straight: { candidate?: number; opening?: number } = {};
  for (const quote of input.matchAll(/['‘’]/g)) {
    const index = quote.index;
    const family = quote[0] === "'" ? 1 : 0;
    if ((apostrophes[index] & 16) !== 0) {
      continue;
    }
    if (isWordInternalApostrophe(input, index) || isRightCitationElision(input, index)) {
      apostrophes[index] |= 1 << family;
    } else if (family === 0) {
      updateCurlyCitationCandidates(input, index, curly, apostrophes, elisions);
    } else {
      updateStraightCitationCandidates(input, index, straight, apostrophes);
    }
  }
  return { apostrophes, overflowed: curly.overflowed || germanOverflowed };
}

function updateStraightCitationCandidates(
  input: string,
  index: number,
  state: { candidate?: number; opening?: number },
  apostrophes: Uint8Array,
): void {
  const previous = input[index - 1] ?? '';
  const following = characterAt(input, index + 1);
  const elision = !/[.!?]/.test(previous) && isCitationElision(input, index);
  if (
    (index === 0 || /^[\s\p{Punctuation}]$/u.test(previous)) &&
    following.length > 0 &&
    !singleQuoteClosingContextReg.test(following)
  ) {
    if (elision) {
      apostrophes[index] |= 2;
      if (state.opening !== undefined) {
        return;
      }
    }
    state.opening = index;
    state.candidate = undefined;
  } else if (/[sS]/.test(previous)) {
    state.candidate ??= index;
  } else {
    if (state.opening !== undefined) {
      apostrophes[state.opening] &= ~2;
    }
    if (state.candidate !== undefined) {
      for (let position = state.candidate; position < index; position++) {
        apostrophes[position] |= 2;
      }
    }
    state.opening = undefined;
    state.candidate = undefined;
  }
}

function updateCurlyCitationCandidates(
  input: string,
  index: number,
  candidates: CurlyCitationCandidates,
  apostrophes: Uint8Array,
  elisions: CurlyCitationElisions,
): void {
  if (candidates.overflowed) {
    return;
  }
  if (input[index] === '‘') {
    if (isCitationElision(input, index)) {
      apostrophes[index] |= 1;
      if (elisions.nextAvailable() <= candidates.depth) {
        return;
      }
    }
    if (candidates.depth === candidates.positions.length) {
      // More than 64 tentative frames disables citation inference for this input.
      candidates.overflowed = true;
    } else {
      candidates.openers[candidates.depth] = index;
      candidates.positions[candidates.depth++] = 0;
    }
    return;
  }
  if (candidates.depth === 0) {
    return;
  }
  if (/[sS]/.test(input[index - 1] ?? '')) {
    candidates.positions[candidates.depth - 1] ||= index + 1;
    return;
  }
  const candidate = candidates.positions[--candidates.depth];
  apostrophes[candidates.openers[candidates.depth]] &= ~1;
  if (candidate > 0) {
    confirmCurlyCitationCandidates(input, candidate - 1, index, apostrophes);
  }
}

/** Confirm only this frame's candidates, preserving matched inner quote closers. */
function confirmCurlyCitationCandidates(
  input: string,
  start: number,
  end: number,
  apostrophes: Uint8Array,
): void {
  let nested = 0;
  // Ranges are disjoint at each depth, with at most 64 tentative depths.
  for (let index = start; index < end; index++) {
    if ((apostrophes[index] & 17) !== 0) {
      continue;
    }
    if (input[index] === '‘') {
      nested++;
    } else if (input[index] === '’') {
      if (nested > 0) {
        nested--;
      } else {
        apostrophes[index] |= 1;
      }
    }
  }
}

/** Infer an English inner pair only before a later German outer closer. */
function markEnglishCitationOpenings(
  input: string,
  flags: Uint8Array,
  opening: string,
  closing: string,
  flag: number,
): void {
  let nextEnglishCloser = -1;
  let nextSharedMark = -1;
  for (
    let index = input.indexOf(opening);
    index !== -1;
    index = input.indexOf(opening, index + 1)
  ) {
    if (nextEnglishCloser <= index) {
      let next = input.indexOf(closing, index + 1);
      while (
        next !== -1 &&
        closing === '’' &&
        (isWordInternalApostrophe(input, next) || isRightCitationElision(input, next))
      ) {
        next = input.indexOf(closing, next + 1);
      }
      nextEnglishCloser = next === -1 ? input.length : next;
    }
    if (nextSharedMark <= index) {
      const next = input.indexOf(opening, index + 1);
      nextSharedMark = next === -1 ? input.length : next;
    }
    if (nextEnglishCloser < nextSharedMark && nextSharedMark < input.length) {
      flags[index] |= flag;
    }
  }
}

function isSharedCitationCloser(
  character: string,
  pending: readonly string[],
  flags: number,
): boolean {
  const single = character === '‘';
  return (
    pending.at(-1) === character &&
    (pending.includes(single ? '’' : '”') || (flags & (single ? 8 : 4)) === 0)
  );
}

/** Exclude actual German low-single closers from English apostrophe reservation. */
function markGermanSingleCitationClosers(input: string, flags: Uint8Array): boolean {
  const pending: string[] = [];
  for (const quote of input.matchAll(/[‚‘’]/g)) {
    const index = quote.index;
    const character = quote[0];
    if (
      character !== '‚' &&
      (isWordInternalApostrophe(input, index) || isRightCitationElision(input, index))
    ) {
      continue;
    }
    if (character === '’') {
      if (pending.at(-1) === character) {
        pending.pop();
      }
      continue;
    }
    if (
      character === '‘' &&
      isCitationElision(input, index) &&
      (index === 0 || /^[\s,;:([{<"'‘“«‹„‚「『\p{Pd}]$/u.test(input[index - 1])) &&
      (flags[index] & 8) === 0
    ) {
      continue;
    }
    if (character === '‘' && isSharedCitationCloser(character, pending, flags[index])) {
      flags[index] |= 16;
      pending.pop();
    } else if (pending.length < 64) {
      pending.push(character === '‚' ? '‘' : '’');
    } else {
      return true;
    }
  }
  return false;
}

interface CitationQuotationState {
  closers: string[];
  overflowed: boolean;
  pairThrough: number;
  flags: Uint8Array;
}

/** Candidate gaps contain no words/numbers; the first number attaches to punctuation. */
function citationQuotationState(input: string): CitationQuotationState | undefined {
  // Excluding terminals from each gap keeps failed candidate scans disjoint and linear.
  if (!/[.!?](?:[^\p{Letter}\p{Number}.!?]*[^\p{Letter}\p{Number}\s.!?])?\p{Number}/u.test(input)) {
    return undefined;
  }
  const { apostrophes, overflowed } = citationApostrophes(input);
  return { closers: [], overflowed, pairThrough: 0, flags: apostrophes };
}

function updateCitationQuotationState(
  input: string,
  index: number,
  quotes: CitationQuotationState | undefined,
  confirmedClosing: boolean,
  previousQuotes: boolean,
  insideQuotes: boolean,
): void {
  if (
    quotes === undefined ||
    quotes.overflowed ||
    updateCitationDoubleQuote(input, index, quotes, previousQuotes, insideQuotes, confirmedClosing)
  ) {
    return;
  }
  const character = input[index];
  const closers = quotes.closers;
  const apostropheFlag = character === "'" ? 2 : 1;
  if (/['‘’]/.test(character) && (quotes.flags[index] & apostropheFlag) !== 0) {
    return;
  }
  if (/[“‘]/.test(character) && isSharedCitationCloser(character, closers, quotes.flags[index])) {
    closers.pop();
    return;
  }
  const opening = '“‘«‹„‚「『'.indexOf(character);
  if (opening !== -1) {
    pushCitationQuotation(quotes, '”’»›“‘」』'[opening]);
    return;
  }
  if (/[”’»›」』]/.test(character)) {
    if (closers.at(-1) === character) {
      closers.pop();
    } else if (character === '”' && isRightDoubleCitationOpening(input, index)) {
      pushCitationQuotation(quotes, character);
    }
    return;
  }
  if (character !== "'") {
    return;
  }

  const previous = input[index - 1] ?? '';
  const following = characterAt(input, index + 1);
  if (closers.at(-1) === "'") {
    if (
      confirmedClosing ||
      following.length === 0 ||
      /[.!?]/.test(previous) ||
      singleQuoteClosingContextReg.test(following) ||
      /^[[(\p{Number}]$/u.test(following)
    ) {
      closers.pop();
    }
    return;
  }
  const afterTreebankOpening = quotes.closers.at(-1) === "''" && index === quotes.pairThrough;
  const opensSingle = afterTreebankOpening || /^[\s\p{Punctuation}]?$/u.test(previous);
  if (opensSingle && /\S/.test(following)) {
    pushCitationQuotation(quotes, "'");
  }
}

/** Keep explicit double families in the same bounded stack as other quotation marks. */
function updateCitationDoubleQuote(
  input: string,
  index: number,
  quotes: CitationQuotationState,
  previousQuotes: boolean,
  insideQuotes: boolean,
  confirmedClosing: boolean,
): boolean {
  if (index < quotes.pairThrough) {
    return true;
  }
  const pending = quotes.closers.at(-1);
  if (input[index] === '"') {
    const outerOpening = "'‘“«‹„‚「『".indexOf(input[index - 1] ?? '');
    const afterOuterOpening = outerOpening >= 0 && "'’”»›“‘」』"[outerOpening] === pending;
    const opening =
      opensDoubleQuote(input, index, false) ||
      afterOuterOpening ||
      (pending === "''" && index === quotes.pairThrough);
    if (pending === '"' || (pending === "''" && (confirmedClosing || !opening))) {
      quotes.closers.pop();
    } else if (opening) {
      pushCitationQuotation(quotes, '"');
    }
    return true;
  }
  if ((pending === '"' || pending === "''") && input.startsWith("''", index)) {
    quotes.closers.pop();
    quotes.pairThrough = index + 2;
    return true;
  }
  if (
    input.startsWith('``', index) ||
    (!previousQuotes && insideQuotes && input.startsWith("''", index))
  ) {
    pushCitationQuotation(quotes, "''");
    quotes.pairThrough = index + 2;
    return true;
  }
  return false;
}

function isCitationDoubleCloser(closing: string | undefined): boolean {
  return closing === '"' || closing === "''";
}

function hasCitationDoubleQuote(closers: readonly string[]): boolean {
  return closers.some(isCitationDoubleCloser);
}

/** Double-family spellings can close a level; single/smart marks keep their own roles. */
function citationCloserWidth(
  input: string,
  index: number,
  pending: readonly string[],
  remaining = pending.length,
): number {
  const closing = pending[remaining - 1];
  if (isCitationDoubleCloser(closing)) {
    if (input.startsWith("''", index)) {
      return 2;
    }
    return input[index] === '"' ? 1 : 0;
  }
  return closing !== undefined && input[index] === closing ? 1 : 0;
}

function pushCitationQuotation(quotes: CitationQuotationState, closing: string): void {
  if (quotes.closers.length < 64) {
    quotes.closers.push(closing);
  } else {
    // Discarded nesting cannot be reconstructed safely from subsequent mixed closers.
    quotes.overflowed = true;
  }
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
    return end;
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
    !numericSentenceContinuationReg.test(input.slice(next));
  if (!(startsWithLetter || startsWithNumber)) {
    return -1;
  }

  // Keep bracketed ellipses inside the surrounding sentence.
  if (ellipseReg.test(suffix) && closedBrackets > 0) {
    return -1;
  }
  return abbrvReg.test(gateSuffix) && excepReg.test(gateSuffix) ? -1 : end;
}

/** Undefined permits ordinary scanning; -1 retains an explicit citation continuation. */
function citationEnd(
  input: string,
  index: number,
  caseNeutral: boolean,
  brackets: { citationDepth: number; citationStandalone: boolean; angles: number },
  quotationQuotes: CitationQuotationState | undefined,
  isPathOrAddress: (index: number) => boolean,
  isNumericContinuation: (index: number) => boolean,
  hasIdentifierEvidence: (index: number) => boolean,
): number | undefined {
  if (quotationQuotes?.overflowed !== false) {
    return undefined;
  }
  const nextCharacter = characterAt(input, index + 1);
  if (!/^[\s\p{Number}[()\]}>"'“‘”’»›」』]$/u.test(nextCharacter)) {
    return undefined;
  }
  if (/^["'“‘]$/.test(nextCharacter) && quotationQuotes.closers.length === 0) {
    return undefined;
  }

  const pendingClosers = [...quotationQuotes.closers];
  const delimiterEnd = citationDelimiterEnd(input, index, pendingClosers, quotationQuotes.flags);
  let citationStart = delimiterEnd;
  while (citationStart < input.length && /[^\S\r\n\u2028\u2029]/.test(input[citationStart])) {
    citationStart++;
  }
  if (citationStart > delimiterEnd && input[citationStart] !== '[') {
    return undefined;
  }
  if (
    citationStart === index + 1 &&
    /^\p{Number}$/u.test(characterAt(input, citationStart)) &&
    isPathOrAddress(index)
  ) {
    return undefined;
  }
  const contentEnd = numericCitationEnd(input, citationStart);
  if (contentEnd === undefined) {
    return undefined;
  }
  const groupedCitation = /[[(]/.test(input[citationStart]);
  const continuation = groupedCitation ? -1 : undefined;

  const leadingClosers = input.slice(index + 1, delimiterEnd);
  const end = citationDelimiterEnd(
    input,
    contentEnd - 1,
    pendingClosers,
    quotationQuotes.flags,
    true,
  );
  const closing = leadingClosers + input.slice(contentEnd, end);
  if (!closesCitationQuotations(closing, quotationQuotes.closers)) {
    return continuation;
  }
  const closedBrackets = countClosingBrackets(closing, 0, closing.length, brackets.angles);
  const closesQuotation = quotationQuotes.closers.length > 0;
  if (
    (closedBrackets > 0 &&
      brackets.citationDepth > 0 &&
      !(brackets.citationStandalone || closesQuotation)) ||
    !isCitationContext(
      input,
      index,
      characterAt(input, citationStart),
      Math.max(0, brackets.citationDepth - closedBrackets),
      caseNeutral,
      hasIdentifierEvidence(index),
    )
  ) {
    return continuation;
  }
  if (end === input.length || /^\s+$/.test(input.slice(end))) {
    return end;
  }
  return isCitationSentenceStart(
    input,
    index,
    end,
    caseNeutral,
    isNumericContinuation,
    groupedCitation,
    groupedCitation && end === contentEnd,
  )
    ? end
    : continuation;
}

/** A pending English closer takes precedence; otherwise this mark can open a quotation. */
function isRightDoubleCitationOpening(input: string, index: number): boolean {
  return (
    (index === 0 || /^[\s([<{"'‘“«‹„‚「『]$/u.test(input[index - 1])) &&
    /\S/.test(input[index + 1] ?? '')
  );
}

function isCitationOpeningQuote(input: string, index: number): boolean {
  return (
    /["'“‘«‹„‚「『]/.test(input[index]) ||
    (input[index] === '”' && isRightDoubleCitationOpening(input, index))
  );
}

function isCitationSeparator(input: string, end: number, allowUnspaced: boolean): boolean {
  return (
    /[\s([{<]/.test(input[end]) ||
    isCitationOpeningQuote(input, end) ||
    (allowUnspaced && isCasedCharacter(characterAt(input, end)))
  );
}

function isCitationSentenceStart(
  input: string,
  index: number,
  end: number,
  caseNeutral: boolean,
  isNumericContinuation: (index: number) => boolean,
  groupedCitation: boolean,
  allowUnspaced: boolean,
): boolean {
  if (!isCitationSeparator(input, end, allowUnspaced)) {
    return false;
  }
  let next = end;
  let quotedStart = false;
  while (
    next < input.length &&
    (/[\s([{<]/.test(input[next]) || isCitationOpeningQuote(input, next))
  ) {
    quotedStart ||= isCitationOpeningQuote(input, next);
    next++;
  }
  const suffix = input.slice(Math.max(0, index + 1 - sentenceSuffixLength), index + 1);
  const gateSuffix = caseNeutral ? suffix.toLowerCase() : suffix;
  const continuation = input.slice(next);
  const ellipsis = ellipseReg.test(suffix);
  if (
    (ellipsis && !/\.{4}$/.test(suffix)) ||
    (abbrvReg.test(gateSuffix) &&
      (excepReg.test(gateSuffix) ||
        (citedPlaceAcronymReg.test(gateSuffix) && geographicContinuationReg.test(continuation))))
  ) {
    return false;
  }
  if (!caseNeutral && isCitedInitialContinuation(input, index, end, next)) {
    return false;
  }
  if (
    !(ellipsis || abbrvReg.test(gateSuffix)) &&
    /[\r\n\u2028\u2029]/.test(input.slice(end, next))
  ) {
    return true;
  }

  const sentenceStart = characterAt(input, next);
  const ordinaryTerminal = !(ellipsis || abbrvReg.test(gateSuffix));
  const uncasedLetter =
    ordinaryTerminal && /^\p{Letter}$/u.test(sentenceStart) && !isCasedCharacter(sentenceStart);
  const startsWithLetter =
    uncasedLetter ||
    (caseNeutral
      ? isNeutralSentenceStart(input, end, next, quotedStart)
      : sentenceStart.length > 0 && charIsUpperCase(sentenceStart));
  const startsWithNumber =
    /^\p{Number}$/u.test(sentenceStart) &&
    !abbrvReg.test(gateSuffix) &&
    !ellipsis &&
    !isNumericContinuation(next);
  const startsWithMarker =
    groupedCitation &&
    ordinaryTerminal &&
    /\s/.test(input.slice(end, next)) &&
    /^[\p{Symbol}¿¡•⁃]$/u.test(sentenceStart);
  return startsWithLetter || startsWithNumber || startsWithMarker;
}

/** Isolated initial candidates keep these preceding-word scans disjoint. */
function isCitedInitialContinuation(
  input: string,
  index: number,
  end: number,
  next: number,
): boolean {
  if (
    input[index] !== '.' ||
    index < 2 ||
    !/[A-Za-z]/.test(input[index - 1]) ||
    !/[ \r\n]/.test(input[index - 2])
  ) {
    return false;
  }
  if (input[index - 1] === input[index - 1].toLowerCase()) {
    return true;
  }
  if (/\S/.test(input.slice(end, next))) {
    return false;
  }
  let wordEnd = index - 2;
  while (wordEnd > 0 && /\s/.test(input[wordEnd - 1])) {
    wordEnd--;
  }
  let start = wordEnd;
  while (start > 0 && !/\s/.test(input[start - 1])) {
    start--;
  }
  return (
    start < wordEnd &&
    charIsUpperCase(characterAt(input, start)) &&
    next < input.length &&
    charIsUpperCase(characterAt(input, next))
  );
}

/** Cache the shared token tail while numeric citation lookaheads advance through it. */
function numericContinuationChecker(input: string): (index: number) => boolean {
  let end = 0;
  let lastPercent = -1;
  let continuation = false;
  return (index) => {
    if (index >= end) {
      end = index;
      lastPercent = -1;
      while (end < input.length && !/\s/.test(input[end])) {
        if (input[end] === '%') {
          lastPercent = end;
        }
        end++;
      }
      // One token character retains the original unit/space grammar without rescanning its body.
      continuation = numericSentenceContinuationReg.test(input.slice(end - 1));
    }
    return lastPercent > index || continuation;
  };
}

/** Separated bare numbers may start a sentence; brackets disambiguate citation chains. */
function numericCitationEnd(input: string, start: number): number | undefined {
  numericCitationReg.lastIndex = start;
  if (numericCitationReg.exec(input) === null) {
    return undefined;
  }
  let end = numericCitationReg.lastIndex;
  if (!/[[(]/.test(input[start])) {
    return end;
  }
  while (end < input.length) {
    let next = end;
    while (next < input.length && /[^\S\r\n\u2028\u2029]/.test(input[next])) {
      next++;
    }
    const punctuation = input[next] === ',' || input[next] === ';';
    if (punctuation) {
      next++;
      while (next < input.length && /[^\S\r\n\u2028\u2029]/.test(input[next])) {
        next++;
      }
    }
    if (!/[[(]/.test(input[next] ?? '') || (!punctuation && next > end && input[next] !== '[')) {
      break;
    }
    numericCitationReg.lastIndex = next;
    if (numericCitationReg.exec(input) === null) {
      break;
    }
    end = numericCitationReg.lastIndex;
  }
  return end;
}

function citationDelimiterEnd(
  input: string,
  index: number,
  pending: string[],
  flags: Uint8Array,
  preserveOpeners = false,
): number {
  let end = index + 1;
  const state = { pending, preserveOpeners };
  for (;;) {
    const nextEnd = closingDelimiterEnd(input, end - 1, hasCitationDoubleQuote(pending));
    const consumed = advanceCitationClosers(input, end, nextEnd, state);
    if (consumed < nextEnd) {
      return consumed;
    }
    end = nextEnd;
    let next = end;
    while (next < input.length && /\s/.test(input[next])) {
      next++;
    }
    if (
      next > end &&
      isCitationDoubleCloser(pending.at(-1)) &&
      citationCloserWidth(input, next, pending) > 0
    ) {
      end = next;
      continue;
    }
    if (next > end && input[next] !== pending.at(-1)) {
      return end;
    }
    if (
      !(
        /[”’»›」』]/.test(input[next] ?? '') ||
        (/[“‘]/.test(input[next] ?? '') &&
          isSharedCitationCloser(input[next], pending, flags[next])) ||
        (input[next] === pending.at(-1) && /["']/.test(input[next]))
      )
    ) {
      return end;
    }
    if (input[next] === pending.at(-1)) {
      pending.pop();
    }
    end = next + 1;
  }
}

function advanceCitationClosers(
  input: string,
  start: number,
  end: number,
  state: { pending: string[]; preserveOpeners: boolean },
): number {
  for (let position = start; position < end; position++) {
    const width = citationCloserWidth(input, position, state.pending);
    if (width > 0) {
      state.pending.pop();
      position += width - 1;
    } else if (state.preserveOpeners && /["']/.test(input[position])) {
      return position;
    }
  }
  return end;
}

function closesCitationQuotations(closing: string, quotationClosers: readonly string[]): boolean {
  let remaining = quotationClosers.length;
  for (let index = 0; index < closing.length; index++) {
    const width = citationCloserWidth(closing, index, quotationClosers, remaining);
    if (width > 0) {
      remaining--;
      index += width - 1;
    } else if (/["'“‘”’»›」』]/.test(closing[index])) {
      // An extra quote can open the next sentence; its number is not a citation.
      return false;
    }
  }
  return remaining === 0;
}

/** Classify each whitespace-delimited token once across monotone citation lookaheads. */
function pathOrAddressTokenChecker(
  input: string,
  caseNeutral: boolean,
): (index: number) => boolean {
  let end = 0;
  let pathOrAddress = false;
  return (index) => {
    if (index < end) {
      return pathOrAddress;
    }
    let start = index;
    while (start > 0 && !/\s/.test(input[start - 1])) {
      start--;
    }
    end = index;
    while (end < input.length && !/\s/.test(input[end])) {
      end++;
    }
    const token = input.slice(start, end).replace(/^["'“‘”«‹„‚「『([{<]+/, '');
    pathOrAddress =
      /[\\/]/.test(token) ||
      token.includes('@') ||
      /^www\./i.test(token) ||
      hasDottedHostname(token, caseNeutral);
    return pathOrAddress;
  };
}

/** Search each token once with the existing hostname vocabulary and casing policy. */
function hasDottedHostname(token: string, caseNeutral: boolean): boolean {
  for (const match of token.matchAll(hostnameTokenReg)) {
    const label = match[1];
    if (caseNeutral || label === label.toLowerCase() || label === label.toUpperCase()) {
      return true;
    }
  }
  return false;
}

/** Carry digit/underscore evidence across dotted components without prefix rescans. */
function citationIdentifierEvidenceChecker(input: string): (index: number) => boolean {
  let through = 0;
  let evidence = false;
  return (index) => {
    while (through < index) {
      const character = characterAt(input, through);
      if (!/^[\p{Letter}\p{Mark}\p{Number}_.-]$/u.test(character)) {
        evidence = false;
      } else if (/^[\p{Number}_]$/u.test(character)) {
        evidence = true;
      }
      through += character.length;
    }
    return evidence;
  };
}

/** Candidate terminals bound these backwards scans to disjoint identifier ranges. */
function citationIdentifierStart(input: string, index: number): number {
  let start = index;
  while (start > 0) {
    const precedingPair = input.codePointAt(start - 2);
    const width = precedingPair !== undefined && precedingPair > 0xff_ff ? 2 : 1;
    if (!/^[\p{Letter}\p{Mark}\p{Number}_-]$/u.test(input.slice(start - width, start))) {
      break;
    }
    start -= width;
  }
  return start;
}

function isLabeledCitationIdentifier(input: string, start: number, token: string): boolean {
  let labelEnd = start;
  while (labelEnd > 0 && /\s/.test(input[labelEnd - 1])) {
    labelEnd--;
  }
  return (
    labelEnd < start &&
    /^[\p{Letter}\p{Mark}\p{Number}_-]+$/u.test(token) &&
    /\b(?:appendix|section|chapter|part|figure|table|paragraph|article|clause)$/iu.test(
      input.slice(Math.max(0, labelEnd - 16), labelEnd),
    )
  );
}

function isCitationContext(
  input: string,
  index: number,
  following: string,
  bracketDepth: number,
  caseNeutral: boolean,
  hasIdentifierEvidence: boolean,
): boolean {
  const bracketed = following === '[' || following === '(';
  if (bracketDepth > 0 || !(bracketed || /^\p{Number}$/u.test(following))) {
    return false;
  }
  if (bracketed) {
    const lastWord =
      input.slice(Math.max(0, index - sentenceSuffixLength), index + 1).match(/\S+$/)?.[0] ?? '';
    return !(following === '(' && isPageNumberContinuation(lastWord, input.slice(index + 1)));
  }

  const previous = Array.from(input.slice(Math.max(0, index - 2), index)).at(-1) ?? '';
  const previousStart = index - previous.length;
  const tokenStart = citationIdentifierStart(input, index);
  const precedingToken = input.slice(tokenStart, index);
  // Letter-only identifiers and cited words are indistinguishable after case folding.
  const standaloneIdentifier =
    input[index] === '.' &&
    (hasIdentifierEvidence ||
      (!caseNeutral && /^[\p{Lu}\p{Lt}\p{Mark}\p{Number}_-]{2,}$/u.test(precedingToken)));
  const labeledSection = isLabeledCitationIdentifier(input, tokenStart, precedingToken);
  const compactDate = input[index] === '.' && ABBR_DATES.includes(precedingToken.toLowerCase());
  return (
    /^[\p{Letter}\p{Mark})\]}>!?]$/u.test(previous) &&
    !standaloneIdentifier &&
    !labeledSection &&
    !compactDate &&
    !(
      input[index] === '.' &&
      /^\p{Letter}$/u.test(previous) &&
      (previousStart === 0 || /\s/.test(input[previousStart - 1]))
    )
  );
}

const numericComparisonOperandReg =
  /(?:\p{Number}+(?:\.\p{Number}+)?|\.\p{Number}+)(?:[eE][+-]?\p{Number}+)?(?![\p{Letter}\p{Mark}\p{Number}_]|\.[\p{Letter}\p{Mark}\p{Number}_])/uy;

/** A numeric comparison needs operands; preserve literal and quoted angle wrappers. */
function isNumericComparisonAngle(input: string, index: number): boolean {
  let left = index - 1;
  while (left >= 0 && /[^\S\r\n\u2028\u2029]/.test(input[left])) {
    left--;
  }
  let right = index + 1;
  while (right < input.length && /[^\S\r\n\u2028\u2029]/.test(input[right])) {
    right++;
  }
  let operandStart = left;
  while (
    operandStart >= 0 &&
    /[\p{Letter}\p{Mark}\p{Number}._\uD800-\uDFFF]/u.test(input[operandStart])
  ) {
    operandStart--;
  }
  const operand =
    /[)\]}]/.test(input[left] ?? '') ||
    /^(?:\p{Letter}\p{Mark}*|(?:\p{Number}+(?:\.\p{Number}+)?|\.\p{Number}+)(?:[eE][+-]?\p{Number}+)?)$/u.test(
      input.slice(operandStart + 1, left + 1),
    );
  numericComparisonOperandReg.lastIndex = right;
  return operand && numericComparisonOperandReg.test(input);
}

function countClosingBrackets(
  input: string,
  start: number,
  end: number,
  angles = Number.POSITIVE_INFINITY,
): number {
  let count = 0;
  let remainingAngles = angles;
  for (let index = start; index < end; index++) {
    if (closingBracketReg.test(input[index]) && (input[index] !== '>' || remainingAngles > 0)) {
      count++;
      remainingAngles -= Number(input[index] === '>');
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
  const hostnameLabel = following.match(hostnameLabelReg)?.[0];
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

function isNeutralSentenceStart(
  input: string,
  previousEnd: number,
  next: number,
  quotedStart = false,
): boolean {
  if (!isCasedCharacter(characterAt(input, next))) {
    return false;
  }

  const continuation = input.slice(next);
  return (
    quotedStart ||
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
