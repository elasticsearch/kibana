/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { setStubKibanaServices } from '../../../services/mocks';
import { coreServices } from '../../../services/kibana_services';
import { OptionsListFetchCache } from './options_list_fetch_cache';

describe('OptionsListFetchCache', () => {
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    setStubKibanaServices();
  });

  beforeEach(() => {
    fetchSpy = jest.spyOn(coreServices.http, 'fetch').mockResolvedValue({
      suggestions: [{ value: 'a' }],
      totalCardinality: 1,
      invalidSelections: [],
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const phraseFilter = (field: string, value: string) => ({
    bool: {
      filter: [{ match_phrase: { [field]: value } }],
      must: [],
      must_not: [],
      should: [],
    },
  });

  const baseEsqlRequest = (overrides: Record<string, unknown> = {}) => ({
    kind: 'esql' as const,
    esql: 'FROM logs | KEEP host',
    timeRange: { from: 'now-15m', to: 'now' },
    searchString: '',
    selectedOptions: [],
    esqlVariables: [],
    ...overrides,
  });

  const okSuggestionsResponse = {
    suggestions: [{ value: 'a' }],
    totalCardinality: 1,
    invalidSelections: [] as string[],
  };

  it('POSTs ES|QL requests to the unified fetch route with the pre-built filter', async () => {
    fetchSpy.mockResolvedValueOnce(okSuggestionsResponse);
    const cache = new OptionsListFetchCache();
    const filter = phraseFilter('host', 'mainframe');

    await cache.runFetchRequest(baseEsqlRequest({ filter }), new AbortController().signal);

    expect(fetchSpy).toHaveBeenCalledWith('/internal/controls/optionsList/fetch', {
      version: '1',
      body: JSON.stringify(baseEsqlRequest({ filter })),
      signal: expect.any(AbortSignal),
      method: 'POST',
    });
  });

  it('refetches when the filter changes between calls', async () => {
    fetchSpy.mockResolvedValue(okSuggestionsResponse);
    const cache = new OptionsListFetchCache();

    await cache.runFetchRequest(
      baseEsqlRequest({ filter: phraseFilter('host', 'mainframe') }),
      new AbortController().signal
    );
    await cache.runFetchRequest(
      baseEsqlRequest({ filter: phraseFilter('host', 'cloud') }),
      new AbortController().signal
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('serves the cached response when called twice with the same filter', async () => {
    fetchSpy.mockResolvedValueOnce(okSuggestionsResponse);
    const cache = new OptionsListFetchCache();
    const filter = phraseFilter('host', 'mainframe');

    await cache.runFetchRequest(baseEsqlRequest({ filter }), new AbortController().signal);
    await cache.runFetchRequest(baseEsqlRequest({ filter }), new AbortController().signal);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches when the filter goes from undefined to a bool', async () => {
    fetchSpy.mockResolvedValue(okSuggestionsResponse);
    const cache = new OptionsListFetchCache();

    await cache.runFetchRequest(
      baseEsqlRequest({ filter: undefined }),
      new AbortController().signal
    );
    await cache.runFetchRequest(
      baseEsqlRequest({ filter: phraseFilter('host', 'mainframe') }),
      new AbortController().signal
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  describe('ignoreValidations', () => {
    it('returns invalidSelections from the server response', async () => {
      fetchSpy.mockResolvedValueOnce({
        suggestions: [{ value: 'mainframe' }],
        totalCardinality: 1,
        invalidSelections: ['cloud'],
      });
      const cache = new OptionsListFetchCache();

      const response = (await cache.runFetchRequest(
        baseEsqlRequest({
          selectedOptions: ['mainframe', 'cloud'],
          ignoreValidations: false,
        }),
        new AbortController().signal
      )) as { invalidSelections: unknown[] };

      expect(response.invalidSelections).toEqual(['cloud']);
    });

    it('refetches when ignoreValidations is toggled so cache stays consistent', async () => {
      fetchSpy.mockResolvedValue(okSuggestionsResponse);
      const cache = new OptionsListFetchCache();
      const selectedOptions = ['mainframe', 'cloud'];

      await cache.runFetchRequest(
        baseEsqlRequest({ selectedOptions, ignoreValidations: false }),
        new AbortController().signal
      );
      await cache.runFetchRequest(
        baseEsqlRequest({ selectedOptions, ignoreValidations: true }),
        new AbortController().signal
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('caches across selection changes when validations are ignored', async () => {
      fetchSpy.mockResolvedValueOnce(okSuggestionsResponse);
      const cache = new OptionsListFetchCache();

      await cache.runFetchRequest(
        baseEsqlRequest({ selectedOptions: ['mainframe'], ignoreValidations: true }),
        new AbortController().signal
      );
      await cache.runFetchRequest(
        baseEsqlRequest({ selectedOptions: ['cloud'], ignoreValidations: true }),
        new AbortController().signal
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
