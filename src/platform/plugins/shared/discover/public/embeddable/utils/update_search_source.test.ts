/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createSearchSourceMock } from '@kbn/data-plugin/common/search/search_source/mocks';
import {
  buildDataViewMock,
  dataViewMock,
  deepMockedFields,
} from '@kbn/discover-utils/src/__mocks__';
import type { RangeFilter } from '@kbn/es-query';
import type { FetchContext } from '@kbn/presentation-publishing';
import type { SortOrder } from '@kbn/saved-search-plugin/public';
import { discoverServiceMock } from '../../__mocks__/services';
import { updateSearchSource } from './update_search_source';

const dataViewMockWithTimeField = buildDataViewMock({
  name: 'the-data-view',
  fields: deepMockedFields,
  timeFieldName: '@timestamp',
});

const defaultFetchContext: FetchContext = {
  isReload: false,
  filters: [{ meta: { disabled: false } }],
  query: { query: '', language: 'kuery' },
  searchSessionId: 'id',
  timeRange: { from: 'now-30m', to: 'now', mode: 'relative' },
  timeslice: undefined,
  esqlVariables: undefined,
  projectRouting: undefined,
  useApproximation: undefined,
};

describe('updateSearchSource', () => {
  const defaults = {
    sortDir: 'asc',
  };

  const customSampleSize = 70;

  it('updates a given search source with the usage of the new fields api', async () => {
    const searchSource = createSearchSourceMock({});
    updateSearchSource(
      discoverServiceMock,
      searchSource,
      dataViewMock,
      [] as SortOrder[],
      customSampleSize,
      defaultFetchContext,
      defaults
    );
    expect(searchSource.getField('fields')).toEqual([{ field: '*', include_unmapped: true }]);
    expect(searchSource.getField('fieldsFromSource')).toBe(undefined);
    expect(searchSource.getField('size')).toEqual(customSampleSize);
  });

  it('updates a given search source with sort field', async () => {
    const searchSource1 = createSearchSourceMock({});
    updateSearchSource(
      discoverServiceMock,
      searchSource1,
      dataViewMock,
      [] as SortOrder[],
      customSampleSize,
      defaultFetchContext,
      defaults
    );
    expect(searchSource1.getField('sort')).toEqual([{ _score: 'asc' }]);

    const searchSource2 = createSearchSourceMock({});
    updateSearchSource(
      discoverServiceMock,
      searchSource2,
      dataViewMockWithTimeField,
      [] as SortOrder[],
      customSampleSize,
      defaultFetchContext,
      {
        sortDir: 'desc',
      }
    );
    expect(searchSource2.getField('sort')).toEqual([{ _doc: 'desc' }]);

    const searchSource3 = createSearchSourceMock({});
    updateSearchSource(
      discoverServiceMock,
      searchSource3,
      dataViewMockWithTimeField,
      [['bytes', 'desc']] as SortOrder[],
      customSampleSize,
      defaultFetchContext,
      defaults
    );
    expect(searchSource3.getField('sort')).toEqual([
      {
        bytes: 'desc',
      },
      {
        _doc: 'desc',
      },
    ]);
  });

  it('updates the parent of a given search source with fetch context', async () => {
    const searchSource = createSearchSourceMock({});
    const parentSearchSource = createSearchSourceMock({});
    searchSource.setParent(parentSearchSource);

    updateSearchSource(
      discoverServiceMock,
      searchSource,
      dataViewMock,
      [] as SortOrder[],
      customSampleSize,
      defaultFetchContext,
      defaults
    );
    expect(parentSearchSource.getField('filter')).toEqual([{ meta: { disabled: false } }]);
    expect(parentSearchSource.getField('query')).toEqual({ query: '', language: 'kuery' });
  });

  it('updates the parent of a given search source with time filter fetch context', async () => {
    const timeRangeFilter: RangeFilter = {
      meta: {
        type: 'range',
        params: {},
        index: dataViewMockWithTimeField.id,
        field: '@timestamp',
      },
      query: {
        range: {
          '@timestamp': {
            format: 'strict_date_optional_time',
            gte: '2024-04-17T06:00:00.000Z',
            lte: '2024-04-18T05:59:59.999Z',
          },
        },
      },
    };
    discoverServiceMock.data.query.timefilter.timefilter.createFilter = jest.fn(() => {
      return timeRangeFilter;
    });

    const searchSource = createSearchSourceMock({});
    const parentSearchSource = createSearchSourceMock({});
    searchSource.setParent(parentSearchSource);

    updateSearchSource(
      discoverServiceMock,
      searchSource,
      dataViewMockWithTimeField,
      [] as SortOrder[],
      customSampleSize,
      defaultFetchContext,
      defaults
    );
    expect(parentSearchSource.getField('filter')).toEqual([
      timeRangeFilter,
      { meta: { disabled: false } },
    ]);
  });
});
