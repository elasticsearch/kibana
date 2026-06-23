/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { computePrefixRange, attachReplacementRanges, type PrefixResult } from './prefix_range';
import { ReplacementRangeStrategyKind } from './prefix_range';
import type { ISuggestionItem } from '../../../commands/registry/types';
import { getEsqlLexerTokens } from '../../shared/lexer_scope';

describe('computePrefixRange', () => {
  const expectPrefix = (
    query: string,
    expectedPrefix: string,
    expectedClassification: PrefixResult['classification']
  ) => {
    const result = computePrefixRange(query);
    expect(result.prefix).toBe(expectedPrefix);
    expect(result.classification).toBe(expectedClassification);
    if (expectedPrefix.length > 0) {
      expect(query.substring(result.range.start, result.range.end)).toBe(expectedPrefix);
    }
  };

  describe('single-token prefix (multi-token overlap handled by attachReplacementRanges)', () => {
    it('IS N → last token N', () => {
      expectPrefix('FROM a | WHERE foo IS N', 'N', 'token-based');
    });

    it('IS NOT N → last token N', () => {
      expectPrefix('FROM a | WHERE foo IS NOT N', 'N', 'token-based');
    });

    it('NULLS F → last token F', () => {
      expectPrefix('FROM a | SORT field NULLS F', 'F', 'token-based');
    });

    it('NOT I → last token I', () => {
      expectPrefix('FROM a | WHERE foo NOT I', 'I', 'token-based');
    });

    it('NULLS followed by whitespace → empty prefix', () => {
      expectPrefix('FROM a | SORT field NULLS ', '', 'token-based');
    });

    it('NULLS followed by whitespace after ASC → empty prefix', () => {
      expectPrefix('FROM a | SORT field ASC NULLS ', '', 'token-based');
    });

    it('complete NOT IN followed by whitespace → no prefix', () => {
      expectPrefix('FROM a | WHERE foo NOT IN ', '', 'token-based');
    });
  });

  describe('dot-field combining', () => {
    it('event.data in WHERE', () => {
      expectPrefix('FROM a | WHERE event.data', 'event.data', 'compound-prefix');
    });

    it('event.data.fi in KEEP', () => {
      expectPrefix('FROM a | KEEP event.data.fi', 'event.data.fi', 'compound-prefix');
    });

    it('event.duration inside function call', () => {
      expectPrefix('FROM a | EVAL ROUND(event.duration', 'event.duration', 'compound-prefix');
    });

    it('backtick-quoted field with dot', () => {
      expectPrefix('FROM a | KEEP `my field`.na', '`my field`.na', 'compound-prefix');
    });

    it('trailing dot after dotted field keeps the dotted prefix', () => {
      expectPrefix('FROM a | KEEP event.data.', 'event.data.', 'compound-prefix');
    });
  });

  describe('token-based baselines', () => {
    it('source pattern in FROM mode', () => {
      expectPrefix('FROM logs-*', 'logs-*', 'token-based');
    });

    it('source pattern with dot in FROM mode', () => {
      expectPrefix('FROM logs-*.data', 'logs-*.data', 'token-based');
    });

    it('decimal literal is not treated as dot-field', () => {
      expectPrefix('FROM a | WHERE x > 3.14', '3.14', 'token-based');
    });

    it('spaces around dot prevent combining', () => {
      expectPrefix('FROM a | EVAL a . b', 'b', 'token-based');
    });

    it('uses the trailing token even beyond 500 visible tokens', () => {
      const repeatedClauses = Array.from({ length: 260 }, (_, i) => `| EVAL f${i} = ${i}`).join(
        ' '
      );
      const query = `FROM a ${repeatedClauses} | WHERE tail`;

      expectPrefix(query, 'tail', 'token-based');
    });
  });

  describe('structural delimiters', () => {
    it('delimiters like ( ) , = produce empty prefix', () => {
      expectPrefix('FROM a | STATS COUNT(', '', 'token-based');
      expectPrefix('FROM a | EVAL ROUND(field,', '', 'token-based');
      expectPrefix('FROM a | EVAL ROUND(field)', '', 'token-based');
      expectPrefix('FROM a | EVAL x =', '', 'token-based');
    });
  });

  describe('fallback required', () => {
    it('incomplete string after LIKE', () => {
      expectPrefix('FROM a | WHERE foo LIKE "pat', '"pat', 'fallback-required');
    });

    it('incomplete string after RLIKE', () => {
      expectPrefix('FROM a | WHERE foo RLIKE "[a-z', '"[a-z', 'fallback-required');
    });
  });
});

