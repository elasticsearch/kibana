/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getKqlSuggestionsIfApplicable } from './utils';
import type { ExpressionContext } from './types';

describe('getKqlSuggestionsIfApplicable', () => {
  const createContext = (innerText: string, getKqlSuggestions?: any): ExpressionContext =>
    ({
      innerText,
      callbacks: { getKqlSuggestions },
    } as ExpressionContext);

  it('should return null when getKqlSuggestions callback is not provided', async () => {
    const ctx = createContext('KQL("""query');
    const result = await getKqlSuggestionsIfApplicable(ctx);

    expect(result).toBeNull();
  });

  it('should return null when not inside a KQL function', async () => {
    const ctx = createContext('field1 == "value"', jest.fn());
    const result = await getKqlSuggestionsIfApplicable(ctx);

    expect(result).toBeNull();
  });

  it('should return null when inside a KQL function without triple quotes', async () => {
    const ctx = createContext('KQL("query")', jest.fn());
    const result = await getKqlSuggestionsIfApplicable(ctx);

    expect(result).toBeNull();
  });

  it('should return null when getKqlSuggestions returns empty array', async () => {
    const mockGetKqlSuggestions = jest.fn().mockResolvedValue([]);
    const ctx = createContext('KQL("""query', mockGetKqlSuggestions);
    const result = await getKqlSuggestionsIfApplicable(ctx);

    expect(result).toBeNull();
  });

  it('should return null when getKqlSuggestions throws an error', async () => {
    const mockGetKqlSuggestions = jest.fn().mockRejectedValue(new Error('Test error'));
    const ctx = createContext('KQL("""query', mockGetKqlSuggestions);
    const result = await getKqlSuggestionsIfApplicable(ctx);

    expect(result).toBeNull();
  });

  it('should return suggestions if applicable', async () => {
    const mockSuggestions = [
      {
        text: 'value1',
        label: 'value1',
        kind: 'Value',
        detail: 'A value',
        range: { start: 0, end: 5 },
      },
    ];
    const mockGetKqlSuggestions = jest.fn().mockResolvedValue(mockSuggestions);
    const ctx = createContext('KQL("""query', mockGetKqlSuggestions);

    const result = await getKqlSuggestionsIfApplicable(ctx);

    expect(result).toEqual([
      {
        text: 'value1',
        label: 'value1',
        kind: 'Value',
        detail: 'A value',
        // rangeToReplace = mock range shifted by startOffset (innerText.length - kqlQuery.length = 7).
        rangeToReplace: { start: 7, end: 12 },
      },
    ]);
  });
});
