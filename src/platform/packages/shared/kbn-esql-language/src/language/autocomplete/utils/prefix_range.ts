/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ICommandContext, ISuggestionItem } from '../../../commands/registry/types';
import { SuggestionCategory } from './sorting/types';
import { getOverlapRange } from '../../../commands/definitions/utils/shared';
import { getEsqlLexerTokens, isVisibleToken, type EsqlLexerToken } from '../../shared/lexer_scope';
import {
  containsWhitespace,
  findFirstNonWhitespaceIndex,
  isOnlyWhitespace,
  startsWithWordChar,
} from '../../../commands/definitions/utils/regex';

interface SuggestionRangeToReplace {
  start: number;
  end: number;
}

const ENDS_WITH_WHITESPACE_REGEX = /\s$/;

interface LexerToken {
  text: string;
  start: number;
  stop: number;
}

type PrefixClassification = 'token-based' | 'compound-prefix' | 'fallback-required';

export interface PrefixResult {
  prefix: string;
  range: { start: number; end: number };
  classification: PrefixClassification;
}

export enum ReplacementRangeStrategyKind {
  /** Replace the active prefix inside a scoped fragment. */
  SCOPED_PREFIX = 'scoped_prefix',
  /** Replace the whole scoped fragment. */
  WHOLE_SCOPE = 'whole_scope',
  /** Replace a quoted literal's value, keeping the quotes. */
  QUOTED_VALUE = 'quoted_value',
  /** Replace trailing whitespace before the cursor. */
  TRAILING_WHITESPACE = 'trailing_whitespace',
  /** Replace the entire root query. */
  ROOT_QUERY = 'root_query',
}

export type ReplacementRangeStrategy =
  | {
      kind:
        | ReplacementRangeStrategyKind.SCOPED_PREFIX
        | ReplacementRangeStrategyKind.WHOLE_SCOPE
        | ReplacementRangeStrategyKind.QUOTED_VALUE;
      scopeText: string;
      startOffset?: number;
    }
  | {
      kind: ReplacementRangeStrategyKind.TRAILING_WHITESPACE;
    }
  | {
      kind: ReplacementRangeStrategyKind.ROOT_QUERY;
    };

interface ScopedReplacementRangeOptions {
  /** Where the scoped fragment starts in the full query (defaults to 0). */
  startOffset?: number;
  /** Replace the whole scope instead of the active prefix. */
  replaceWholeScope?: boolean;
}

export interface AttachReplacementRangesOptions {
  /** Lexer tokens for `innerText`. */
  tokens: EsqlLexerToken[];
  /** Command context used to look up existing columns and resolve column-match rules. */
  commandContext?: ICommandContext;
  /** Full query text — required when a suggestion declares a `ROOT_QUERY` strategy. */
  fullText?: string;
  /** Cursor offset into `fullText` — required alongside `fullText` for `ROOT_QUERY`. */
  offset?: number;
}

/**
 * Standalone prefix resolver for callers that only have text.
 * The final suggestion range path passes prepared tokens to attachReplacementRanges
 * so it does not re-lex the same innerText.
 */
export function computePrefixRange(query: string): PrefixResult {
  return computePrefixRangeFromTokens(query, getEsqlLexerTokens(query));
}

function computePrefixRangeFromTokens(query: string, tokens: EsqlLexerToken[]): PrefixResult {
  const visibleTokens = getVisibleLexerTokens(tokens);

  if (visibleTokens.length === 0) {
    return createEmptyPrefixResult(query, 'fallback-required');
  }

  const lastToken = visibleTokens[visibleTokens.length - 1];
  const lastTokenEnd = lastToken.stop + 1;

  // "WHERE x IS N" → the lexer tokenizes up to "IS", leaving " N" as unrecognized text (gap = 2)
  const gap = query.length - lastTokenEnd;

  // the user is typing something the lexer can't parse yet (e.g. a partial keyword like "N" for "NOT NULL")
  if (gap > 0) {
    return getPrefixResultFromUnparsedTrailingText(query, lastTokenEnd);
  }

  // Structural delimiters like ( ) , . = are not valid prefixes — cursor is in an empty position
  if (!startsWithWordChar(lastToken.text[0])) {
    return getPrefixResultAfterDelimiter(query, visibleTokens);
  }

  return getPrefixResultFromLastToken(query, visibleTokens, lastToken, lastTokenEnd);
}

// =============================================
// Replacement Range Resolver
// =============================================

