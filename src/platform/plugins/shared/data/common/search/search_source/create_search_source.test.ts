/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createSearchSource as createSearchSourceFactory } from './create_search_source';
import type { SearchSourceDependencies } from './search_source';
import type { DataViewsContract, DataViewLazy } from '@kbn/data-views-plugin/common';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';

type CreateSearchSourceDataViews = Pick<
  DataViewsContract,
  'get' | 'create' | 'getDataViewLazy' | 'createDataViewLazy'
>;

describe('createSearchSource', () => {
  const indexPatternMock = createStubDataView({ spec: { title: 'test-pattern' } });
  let indexPatternContractMock: CreateSearchSourceDataViews;
  let dependencies: SearchSourceDependencies;
  let createSearchSource: ReturnType<typeof createSearchSourceFactory>;

  beforeEach(() => {
    dependencies = {
      aggs: {} as SearchSourceDependencies['aggs'],
      getConfig: jest.fn(),
      search: jest.fn(),
      onResponse: (req, res) => res,
      scriptedFieldsEnabled: true,
      dataViews: {
        getMetaFields: jest.fn().mockResolvedValue([]),
        getShortDotsEnable: jest.fn().mockResolvedValue(false),
      },
    };

    indexPatternContractMock = {
      get: jest.fn().mockResolvedValue(indexPatternMock),
      create: jest.fn(),
      getDataViewLazy: jest.fn(),
      createDataViewLazy: jest.fn(),
    };

    createSearchSource = createSearchSourceFactory(indexPatternContractMock, dependencies);
  });

  it('should set fields', async () => {
    const searchSource = await createSearchSource({
      highlightAll: true,
      query: {
        query: '',
        language: 'kuery',
      },
    });
    expect(searchSource.getOwnField('highlightAll')).toBe(true);
    expect(searchSource.getOwnField('query')).toEqual({
      query: '',
      language: 'kuery',
    });
  });

  it('should set filters and resolve referenced index patterns', async () => {
    const searchSource = await createSearchSource({
      filter: [
        {
          meta: {
            alias: null,
            negate: false,
            disabled: false,
            type: 'phrase',
            key: 'category.keyword',
            params: {
              query: "Men's Clothing",
            },
            index: '123-456',
          },
          query: {
            match_phrase: {
              'category.keyword': "Men's Clothing",
            },
          },
        },
      ],
    });
    expect(searchSource.getOwnField('filter')).toMatchInlineSnapshot(`
      Array [
        Object {
          "meta": Object {
            "alias": null,
            "disabled": false,
            "index": "123-456",
            "key": "category.keyword",
            "negate": false,
            "params": Object {
              "query": "Men's Clothing",
            },
            "type": "phrase",
          },
          "query": Object {
            "match_phrase": Object {
              "category.keyword": "Men's Clothing",
            },
          },
        },
      ]
    `);
  });

  it('should migrate legacy queries on the fly', async () => {
    const searchSource = await createSearchSource({
      highlightAll: true,
      query: 'a:b',
    });
    expect(searchSource.getOwnField('query')).toEqual({
      query: 'a:b',
      language: 'lucene',
    });
  });

  it('uses DataViews.get', async () => {
    const dataViewMock = createStubDataView({ spec: { id: '123-456', title: 'dv' } });
    jest.spyOn(dataViewMock, 'getSourceFiltering').mockReturnValue({ excludes: [] });
    const get = jest.fn().mockResolvedValue(dataViewMock);
    const create = jest.fn();
    const getDataViewLazy = jest.fn();
    const createDataViewLazy = jest.fn();
    indexPatternContractMock = { get, create, getDataViewLazy, createDataViewLazy };

    createSearchSource = createSearchSourceFactory(indexPatternContractMock, dependencies);

    await createSearchSource({
      index: '123-456',
      highlightAll: true,
      query: {
        query: '',
        language: 'kuery',
      },
    });
    expect(get).toHaveBeenCalledWith('123-456');
    expect(getDataViewLazy).not.toHaveBeenCalled();
  });

  it('uses DataViews.getDataViewLazy when flag is passed', async () => {
    const dataViewLazyMock: Pick<DataViewLazy, 'toSpec' | 'getSourceFiltering'> = {
      toSpec: jest.fn().mockResolvedValue({}),
      getSourceFiltering: jest.fn().mockReturnValue({ excludes: [] }),
    };
    const get = jest.fn();
    const create = jest.fn();
    const getDataViewLazy = jest.fn().mockResolvedValue(dataViewLazyMock as DataViewLazy);
    const createDataViewLazy = jest.fn();
    indexPatternContractMock = { get, create, getDataViewLazy, createDataViewLazy };

    createSearchSource = createSearchSourceFactory(indexPatternContractMock, dependencies);

    await createSearchSource(
      {
        index: '123-456',
        highlightAll: true,
        query: {
          query: '',
          language: 'kuery',
        },
      },
      true
    );
    expect(get).not.toHaveBeenCalled();
    expect(getDataViewLazy).toHaveBeenCalledWith('123-456');
  });
});
