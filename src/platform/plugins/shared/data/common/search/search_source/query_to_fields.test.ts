/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsQuerySortValue, SearchRequest } from '../..';
import { queryToFields, SortDirection } from '../..';
import type { DataViewLazyQueryToFields } from './query_to_fields';
import { type Filter, FILTERS } from '@kbn/es-query';

const createGetFieldsMock = (): jest.MockedFunction<DataViewLazyQueryToFields['getFields']> =>
  jest.fn().mockResolvedValue({
    getFieldMap: () => ({}),
    getFieldMapSorted: () => ({}),
  });

const createDataView = ({
  timeFieldName,
  sourceFiltering,
}: {
  timeFieldName?: string;
  sourceFiltering?: { excludes: string[] };
} = {}) => {
  const getFields = createGetFieldsMock();
  const dataView: DataViewLazyQueryToFields = {
    ...(timeFieldName ? { timeFieldName } : {}),
    getSourceFiltering: jest.fn().mockReturnValue(sourceFiltering),
    getFields,
  };

  return { dataView, getFields };
};

const createExistsFilter = (field: string): Filter => ({
  meta: { disabled: false },
  query: {
    exists: { field },
  },
});

const createCombinedFilter = (params: Filter[]): Filter => ({
  meta: {
    type: FILTERS.COMBINED,
    disabled: false,
    params,
  },
});

describe('SearchSource#queryToFields', () => {
  it('should include time field', async () => {
    const { dataView, getFields } = createDataView({ timeFieldName: '@timestamp' });
    const request: SearchRequest = { query: [] };
    await queryToFields({ dataView, request });
    const { fieldName } = getFields.mock.calls[0][0];
    expect(fieldName).toEqual(['@timestamp']);
  });

  it('should include sort field', async () => {
    const { dataView, getFields } = createDataView();
    const sort: EsQuerySortValue = { bytes: SortDirection.asc };
    const request: SearchRequest = { query: [] };
    await queryToFields({ dataView, sort, request });
    const { fieldName } = getFields.mock.calls[0][0];
    expect(fieldName).toEqual(['bytes']);
  });

  it('should include request KQL query fields', async () => {
    const { dataView, getFields } = createDataView({ timeFieldName: '@timestamp' });
    const request: SearchRequest = {
      query: [
        {
          language: 'kuery',
          query: 'log.level: debug AND NOT message: unknown',
        },
      ],
    };
    await queryToFields({ dataView, request });
    const { fieldName } = getFields.mock.calls[0][0];
    expect(fieldName).toEqual(['@timestamp', 'log.level', 'message']);
  });

  it('should not include request Lucene query fields', async () => {
    const { dataView, getFields } = createDataView({ timeFieldName: '@timestamp' });
    const request: SearchRequest = {
      query: [
        {
          language: 'lucene',
          query: 'host: artifacts\\.*',
        },
      ],
    };
    await queryToFields({ dataView, request });
    const { fieldName } = getFields.mock.calls[0][0];
    expect(fieldName).toEqual(['@timestamp']);
  });

  it('should include fields from nested combined filters', async () => {
    const { dataView, getFields } = createDataView({ sourceFiltering: { excludes: [] } });

    const combinedFilter = createCombinedFilter([
      createExistsFilter('process.name'),
      createCombinedFilter([
        { meta: { key: 'attributes.process.name', disabled: false } },
        createExistsFilter('stream.name'),
      ]),
    ]);

    const request: SearchRequest = {
      query: [],
      filters: [combinedFilter],
    };

    await queryToFields({ dataView, request });

    const { fieldName } = getFields.mock.calls[0][0];
    expect(fieldName).toEqual(['process.name', 'attributes.process.name', 'stream.name']);
  });
});