/** Attaches replacement ranges, preserveTypedPrefix and requiresExistingColumnMatch. */
export function attachReplacementRanges(
  innerText: string,
  suggestions: ISuggestionItem[],
  options: AttachReplacementRangesOptions
): ISuggestionItem[] {
  if (suggestions.length === 0) {
    return suggestions;
  }

  const { commandContext, fullText, offset, tokens } = options;
  const prefixResult = computePrefixRangeFromTokens(innerText, tokens);
  const { prefix, range } = prefixResult;
  const hasExistingColumnMatch = Boolean(prefix && commandContext?.columns.has(prefix));
  const prefixMatchesExistingColumn =
    hasExistingColumnMatch &&
    suggestions.some((suggestion) => suggestion.requiresExistingColumnMatch);

  return suggestions.flatMap((suggestion) => {
    const {
      requiresExistingColumnMatch,
      preserveTypedPrefix,
      rangeToReplace,
      replacementRangeStrategy,
      filterText,
    } = suggestion;

    if (requiresExistingColumnMatch && !hasExistingColumnMatch) {
      return [];
    }

    const isStructural =
      suggestion.category === SuggestionCategory.NEW_LINE ||
      suggestion.category === SuggestionCategory.PIPE;

    if (!isStructural && prefixMatchesExistingColumn && !requiresExistingColumnMatch) {
      return [];
    }

    const suggestionWithPreservedPrefix =
      preserveTypedPrefix && prefix
        ? {
            ...suggestion,
            text: prefix + suggestion.text,
            filterText: filterText || prefix,
          }
        : suggestion;

    const resolvedSuggestion = suggestionWithPreservedPrefix;

    if (rangeToReplace) {
      return [resolvedSuggestion];
    }

    if (replacementRangeStrategy) {
      const resolvedRangeToReplace = resolveReplacementRange(replacementRangeStrategy, innerText, {
        fullText,
        offset,
      });

      if (!resolvedRangeToReplace) {
        return [resolvedSuggestion];
      }

      return [
        {
          ...resolvedSuggestion,
          rangeToReplace: resolvedRangeToReplace,
        },
      ];
    }

    // getOverlapRange is only needed for suggestions whose internal whitespace is
    // part of the typed sequence, such as "IS NOT NULL" after "IS NO|". Using
    // trimEnd() keeps trailing formatting whitespace from routing otherwise-normal
    // suggestions through the overlap path.
    const overlapRange = containsWhitespace(suggestion.text.trimEnd())
      ? getOverlapRange(innerText, suggestion.text)
      : undefined;
    const effectiveRange = overlapRange ?? { start: range.start, end: range.end };

    return [
      {
        ...resolvedSuggestion,
        rangeToReplace: effectiveRange,
      },
    ];
  });
}

/** Computes a replacement range for a scoped fragment. */
function computeScopedReplacementRange(
  scopeText: string,
  options: ScopedReplacementRangeOptions = {}
): SuggestionRangeToReplace {
  const { startOffset = 0, replaceWholeScope = false } = options;
  const localRange = replaceWholeScope
    ? { start: 0, end: scopeText.length }
    : computePrefixRange(scopeText).range;

  return {
    start: startOffset + localRange.start,
    end: startOffset + localRange.end,
  };
}

/** Computes a replacement range for quoted map values. */
function computeQuotedValueReplacementRange(
  scopeText: string,
  options: ScopedReplacementRangeOptions = {}
): SuggestionRangeToReplace {
  const prefixResult = computePrefixRange(scopeText);
  const range = computeScopedReplacementRange(scopeText, options);
  const needsClosingQuoteReplacement = prefixResult.prefix.startsWith('"');

  return {
    start: range.start,
    end: range.end + (needsClosingQuoteReplacement ? 1 : 0),
  };
}

/** Replaces a trailing whitespace character before inserting punctuation. */
function computeTrailingWhitespaceReplacementRange(innerText: string): SuggestionRangeToReplace {
  const endsWithWhitespace = ENDS_WITH_WHITESPACE_REGEX.test(innerText);

  return {
    start: endsWithWhitespace ? innerText.length - 1 : innerText.length,
    end: innerText.length,
  };
}

/** Replaces an existing root query when accepting a root-level suggestion. */
function computeRootQueryReplacementRange(
  fullText: string,
  offset: number
): SuggestionRangeToReplace | undefined {
  const textBeforeCursor = fullText.substring(0, offset);
  const start = computePrefixRange(textBeforeCursor).range.start;
  const end = fullText.length;

  // Nothing after the cursor, nothing to replace.
  if (start === offset && end === offset) {
    return;
  }

  return { start, end };
}

/** Resolves a declarative replacement strategy into an offset range. */
function resolveReplacementRange(
  strategy: ReplacementRangeStrategy,
  innerText: string,
  cursor: { fullText?: string; offset?: number } = {}
): SuggestionRangeToReplace | undefined {
  switch (strategy.kind) {
    case ReplacementRangeStrategyKind.TRAILING_WHITESPACE:
      return computeTrailingWhitespaceReplacementRange(innerText);

    case ReplacementRangeStrategyKind.SCOPED_PREFIX:
      return computeScopedReplacementRange(strategy.scopeText, {
        startOffset: strategy.startOffset,
      });

    case ReplacementRangeStrategyKind.WHOLE_SCOPE:
      return computeScopedReplacementRange(strategy.scopeText, {
        startOffset: strategy.startOffset,
        replaceWholeScope: true,
      });

    case ReplacementRangeStrategyKind.QUOTED_VALUE:
      return computeQuotedValueReplacementRange(strategy.scopeText, {
        startOffset: strategy.startOffset,
      });

    case ReplacementRangeStrategyKind.ROOT_QUERY:
      if (cursor.fullText === undefined || cursor.offset === undefined) {
        return;
      }
      return computeRootQueryReplacementRange(cursor.fullText, cursor.offset);
  }
}

