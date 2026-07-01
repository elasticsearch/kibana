/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of } from 'rxjs';

import type { estypes } from '@elastic/elasticsearch';

import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import type { getSearchParamsFromRequest, SearchRequest } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';

import { extendSearchParamsWithRuntimeFields, SearchAPI } from './search_api';

const mockComputedFields = (
  dataViewsStart: DataViewsPublicPluginStart,
  index: string,
  runtimeFields: Record<string, unknown>
) => {
  dataViewsStart.find = jest.fn().mockReturnValue([
    {
      title: index,
      getComputedFields: () => ({
        runtimeFields,
      }),
      getRuntimeMappings: () => runtimeFields,
    },
  ]);
};

describe('extendSearchParamsWithRuntimeFields', () => {
  let dataViewsStart: DataViewsPublicPluginStart;

  beforeEach(() => {
    dataViewsStart = dataViewPluginMocks.createStartContract();
  });

  test('should inject default runtime_mappings for known indexes', async () => {
    const requestParams = {};
    const runtimeFields = { foo: {} };

    mockComputedFields(dataViewsStart, 'index', runtimeFields);

    expect(await extendSearchParamsWithRuntimeFields(dataViewsStart, requestParams, 'index'))
      .toMatchInlineSnapshot(`
      Object {
        "runtime_mappings": Object {
          "foo": Object {},
        },
      }
    `);
  });

  test('should use runtime mappings from spec if specified', async () => {
    const requestParams = {
      runtime_mappings: {
        test: {},
      },
    } as unknown as ReturnType<typeof getSearchParamsFromRequest>;
    const runtimeFields = { foo: {} };

    mockComputedFields(dataViewsStart, 'index', runtimeFields);

    expect(await extendSearchParamsWithRuntimeFields(dataViewsStart, requestParams, 'index'))
      .toMatchInlineSnapshot(`
      Object {
        "runtime_mappings": Object {
          "test": Object {},
        },
      }
    `);
  });
});

describe('SearchAPI', () => {
  let mockSearch: jest.Mock;
  let dataViewsStart: DataViewsPublicPluginStart;
  let mockDependencies: any;

  beforeEach(() => {
    dataViewsStart = dataViewPluginMocks.createStartContract();
    mockSearch = jest.fn().mockReturnValue(
      of({
        rawResponse: [],
        isPartial: false,
        isRunning: false,
      })
    );
    mockDependencies = {
      search: {
        search: mockSearch,
      },
      indexPatterns: dataViewsStart,
      uiSettings: {
        get: jest.fn(),
      },
    };
    mockComputedFields(dataViewsStart, 'test-index', {});
  });

  describe('search', () => {
    test('should call search with the correct params', (done) => {
      const searchAPI = new SearchAPI(mockDependencies);
      const searchRequest: SearchRequest<estypes.SearchRequest> = {
        index: 'test-index',
        runtime_mappings: {},
      };
      searchAPI.search([searchRequest]).subscribe(() => {
        expect(mockSearch).toHaveBeenCalled();
        const searchRequestParams = mockSearch.mock.calls[0][0].params;
        expect(searchRequestParams).toMatchObject(searchRequest);
        done();
      });
    });

    test('should include and elevate body params in the search request', (done) => {
      const searchAPI = new SearchAPI(mockDependencies);
      const searchRequest: SearchRequest<estypes.SearchRequest> = {
        index: 'test-index',
        body: {
          runtime_mappings: {},
        },
      };
      searchAPI.search([searchRequest]).subscribe(() => {
        expect(mockSearch).toHaveBeenCalled();
        const searchRequestParams = mockSearch.mock.calls[0][0].params;
        expect(searchRequestParams).toEqual({
          index: 'test-index',
          runtime_mappings: {},
        });
        done();
      });
    });

    test('should use root params over body params in the search request', (done) => {
      const searchAPI = new SearchAPI(mockDependencies);
      const searchRequest: SearchRequest<estypes.SearchRequest> = {
        index: 'test-index',
        body: {
          runtime_mappings: {
            test: { type: 'keyword' },
          },
        },
        runtime_mappings: {},
      };
      searchAPI.search([searchRequest]).subscribe(() => {
        expect(mockSearch).toHaveBeenCalled();
        const searchRequestParams = mockSearch.mock.calls[0][0].params;
        expect(searchRequestParams).toEqual({
          index: 'test-index',
          runtime_mappings: {},
        });
        done();
      });
    });

    describe('projectRouting', () => {
      const testProjectRouting = (
        projectRouting: string | undefined,
        expectedValue: string | undefined,
        done: jest.DoneCallback
      ) => {
        const searchAPI = new SearchAPI(
          mockDependencies,
          undefined,
          undefined,
          undefined,
          undefined,
          projectRouting
        );
        const searchRequest: SearchRequest<{}> = {
          index: 'test-index',
        };

        searchAPI.search([searchRequest]).subscribe(() => {
          expect(mockSearch).toHaveBeenCalled();
          const searchOptions = mockSearch.mock.calls[0][1];
          expect(searchOptions?.projectRouting).toBe(expectedValue);
          done();
        });
      };

      test('should include project_routing in ES params when projectRouting is provided', (done) => {
        testProjectRouting('_alias:_origin', '_alias:_origin', done);
      });

      test('should not include project_routing in ES params when projectRouting is undefined', (done) => {
        testProjectRouting(undefined, undefined, done);
      });
    });
  });
});
