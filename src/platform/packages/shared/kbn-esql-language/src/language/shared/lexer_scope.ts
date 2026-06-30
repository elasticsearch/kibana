/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Parser, type ParseResult } from '@elastic/esql';
import { Token } from 'antlr4';
import { findFirstNonWhitespaceIndex } from '../../commands/definitions/utils/regex';

export type EsqlLexerToken = ParseResult['tokens'][number];

export const ESQL_PIPE_TOKEN_TEXT = '|';

interface OpenDelimiter {
  close: string;
  start: number;
}

interface PipeBoundary {
  index: number;
  scopeKey: string;
}

const OPENING_DELIMITERS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
};

const BLOCK_COMMENT_OPEN_DELIMITER = '/*';
const BLOCK_COMMENT_CLOSE_DELIMITER = '*/';

/** Reads lexer tokens best-effort from incomplete autocomplete input. */
export function getEsqlLexerTokens(text: string): EsqlLexerToken[] {
  const tokens: EsqlLexerToken[] = [];
  const maxTokens = text.length + 1;

  try {
    const parser = Parser.create(text);

    // Normal inputs stop on EOF. This cap is only a defensive guard in case the
    // lexer does not reach EOF;
    while (tokens.length < maxTokens) {
      const token = parser.lexer.nextToken();

      if (token.type === Token.EOF) {
        break;
      }

      tokens.push(token);
    }
  } catch {
    // Parser.parse can recover from malformed input. For autocomplete, keep going
    // with whatever tokens the lexer managed to emit before it failed.
  }

  return tokens;
}

/** Resolves the current command start from lexer-visible pipes in the active query parens. */
export function getTokenCommandStart(
  fullText: string,
  offset: number,
  tokens: EsqlLexerToken[],
  queryParenStarts: Set<number>
): number {
  const openDelimiters: OpenDelimiter[] = [];
  const pipes: PipeBoundary[] = [];

  for (const token of tokens) {
    if (token.start >= offset) {
      break;
    }

    if (startsUnclosedBlockComment(fullText, token.start, offset)) {
      break;
    }

    if (!isVisibleToken(token)) {
      continue;
    }

    const tokenText = token.text ?? '';

    if (tokenText === ESQL_PIPE_TOKEN_TEXT) {
      pipes.push({ index: token.start, scopeKey: getScopeKey(openDelimiters, queryParenStarts) });
      continue;
    }

    const close = OPENING_DELIMITERS[tokenText];
    if (close) {
      openDelimiters.push({ close, start: token.start });
      continue;
    }

    const currentDelimiter = openDelimiters[openDelimiters.length - 1];
    if (currentDelimiter?.close === tokenText) {
      openDelimiters.pop();
    }
  }

  // Pick the last pipe in the same query scope as the cursor. In `FORK (WHERE a | SORT b)`,
  // the pipe inside the branch wins; if there is no branch-local pipe, the branch paren starts the command.
  const scopeKey = getScopeKey(openDelimiters, queryParenStarts);
  const previousPipe = pipes.filter((pipe) => pipe.scopeKey === scopeKey).at(-1);
  const lastQueryParen = openDelimiters.filter(({ start }) => queryParenStarts.has(start)).at(-1);
  const boundaryIndex = previousPipe?.index ?? lastQueryParen?.start;

  return trimScopeStart(fullText, boundaryIndex === undefined ? 0 : boundaryIndex + 1, offset);
}

/** Filters out hidden-channel tokens such as whitespace and comments. */
export function isVisibleToken(token: EsqlLexerToken): boolean {
  return token.channel === Token.DEFAULT_CHANNEL;
}

/**
 * Stops command-boundary scanning at an unfinished block comment.
 * The lexer can expose comment contents before the closing delimiter, including pipes that are not command delimiters.
 */
function startsUnclosedBlockComment(text: string, start: number, offset: number): boolean {
  return (
    text.slice(start, start + BLOCK_COMMENT_OPEN_DELIMITER.length) ===
      BLOCK_COMMENT_OPEN_DELIMITER &&
    !text
      .slice(start + BLOCK_COMMENT_OPEN_DELIMITER.length, offset)
      .includes(BLOCK_COMMENT_CLOSE_DELIMITER)
  );
}

/** Builds a stable key for the active query parens so pipes are scoped to the right pipeline. */
function getScopeKey(openDelimiters: OpenDelimiter[], queryParenStarts: Set<number>): string {
  return openDelimiters
    .filter(({ start }) => queryParenStarts.has(start))
    .map(({ start }) => start)
    .join(ESQL_PIPE_TOKEN_TEXT);
}

/** Skips formatting whitespace between a delimiter and the command text that follows it. */
function trimScopeStart(text: string, start: number, end: number): number {
  const leadingWhitespaceLength = findFirstNonWhitespaceIndex(text.slice(start, end));

  return start + (leadingWhitespaceLength === -1 ? end - start : leadingWhitespaceLength);
}