// =============================================
// Local Helpers
// =============================================

/** Extracts visible (channel 0) tokens, reusing the defensive lexer reader. */
function getVisibleLexerTokens(tokens: EsqlLexerToken[]): LexerToken[] {
  return tokens
    .filter((token) => isVisibleToken(token) && token.text)
    .map(({ text, start, stop }) => ({ text: text ?? '', start, stop }));
}

/** Range of non-whitespace text after the last recognized token (fallback case). */
function getTrailingNonWhitespaceRange(
  query: string,
  startOffset: number
): { start: number; end: number } {
  const trailingText = query.substring(startOffset);
  const nonWhitespaceOffset = findFirstNonWhitespaceIndex(trailingText);
  const rangeStart = nonWhitespaceOffset >= 0 ? startOffset + nonWhitespaceOffset : query.length;

  return {
    start: rangeStart,
    end: query.length,
  };
}

/** Builds an empty-prefix result anchored at the current cursor position. */
function createEmptyPrefixResult(
  query: string,
  classification: PrefixClassification
): PrefixResult {
  return {
    prefix: '',
    range: { start: query.length, end: query.length },
    classification,
  };
}

/** Uses the lexer gap to recover partially typed text the lexer could not tokenize yet. */
function getPrefixResultFromUnparsedTrailingText(
  query: string,
  lastTokenEnd: number
): PrefixResult {
  const textAfterLastToken = query.substring(lastTokenEnd);

  if (isOnlyWhitespace(textAfterLastToken)) {
    return createEmptyPrefixResult(query, 'token-based');
  }

  const range = getTrailingNonWhitespaceRange(query, lastTokenEnd);

  return {
    prefix: query.substring(range.start, range.end),
    range,
    classification: 'fallback-required',
  };
}

/** Handles positions after delimiters, including a trailing dot that continues a field path. */
function getPrefixResultAfterDelimiter(query: string, tokens: LexerToken[]): PrefixResult {
  const trailingDotPrefix = getTrailingDotFieldPrefix(query, tokens);

  if (trailingDotPrefix) {
    return {
      ...trailingDotPrefix,
      classification: 'compound-prefix',
    };
  }

  return createEmptyPrefixResult(query, 'token-based');
}

/** Resolves a normal token prefix, expanding it if it belongs to a dotted field chain. */
function getPrefixResultFromLastToken(
  query: string,
  tokens: LexerToken[],
  lastToken: LexerToken,
  lastTokenEnd: number
): PrefixResult {
  const compoundStart = walkBackDotChain(tokens, tokens.length - 1, lastToken.start);

  if (compoundStart < lastToken.start) {
    return {
      prefix: query.substring(compoundStart, lastTokenEnd),
      range: { start: compoundStart, end: lastTokenEnd },
      classification: 'compound-prefix',
    };
  }

  return {
    prefix: lastToken.text,
    range: { start: lastToken.start, end: lastTokenEnd },
    classification: 'token-based',
  };
}

/** Extends a trailing dot into a dotted field prefix (e.g. event.data.). */
function getTrailingDotFieldPrefix(query: string, tokens: LexerToken[]) {
  if (tokens.length < 2) {
    return;
  }

  const dotToken = tokens[tokens.length - 1];

  if (dotToken.text !== '.') {
    return;
  }

  const previousToken = tokens[tokens.length - 2];

  if (
    previousToken.stop + 1 !== dotToken.start ||
    (!startsWithWordChar(previousToken.text[0]) && !previousToken.text.startsWith('`'))
  ) {
    return;
  }

  const compoundStart = walkBackDotChain(tokens, tokens.length - 2, previousToken.start);
  const range = { start: compoundStart, end: dotToken.stop + 1 };

  return {
    prefix: query.substring(range.start, range.end),
    range,
  };
}

/** Walks backwards through adjacent dot-separated tokens (e.g. event.data.field). */
function walkBackDotChain(tokens: LexerToken[], startIdx: number, compoundStart: number): number {
  let tokenIdx = startIdx;
  let result = compoundStart;

  while (tokenIdx >= 2) {
    const dotCandidate = tokens[tokenIdx - 1];
    const identCandidate = tokens[tokenIdx - 2];

    const isAdjacentDot =
      dotCandidate.text === '.' &&
      dotCandidate.stop + 1 === tokens[tokenIdx].start &&
      identCandidate.stop + 1 === dotCandidate.start;

    if (!isAdjacentDot) {
      break;
    }

    result = identCandidate.start;
    tokenIdx -= 2;
  }

  return result;
}
