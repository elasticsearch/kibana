/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getEsqlLexerTokens, isVisibleToken } from './lexer_scope';

describe('getEsqlLexerTokens', () => {
  it('reads visible tokens from incomplete autocomplete input', () => {
    const visibleTokenTexts = getEsqlLexerTokens('FROM a | KEEP ')
      .filter(isVisibleToken)
      .map(({ text }) => text);

    expect(visibleTokenTexts).toEqual(['FROM', 'a', '|', 'KEEP']);
  });

  it('keeps tokens emitted before incomplete trailing text', () => {
    const visibleTokenTexts = getEsqlLexerTokens('FROM a | EVAL "abc')
      .filter(isVisibleToken)
      .map(({ text }) => text);

    expect(visibleTokenTexts).toEqual(['FROM', 'a', '|', 'EVAL']);
  });

  it('keeps tokens emitted before a lexer error', () => {
    const visibleTokenTexts = getEsqlLexerTokens('FROM a | EVAL )')
      .filter(isVisibleToken)
      .map(({ text }) => text);

    expect(visibleTokenTexts).toEqual(['FROM', 'a', '|', 'EVAL']);
  });
});
