/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UiSettingsCommon } from '@kbn/data-views-plugin/common';
import { getEsqlFn } from './esql';
import type { ExecutionContext } from '@kbn/expressions-plugin/common';
import type {
  ISearchMethods,
  IEsqlSearchParams,
  IEsqlSearchOptions,
  IEsqlSearchResult,
} from '@kbn/search-types';
import type { KibanaContext } from '..';
import type { ESQLColumn } from '@kbn/es-types';

interface MockTypedSearchService {
  esql: jest.Mock<Promise<IEsqlSearchResult>, [IEsqlSearchParams, IEsqlSearchOptions?]>;
}

const mockUiSettings = (): UiSettingsCommon =>
  ({
    get: jest.fn((key: string) => {
      if (key === 'dateFormat:tz') return 'UTC';
      return undefined;
    }),
  } as unknown as UiSettingsCommon);

const createExecutionContext = (): ExecutionContext =>
  ({
    abortSignal: new AbortController().signal,
    inspectorAdapters: {},
    getKibanaRequest: jest.fn(),
    getSearchSessionId: jest.fn(),
    getExecutionContext: jest.fn(),
  } as unknown as ExecutionContext);

const getMockSearchService = (
  columns: ESQLColumn[],
  values: unknown[][] = [['v1']]
): MockTypedSearchService => {
  const mockTyped = {
    esql: jest.fn().mockResolvedValue({
      rawResponse: {
        values,
        columns,
      },
    }),
  } as unknown as MockTypedSearchService;

  return mockTyped;
};
const createEsqlFn = (mockSearchService: MockTypedSearchService) =>
  getEsqlFn({
    getStartDependencies: async () => ({
      searchService: mockSearchService as unknown as ISearchMethods,
      uiSettings: mockUiSettings(),
    }),
  });