describe('attachReplacementRanges', () => {
  const makeSuggestion = (text: string, rangeToReplace?: { start: number; end: number }) =>
    ({
      text,
      label: text,
      kind: 'Variable' as const,
      sortText: text,
      ...(rangeToReplace ? { rangeToReplace } : {}),
    } as ISuggestionItem);
  const attachRanges = (
    innerText: string,
    suggestions: ISuggestionItem[],
    options: Omit<Parameters<typeof attachReplacementRanges>[2], 'tokens'> = {}
  ) =>
    attachReplacementRanges(innerText, suggestions, {
      ...options,
      tokens: getEsqlLexerTokens(innerText),
    });

  it('attaches range to suggestions without rangeToReplace', () => {
    const suggestions = [makeSuggestion('data'), makeSuggestion('duration')];
    const result = attachRanges('FROM a | KEEP event.data.fi', suggestions);

    for (const suggestion of result) {
      expect(suggestion.rangeToReplace).toEqual({ start: 14, end: 27 });
    }
  });

  it('preserves existing rangeToReplace', () => {
    const explicitRange = { start: 5, end: 10 };
    const suggestions = [makeSuggestion('IS NOT NULL', explicitRange), makeSuggestion('data')];
    const result = attachRanges('FROM a | KEEP event.data.fi', suggestions);

    expect(result[0].rangeToReplace).toEqual(explicitRange);
    expect(result[1].rangeToReplace).toEqual({ start: 14, end: 27 });
  });

  it('returns empty array unchanged', () => {
    const result = attachRanges('FROM a | KEEP fi', []);
    expect(result).toEqual([]);
  });

  it('uses overlap range for multi-token operators like IS NOT NULL', () => {
    const suggestions = [makeSuggestion('IS NOT NULL'), makeSuggestion('IS NULL')];
    const result = attachRanges('FROM a | WHERE foo IS N', suggestions);

    expect(result[0].rangeToReplace).toEqual({ start: 19, end: 23 });
    expect(result[1].rangeToReplace).toEqual({ start: 19, end: 23 });
  });

  it('uses overlap range for NULLS FIRST when prefix matches', () => {
    const suggestions = [makeSuggestion('NULLS FIRST'), makeSuggestion('NULLS LAST')];
    const result = attachRanges('FROM a | SORT field NULLS F', suggestions);

    // NULLS FIRST overlaps with "NULLS F" at end of query
    expect(result[0].rangeToReplace).toEqual({ start: 20, end: 27 });
    // NULLS LAST has no overlap with "NULLS F", falls back to last-token range
    expect(result[1].rangeToReplace).toEqual({ start: 26, end: 27 });
  });

  it('does not use overlap range for single-token field suggestions', () => {
    const suggestions = [makeSuggestion('event.dataset'), makeSuggestion('tags')];
    const result = attachRanges(
      'FROM a | FUSE linear KEY BY agent.keyword, event.dat',
      suggestions
    );

    expect(result[0].rangeToReplace).toEqual({ start: 43, end: 52 });
    expect(result[1].rangeToReplace).toEqual({ start: 43, end: 52 });
  });

  it('falls back to prefix range when no overlap exists', () => {
    const suggestions = [makeSuggestion('field1')];
    const result = attachRanges('FROM a | WHERE x > ', suggestions);

    expect(result[0].rangeToReplace).toEqual({ start: 19, end: 19 });
  });

  it('resolves declarative scoped-prefix replacement centrally', () => {
    const suggestions = [
      {
        ...makeSuggestion('"inference_id": "$0"'),
        replacementRangeStrategy: {
          kind: ReplacementRangeStrategyKind.SCOPED_PREFIX,
          scopeText: '{ "',
        },
      },
    ];

    const result = attachRanges('ignored', suggestions);

    expect(result[0].rangeToReplace).toEqual({ start: 2, end: 3 });
  });

  it('resolves declarative quoted-value replacement centrally', () => {
    const scopeText = '{"param1": "';
    const suggestions = [
      {
        ...makeSuggestion('"value1"'),
        replacementRangeStrategy: {
          kind: ReplacementRangeStrategyKind.QUOTED_VALUE,
          scopeText,
        },
      },
    ];

    const result = attachRanges('ignored', suggestions);

    expect(result[0].rangeToReplace).toEqual({ start: 11, end: 13 });
  });

  it('does not extend the quoted-value range when the typed prefix is not quoted', () => {
    const scopeText = '{"param1": val';
    const suggestions = [
      {
        ...makeSuggestion('"value1"'),
        replacementRangeStrategy: {
          kind: ReplacementRangeStrategyKind.QUOTED_VALUE,
          scopeText,
        },
      },
    ];

    const result = attachRanges('ignored', suggestions);

    expect(result[0].rangeToReplace).toEqual({ start: 11, end: 14 });
  });

  it('extends declarative quoted-value replacement past the typed prefix', () => {
    const scopeText = 'FROM a | COMPLETION "prompt" WITH { "inference_id": "inf';
    const suggestions = [
      {
        ...makeSuggestion('"value1"'),
        replacementRangeStrategy: {
          kind: ReplacementRangeStrategyKind.QUOTED_VALUE,
          scopeText,
        },
      },
    ];

    const result = attachRanges('ignored', suggestions);

    expect(result[0].rangeToReplace).toEqual({ start: 52, end: 57 });
  });

  it('resolves declarative whole-scope replacement centrally', () => {
    const suggestions = [
      {
        ...makeSuggestion('value'),
        replacementRangeStrategy: {
          kind: ReplacementRangeStrategyKind.WHOLE_SCOPE,
          scopeText: 'typed value',
          startOffset: 5,
        },
      },
    ];

    const result = attachRanges('ignored', suggestions);

    expect(result[0].rangeToReplace).toEqual({ start: 5, end: 16 });
  });

  it('resolves declarative trailing-whitespace replacement centrally', () => {
    const suggestions: ISuggestionItem[] = [
      {
        ...makeSuggestion(', '),
        replacementRangeStrategy: {
          kind: ReplacementRangeStrategyKind.TRAILING_WHITESPACE,
        },
      },
    ];

    const result = attachRanges('FROM a | SORT field ', suggestions);

    expect(result[0].rangeToReplace).toEqual({ start: 19, end: 20 });
  });

  it('resolves declarative root-query replacement centrally', () => {
    const suggestions: ISuggestionItem[] = [
      {
        ...makeSuggestion('FROM kibana_sample_data_logs | LIMIT 10'),
        replacementRangeStrategy: {
          kind: ReplacementRangeStrategyKind.ROOT_QUERY,
        },
      },
    ];

    const result = attachRanges('FR', suggestions, {
      fullText: 'FROM kibana_sample_data_logs | STATS count = COUNT(*)',
      offset: 2,
    });

    expect(result[0].rangeToReplace).toEqual({ start: 0, end: 53 });
  });
});
