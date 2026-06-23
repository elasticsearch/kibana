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

export type EsqlLexerToken = ParseResult['tokens'][number];

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

/** Filters out hidden-channel tokens such as whitespace and comments. */
export function isVisibleToken(token: EsqlLexerToken): boolean {
  return token.channel === Token.DEFAULT_CHANNEL;
}