describe('getEsqlFn', () => {
  it('should always return a fully serializable table', async () => {
    const esqlFn = createEsqlFn(
      getMockSearchService([{ name: 'column1', type: 'string' }], [['value1']])
    );

    const result = await esqlFn.fn(null, { query: 'FROM index' }, createExecutionContext());

    expect(result?.type).toEqual('datatable');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  describe('ignoreGlobalFilters', () => {
    const inputFilter = {
      meta: { alias: null, disabled: false, negate: false },
      query: { match_phrase: { myField: 'uniqueFromFilterPill' } },
    };

    const input: KibanaContext = {
      type: 'kibana_context',
      filters: [inputFilter],
      query: {
        language: 'kuery',
        query: 'myField:uniqueFromQueryBar',
      },
    };

    it('should include global query and filters in params.filter when ignoreGlobalFilters is false', async () => {
      const mockSearchService = getMockSearchService([], []);

      await createEsqlFn(mockSearchService).fn(
        input,
        { query: 'FROM index', ignoreGlobalFilters: false },
        createExecutionContext()
      );

      const params = mockSearchService.esql.mock.calls[0][0];
      expect(params.query).toBe('FROM index');
      const filterJson = JSON.stringify(params.filter);
      expect(filterJson).toContain('uniqueFromFilterPill');
      expect(filterJson).toContain('uniqueFromQueryBar');
    });

    it('should exclude global query and filters from params.filter when ignoreGlobalFilters is true', async () => {
      const mockSearchService = getMockSearchService([], []);

      await createEsqlFn(mockSearchService).fn(
        input,
        { query: 'FROM index', ignoreGlobalFilters: true },
        createExecutionContext()
      );

      const params = mockSearchService.esql.mock.calls[0][0];
      expect(params.query).toBe('FROM index');
      const filterJson = JSON.stringify(params.filter);
      expect(filterJson).not.toContain('uniqueFromFilterPill');
      expect(filterJson).not.toContain('uniqueFromQueryBar');
    });
  });

  it('resolves meta.sourceParams.sourceField through RENAME to the underlying field', async () => {
    const mockSearchService = getMockSearchService([{ name: 'new_name', type: 'keyword' }]);

    const result = await createEsqlFn(mockSearchService).fn(
      null,
      { query: 'FROM index | RENAME old_name AS new_name' },
      createExecutionContext()
    );

    expect(result?.columns?.[0]?.meta?.sourceParams?.sourceField).toBe('old_name');
    expect(result?.columns?.[0]?.name).toBe('new_name');
  });

  it('keeps meta.sourceParams.sourceField as the ES column name without RENAME', async () => {
    const mockSearchService = getMockSearchService([{ name: 'host', type: 'keyword' }]);

    const result = await createEsqlFn(mockSearchService).fn(
      null,
      { query: 'FROM index' },
      createExecutionContext()
    );

    expect(result?.columns?.[0]?.meta?.sourceParams?.sourceField).toBe('host');
  });

  it('resolves chained RENAME pipeline for meta.sourceParams.sourceField', async () => {
    const mockSearchService = getMockSearchService([{ name: 'c', type: 'keyword' }]);

    const result = await createEsqlFn(mockSearchService).fn(
      null,
      { query: 'FROM index | RENAME a AS b | RENAME b AS c' },
      createExecutionContext()
    );

    expect(result?.columns?.[0]?.meta?.sourceParams?.sourceField).toBe('a');
    expect(result?.columns?.[0]?.name).toBe('c');
  });

  it('resolves meta.sourceParams.sourceField for STATS BY alias = column', async () => {
    const mockSearchService = getMockSearchService([
      { name: 'cnt', type: 'long' },
      { name: 'region', type: 'keyword' },
    ]);

    const query = 'FROM index | STATS cnt = COUNT(*) BY region = country';
    const result = await createEsqlFn(mockSearchService).fn(
      null,
      { query },
      createExecutionContext()
    );

    const regionColumn = result?.columns?.find((col) => col.name === 'region');
    expect(regionColumn?.meta?.sourceParams?.sourceField).toBe('country');
    expect(
      result?.columns?.find((col) => col.name === 'cnt')?.meta?.sourceParams?.sourceField
    ).toBe('cnt');
  });

  describe('resolves meta.sourceParams.params for bucket metadata', () => {
    it('maps bucket _meta to used_interval using the datemath unit suffix', async () => {
      const mockSearchService = getMockSearchService([
        { name: '@timestamp', type: 'date', _meta: { bucket: { interval: 30, unit: 'second' } } },
      ]);

      const result = await createEsqlFn(mockSearchService).fn(
        null,
        { query: 'FROM index | STATS COUNT(*) BY BUCKET(@timestamp, 30 seconds)' },
        createExecutionContext()
      );

      const params = result?.columns?.[0]?.meta?.sourceParams?.params;
      expect(params).toBeDefined();
      expect(params).toHaveProperty('used_interval', '30s');
      expect(params).toHaveProperty('used_time_zone', 'UTC');
    });

    it('falls back to the raw interval when the unit is not a known datemath unit', async () => {
      const mockSearchService = getMockSearchService([
        { name: '@timestamp', type: 'date', _meta: { bucket: { interval: 3, unit: 'quarter' } } },
      ]);

      const result = await createEsqlFn(mockSearchService).fn(
        null,
        { query: 'FROM index' },
        createExecutionContext()
      );

      const params = result?.columns?.[0]?.meta?.sourceParams?.params;
      expect(params).toBeDefined();
      expect(params).toHaveProperty('used_interval', 3);
    });

    describe('resolves meta.sourceParams.appliedTimeRange for date columns when an input time range is provided', () => {
      it('sets appliedTimeRange for date columns when an input time range is provided', async () => {
        const mockSearchService = getMockSearchService([{ name: '@timestamp', type: 'date' }]);

        const input: KibanaContext = {
          type: 'kibana_context',
          timeRange: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' },
        };

        const result = await createEsqlFn(mockSearchService).fn(
          input,
          { query: 'FROM index' },
          createExecutionContext()
        );

        const sourceParams = result?.columns?.[0]?.meta?.sourceParams;
        expect(sourceParams).toHaveProperty('appliedTimeRange', {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-02T00:00:00.000Z',
        });
      });
    });
  });
});
