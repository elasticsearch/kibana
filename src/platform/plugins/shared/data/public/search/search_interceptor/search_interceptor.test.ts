/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MockedKeys } from '@kbn/utility-types-jest';
import type { CoreSetup, CoreStart, HttpFetchOptions, HttpHandler } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';
import type { IEsSearchRequest, IKibanaSearchRequest } from '@kbn/search-types';
import { type IKibanaSearchResponse } from '@kbn/search-types';
import { SearchInterceptor } from './search_interceptor';
import { AbortError } from '@kbn/kibana-utils-plugin/public';
import { EsError, type IEsError } from '@kbn/search-errors';
import type { ISessionService, SearchInterceptorDeps } from '..';
import { SearchSessionState } from '..';
import * as searchPhaseException from '../../../common/search/test_data/search_phase_execution_exception.json';
import * as resourceNotFoundException from '../../../common/search/test_data/resource_not_found_exception.json';
import { BehaviorSubject } from 'rxjs';
import { dataPluginMock } from '../../mocks';
import { AbortReason } from '@kbn/kibana-utils-plugin/common';
import {
  ENHANCED_ES_SEARCH_STRATEGY,
  ESQL_ASYNC_SEARCH_STRATEGY,
  UI_SETTINGS,
} from '../../../common';
import type { SearchServiceStartDependencies } from '../search_service';
import type { Start as InspectorStart } from '@kbn/inspector-plugin/public';
import { SearchTimeoutError, TimeoutErrorMode } from './timeout_error';
import { SearchSessionIncompleteWarning } from './search_session_incomplete_warning';
import { getMockSearchConfig } from '../../../config.mock';
import type { ICPSManager } from '@kbn/cps-utils';
import moment from 'moment';

jest.mock('./create_request_hash', () => {
  const originalModule = jest.requireActual('./create_request_hash');
  return {
    ...originalModule,
    createRequestHash: jest.fn().mockImplementation((input) => {
      const { preference, ...params } = input;
      return JSON.stringify(params);
    }),
  };
});

jest.mock('./search_session_incomplete_warning', () => ({
  SearchSessionIncompleteWarning: jest.fn(),
}));
const SearchSessionIncompleteWarningMock = jest.mocked(SearchSessionIncompleteWarning);

let searchInterceptor: SearchInterceptor;

const flushPromises = () =>
  new Promise((resolve) => jest.requireActual('timers').setImmediate(resolve));

jest.useFakeTimers({ legacyFakeTimers: true });

const timeTravel = async (msToRun = 0) => {
  await flushPromises();
  jest.advanceTimersByTime(msToRun);
  return flushPromises();
};

const next = jest.fn();
const error = jest.fn();
const complete = jest.fn();

function getHttpMock(responses: any[]) {
  let i = 0;
  return ((path: string, options?: HttpFetchOptions) => {
    const request = JSON.parse(options?.body as string) as IKibanaSearchRequest;
    if (!request.id) i = 0;
    const { time = 0, value = {}, isError = false } = responses[i++];
    value.meta = {
      size: 10,
    };
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        return (isError ? reject : resolve)(value);
      }, time);

      if (options?.signal) {
        if (options?.signal.aborted) reject(new AbortError());
        options?.signal.addEventListener('abort', () => {
          reject(new AbortError());
        });
      }
    });
  }) as HttpHandler;
}

function getMockSearchResponse(
  { id, isPartial, isRunning, rawResponse }: IKibanaSearchResponse = {
    rawResponse: {},
  }
) {
  const body = {
    ...(id ? { id } : {}),
    is_partial: isPartial ?? false,
    is_running: isRunning ?? false,
    response: {
      took: 2,
      timed_out: false,
      _shards: {
        total: 12,
        successful: 12,
        skipped: 11,
        failed: 0,
      },
      hits: {
        total: {
          value: 61,
          relation: 'eq',
        },
        max_score: null,
        hits: [],
      },
      ...rawResponse,
    },
  };
  return { body };
}

describe('SearchInterceptor', () => {
  let mockCoreSetup: MockedKeys<CoreSetup>;
  let mockCoreStart: MockedKeys<CoreStart>;
  let sessionService: jest.Mocked<ISessionService>;
  let sessionState$: BehaviorSubject<SearchSessionState>;

  beforeEach(() => {
    mockCoreSetup = coreMock.createSetup();
    mockCoreStart = coreMock.createStart();
    sessionState$ = new BehaviorSubject<SearchSessionState>(SearchSessionState.None);
    const dataPluginMockStart = dataPluginMock.createStartContract();
    sessionService = {
      ...(dataPluginMockStart.search.session as jest.Mocked<ISessionService>),
      state$: sessionState$,
    };

    mockCoreSetup.http.post = jest.fn();
    mockCoreSetup.uiSettings.get.mockImplementation((name: string) => {
      switch (name) {
        case UI_SETTINGS.SEARCH_TIMEOUT:
          return 1000;
        default:
          return;
      }
    });

    next.mockReset();
    error.mockReset();
    complete.mockReset();
    jest.clearAllTimers();
    jest.clearAllMocks();

    const inspectorServiceMock = {
      open: () => {},
    } as unknown as InspectorStart;

    searchInterceptor = new SearchInterceptor({
      toasts: mockCoreSetup.notifications.toasts,
      startServices: new Promise((resolve) => {
        resolve([
          mockCoreStart,
          { inspector: inspectorServiceMock } as unknown as SearchServiceStartDependencies,
          {},
        ]);
      }),
      uiSettings: mockCoreSetup.uiSettings,
      http: mockCoreSetup.http,
      executionContext: mockCoreSetup.executionContext,
      session: sessionService,
      searchConfig: getMockSearchConfig({}),
    });
  });

  describe('showError', () => {
    test('Ignores an AbortError', async () => {
      searchInterceptor.showError(new AbortError());
      expect(mockCoreSetup.notifications.toasts.addDanger).not.toBeCalled();
      expect(mockCoreSetup.notifications.toasts.addError).not.toBeCalled();
    });

    test('Ignores a SearchTimeoutError', async () => {
      searchInterceptor.showError(new SearchTimeoutError(new Error(), TimeoutErrorMode.CONTACT));
      expect(mockCoreSetup.notifications.toasts.addDanger).not.toBeCalled();
      expect(mockCoreSetup.notifications.toasts.addError).not.toBeCalled();
    });

    test('Renders a EsError', async () => {
      searchInterceptor.showError(
        new EsError(
          {
            statusCode: 400,
            message: 'search_phase_execution_exception',
            attributes: {
              error: searchPhaseException.error,
            },
          },
          'search_phase_execution_exception',
          () => {}
        )
      );
      expect(mockCoreSetup.notifications.toasts.addDanger).toBeCalledTimes(1);
      expect(mockCoreSetup.notifications.toasts.addError).not.toBeCalled();
    });

    test('Renders a general error', async () => {
      searchInterceptor.showError(new Error('Oopsy'));
      expect(mockCoreSetup.notifications.toasts.addDanger).not.toBeCalled();
      expect(mockCoreSetup.notifications.toasts.addError).toBeCalledTimes(1);
    });
  });

  describe('search', () => {
    test('Observable should resolve if fetch is successful', async () => {
      mockCoreSetup.http.post.mockResolvedValueOnce(getMockSearchResponse());
      const mockRequest: IEsSearchRequest = {
        params: {},
      };
      const response = searchInterceptor.search(mockRequest);
      await expect(response.toPromise()).resolves.toMatchInlineSnapshot(`
        Object {
          "id": undefined,
          "isPartial": false,
          "isRestored": false,
          "isRunning": false,
          "loaded": 12,
          "rawResponse": Object {
            "_shards": Object {
              "failed": 0,
              "skipped": 11,
              "successful": 12,
              "total": 12,
            },
            "hits": Object {
              "hits": Array [],
              "max_score": null,
              "total": 61,
            },
            "timed_out": false,
            "took": 2,
          },
          "requestParams": Object {},
          "total": 12,
          "warning": undefined,
        }
      `);
    });

    test('should resolve immediately if first call returns full result', async () => {
      const responses = [
        {
          time: 10,
          value: getMockSearchResponse(),
        },
      ];
      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = searchInterceptor.search({});
      response.subscribe({ next, error, complete });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "id": undefined,
          "isPartial": false,
          "isRestored": false,
          "isRunning": false,
          "loaded": 12,
          "rawResponse": Object {
            "_shards": Object {
              "failed": 0,
              "skipped": 11,
              "successful": 12,
              "total": 12,
            },
            "hits": Object {
              "hits": Array [],
              "max_score": null,
              "total": 61,
            },
            "timed_out": false,
            "took": 2,
          },
          "requestParams": Object {},
          "total": 12,
          "warning": undefined,
        }
      `);
      expect(complete).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    test('should make secondary request if first call returns partial result (ES|QL)', async () => {
      const responses = [
        {
          time: 10,
          value: {
            body: {
              id: '1',
              is_running: true,
              documents_found: 0,
              values_loaded: 0,
              all_columns: [],
              columns: [],
              values: [],
              _clusters: {},
            },
          },
        },
        {
          time: 20,
          value: {
            body: {
              id: '1',
              is_running: false,
              took: 8,
              is_partial: false,
              documents_found: 5,
              values_loaded: 5,
              all_columns: [
                {
                  name: 'results',
                  type: 'long',
                },
                {
                  name: 'timestamp',
                  type: 'date',
                },
              ],
              columns: [
                {
                  name: 'results',
                  type: 'long',
                },
                {
                  name: 'timestamp',
                  type: 'date',
                },
              ],
              values: [
                [1, '2025-11-17T11:00:00.000Z'],
                [1, '2025-11-17T09:30:00.000Z'],
                [1, '2025-11-17T12:00:00.000Z'],
                [1, '2025-11-17T11:30:00.000Z'],
                [1, '2025-11-17T16:30:00.000Z'],
              ],
            },
          },
        },
      ];

      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = searchInterceptor.search(
        {
          params: {
            query:
              'FROM kibana_sample_data_logs | LIMIT 5 |EVAL DELAY(1s)\n| STATS results = COUNT(*) BY timestamp = BUCKET(@timestamp, 30 minute)',
            locale: 'en',
            include_execution_metadata: true,
            filter: {
              bool: {
                must: [],
                filter: [
                  {
                    range: {
                      '@timestamp': {
                        format: 'strict_date_optional_time',
                        gte: '2025-11-17T07:00:00.000Z',
                        lte: '2025-11-18T06:59:59.999Z',
                      },
                    },
                  },
                ],
                should: [],
                must_not: [],
              },
            },
            dropNullColumns: true,
          },
        },
        { pollInterval: 0, strategy: ESQL_ASYNC_SEARCH_STRATEGY }
      );
      response.subscribe({ next, error, complete });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "id": "1",
          "isPartial": undefined,
          "isRestored": false,
          "isRunning": true,
          "rawResponse": Object {
            "_clusters": Object {},
            "all_columns": Array [],
            "columns": Array [],
            "documents_found": 0,
            "id": "1",
            "is_running": true,
            "values": Array [],
            "values_loaded": 0,
          },
          "requestParams": Object {},
          "warning": undefined,
        }
      `);
      expect(complete).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();

      await timeTravel(20);

      expect(next).toHaveBeenCalledTimes(2);
      expect(next.mock.calls[1][0]).toMatchInlineSnapshot(`
        Object {
          "id": "1",
          "isPartial": false,
          "isRestored": false,
          "isRunning": false,
          "rawResponse": Object {
            "all_columns": Array [
              Object {
                "name": "results",
                "type": "long",
              },
              Object {
                "name": "timestamp",
                "type": "date",
              },
            ],
            "columns": Array [
              Object {
                "name": "results",
                "type": "long",
              },
              Object {
                "name": "timestamp",
                "type": "date",
              },
            ],
            "documents_found": 5,
            "id": "1",
            "is_partial": false,
            "is_running": false,
            "took": 8,
            "values": Array [
              Array [
                1,
                "2025-11-17T11:00:00.000Z",
              ],
              Array [
                1,
                "2025-11-17T09:30:00.000Z",
              ],
              Array [
                1,
                "2025-11-17T12:00:00.000Z",
              ],
              Array [
                1,
                "2025-11-17T11:30:00.000Z",
              ],
              Array [
                1,
                "2025-11-17T16:30:00.000Z",
              ],
            ],
            "values_loaded": 5,
          },
          "requestParams": Object {},
          "warning": undefined,
        }
      `);
      expect(complete).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();

      // check that the query and filter weren't included in the polling request
      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);
      const firstRequest = (
        mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
      )[1];
      expect(JSON.parse(firstRequest?.body as string).params?.query).toBeDefined();

      const secondRequest = (
        mockCoreSetup.http.post.mock.calls[1] as unknown as [string, HttpFetchOptions]
      )[1];
      expect(JSON.parse(secondRequest?.body as string).params?.query).not.toBeDefined();
      // FIXME: should be removed after https://github.com/elastic/elasticsearch/issues/138439
      expect(JSON.parse(secondRequest?.body as string).params?.dropNullColumns).toBeDefined();
    });

    test('should make secondary request if first call returns partial result (DSL)', async () => {
      const responses = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            id: '1',
            rawResponse: {
              took: 1,
            },
          }),
        },
        {
          time: 20,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            id: '1',
            rawResponse: {
              took: 1,
            },
          }),
        },
      ];

      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = searchInterceptor.search(
        {
          params: {
            body: { query: { match_all: {} } },
          },
        },
        { pollInterval: 0 }
      );
      response.subscribe({ next, error, complete });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "id": "1",
          "isPartial": true,
          "isRestored": false,
          "isRunning": true,
          "loaded": 12,
          "rawResponse": Object {
            "_shards": Object {
              "failed": 0,
              "skipped": 11,
              "successful": 12,
              "total": 12,
            },
            "hits": Object {
              "hits": Array [],
              "max_score": null,
              "total": 61,
            },
            "timed_out": false,
            "took": 1,
          },
          "requestParams": Object {},
          "total": 12,
          "warning": undefined,
        }
      `);
      expect(complete).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();

      await timeTravel(20);

      expect(next).toHaveBeenCalledTimes(2);
      expect(next.mock.calls[1][0]).toMatchInlineSnapshot(`
        Object {
          "id": "1",
          "isPartial": false,
          "isRestored": false,
          "isRunning": false,
          "loaded": 12,
          "rawResponse": Object {
            "_shards": Object {
              "failed": 0,
              "skipped": 11,
              "successful": 12,
              "total": 12,
            },
            "hits": Object {
              "hits": Array [],
              "max_score": null,
              "total": 61,
            },
            "timed_out": false,
            "took": 1,
          },
          "requestParams": Object {},
          "total": 12,
          "warning": undefined,
        }
      `);
      expect(complete).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();

      // check that the request body wasn't included on the 2nd request
      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);
      const firstRequest = (
        mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
      )[1];
      expect(JSON.parse(firstRequest?.body as string).params.body).toBeDefined();

      const secondRequest = (
        mockCoreSetup.http.post.mock.calls[1] as unknown as [string, HttpFetchOptions]
      )[1];
      expect(JSON.parse(secondRequest?.body as string).params.body).not.toBeDefined();
    });

    test('should abort on user abort', async () => {
      const responses = [
        {
          time: 500,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            rawResponse: {},
            id: '1',
          }),
        },
      ];
      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const abortController = new AbortController();
      abortController.abort();

      const response = searchInterceptor.search({}, { abortSignal: abortController.signal });
      response.subscribe({ next, error });

      await timeTravel(500);

      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toBeInstanceOf(AbortError);
    });

    test('should DELETE a running async search on abort', async () => {
      const responses = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            rawResponse: {},
            id: '1',
          }),
        },
        {
          time: 300,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            rawResponse: {},
            id: '1',
          }),
        },
      ];
      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const abortController = new AbortController();
      setTimeout(() => abortController.abort(), 250);

      const response = searchInterceptor.search(
        {},
        { abortSignal: abortController.signal, pollInterval: 0 }
      );
      response.subscribe({ next, error });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();

      await timeTravel(240);

      expect(error).toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toBeInstanceOf(AbortError);

      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);
      expect(mockCoreSetup.http.delete).toHaveBeenCalledTimes(1);
    });

    test('should not DELETE a running async search on async timeout prior to first response', async () => {
      const responses = [
        {
          time: 2000,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            rawResponse: {},
            id: '1',
          }),
        },
      ];
      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = searchInterceptor.search({}, { pollInterval: 0 });
      response.subscribe({ next, error });

      await timeTravel(1000);

      expect(mockCoreSetup.http.post).toHaveBeenCalled();
      expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();
    });

    test('should DELETE a running async search on async timeout after first response', async () => {
      mockCoreSetup.http.post.mockResolvedValue(
        getMockSearchResponse({
          isPartial: true,
          isRunning: true,
          rawResponse: {},
          id: '1',
        })
      );

      const response = searchInterceptor.search({}, { pollInterval: 0 });
      response.subscribe({ next, error });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(mockCoreSetup.http.post).toHaveBeenCalled();
      expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();

      // Long enough to reach the timeout
      await timeTravel(1000);

      expect(mockCoreSetup.http.delete).toHaveBeenCalledTimes(1);
    });

    test('should return the last response on async timeout', async () => {
      mockCoreSetup.http.post.mockResolvedValue(
        getMockSearchResponse({
          isPartial: true,
          isRunning: true,
          rawResponse: {
            foo: 'bar',
          },
          id: '1',
        })
      );

      const response = searchInterceptor.search({}, { pollInterval: 0 });
      response.subscribe({ next, error });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(mockCoreSetup.http.post).toHaveBeenCalled();
      expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();

      // Long enough to reach the timeout but not long enough to reach the next response
      await timeTravel(1000);

      expect(next).toHaveBeenCalledTimes(3);
      expect(next.mock.calls[1]).toMatchInlineSnapshot(`
        Array [
          Object {
            "id": "1",
            "isPartial": true,
            "isRestored": false,
            "isRunning": true,
            "loaded": 12,
            "rawResponse": Object {
              "_shards": Object {
                "failed": 0,
                "skipped": 11,
                "successful": 12,
                "total": 12,
              },
              "foo": "bar",
              "hits": Object {
                "hits": Array [],
                "max_score": null,
                "total": 61,
              },
              "timed_out": false,
              "took": 2,
            },
            "requestParams": Object {},
            "total": 12,
            "warning": undefined,
          },
        ]
      `);
    });

    test('should DELETE a running async search on async timeout on error from fetch', async () => {
      const responses = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            rawResponse: {},
            id: '1',
          }),
        },
        {
          time: 10,
          value: {
            statusCode: 500,
            message: 'oh no',
            id: '1',
          },
          isError: true,
        },
      ];
      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = searchInterceptor.search({}, { pollInterval: 0 });
      response.subscribe({ next, error });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(mockCoreSetup.http.post).toHaveBeenCalled();
      expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();

      // Long enough to reach the timeout but not long enough to reach the next response
      await timeTravel(10);

      expect(error).toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toBeInstanceOf(Error);
      expect((error.mock.calls[0][0] as Error).message).toBe('oh no');
      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);
      expect(mockCoreSetup.http.delete).toHaveBeenCalledTimes(1);
    });

    test('should report telemetry on timeout', async () => {
      mockCoreSetup.http.post.mockResolvedValue(
        getMockSearchResponse({
          isPartial: true,
          isRunning: true,
          rawResponse: {
            foo: 'bar',
          },
          id: '1',
        })
      );

      const response = searchInterceptor.search({}, { pollInterval: 0 });
      response.subscribe({ next, error });

      await timeTravel(1000);

      expect(mockCoreStart.analytics.reportEvent).toBeCalled();
      expect(mockCoreStart.analytics.reportEvent.mock.calls[0]).toMatchInlineSnapshot(`
        Array [
          "data_search_timeout",
          Object {
            "execution_context": undefined,
            "timeout_ms": 1000,
          },
        ]
      `);
    });

    test('should not leak unresolved promises if DELETE fails', async () => {
      mockCoreSetup.http.delete.mockRejectedValueOnce({ status: 404, statusText: 'Not Found' });
      const responses = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            rawResponse: {},
            id: '1',
          }),
        },
        {
          time: 10,
          value: {
            statusCode: 500,
            message: 'oh no',
            id: '1',
          },
          isError: true,
        },
      ];
      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = searchInterceptor.search({}, { pollInterval: 0 });
      response.subscribe({ next, error });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(mockCoreSetup.http.post).toHaveBeenCalled();
      expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();

      // Long enough to reach the timeout but not long enough to reach the next response
      await timeTravel(10);

      expect(error).toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toBeInstanceOf(Error);
      expect((error.mock.calls[0][0] as Error).message).toBe('oh no');
      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);
      expect(mockCoreSetup.http.delete).toHaveBeenCalledTimes(1);
    });

    test('should NOT DELETE a running SAVED async search on abort', async () => {
      const sessionId = 'sessionId';
      sessionService.isCurrentSession.mockImplementation((_sessionId) => _sessionId === sessionId);
      const responses = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            rawResponse: {},
            id: '1',
          }),
        },
        {
          time: 300,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            rawResponse: {},
            id: '1',
          }),
        },
      ];
      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const abortController = new AbortController();
      setTimeout(() => abortController.abort(), 250);

      const response = searchInterceptor.search(
        {},
        { abortSignal: abortController.signal, pollInterval: 0, sessionId }
      );
      response.subscribe({ next, error });

      await timeTravel(10);

      expect(next).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();

      sessionState$.next(SearchSessionState.BackgroundLoading);

      await timeTravel(240);

      expect(error).toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toBeInstanceOf(AbortError);

      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);
      expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();
    });

    describe('when the search is already backgrounded', () => {
      test('should NOT DELETE a running SAVED async search on async timeout', async () => {
        sessionService.isCurrentSession.mockReturnValue(true);
        sessionService.isSaving.mockReturnValue(true);

        mockCoreSetup.http.post.mockResolvedValue(
          getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            rawResponse: {},
            id: '1',
          })
        );

        const response = searchInterceptor.search({}, { pollInterval: 0 });
        response.subscribe({ next, error });

        await timeTravel(10);

        expect(next).toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(mockCoreSetup.http.post).toHaveBeenCalled();
        expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();

        // Long enough to reach the timeout
        await timeTravel(2000);

        expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();
      });
    });

    describe('when the search gets backgrounded during execution', () => {
      test('should NOT DELETE a running SAVED async search on async timeout', async () => {
        sessionService.isCurrentSession.mockReturnValue(true);
        sessionService.isSaving.mockReturnValue(false);

        mockCoreSetup.http.post.mockResolvedValue(
          getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            rawResponse: {},
            id: '1',
          })
        );

        const response = searchInterceptor.search({}, { pollInterval: 0 });
        response.subscribe({ next, error });

        // We emit a new state to clear the timeout
        sessionState$.next(SearchSessionState.BackgroundLoading);

        await timeTravel(10);

        expect(next).toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(mockCoreSetup.http.post).toHaveBeenCalled();
        expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();

        // Long enough to reach the timeout
        await timeTravel(2000);

        expect(mockCoreSetup.http.delete).not.toHaveBeenCalled();
      });
    });

    describe('Search session', () => {
      const setup = (
        opts: {
          isRestore?: boolean;
          isStored?: boolean;
          sessionId?: string;
        } | null
      ) => {
        const sessionServiceMock = sessionService as jest.Mocked<ISessionService>;
        sessionServiceMock.getSearchOptions.mockImplementation(() =>
          opts && opts.sessionId
            ? {
                sessionId: opts.sessionId,
                isRestore: opts.isRestore ?? false,
                isStored: opts.isStored ?? false,
              }
            : null
        );
        sessionServiceMock.isRestore.mockReturnValue(!!opts?.isRestore);
        sessionServiceMock.getSessionId.mockImplementation(() => opts?.sessionId);
        mockCoreSetup.http.post.mockResolvedValue({ result: 200 });
      };

      const mockRequest: IEsSearchRequest = {
        params: {},
      };

      afterEach(() => {
        const sessionServiceMock = sessionService as jest.Mocked<ISessionService>;
        sessionServiceMock.getSearchOptions.mockReset();
      });

      test('gets session search options from session service', async () => {
        const sessionId = 'sid';
        setup({
          isRestore: true,
          isStored: true,
          sessionId,
        });

        await searchInterceptor
          .search(mockRequest, { sessionId })
          .toPromise()
          .catch(() => {});
        const [path, options] = mockCoreSetup.http.post.mock.calls[0] as unknown as [
          path: string,
          options: HttpFetchOptions
        ];
        const body = JSON.parse(options?.body as string);
        expect(path).toEqual('/internal/search/ese');
        expect(body).toEqual(
          expect.objectContaining({
            sessionId,
            isStored: true,
            isRestore: true,
            isSearchStored: false,
          })
        );

        expect(
          (sessionService as jest.Mocked<ISessionService>).getSearchOptions
        ).toHaveBeenCalledWith(sessionId);
      });

      test("doesn't forward sessionId if search options return null", async () => {
        const sessionId = 'sid';
        setup(null);

        await searchInterceptor
          .search(mockRequest, { sessionId })
          .toPromise()
          .catch(() => {});
        expect(mockCoreSetup.http.post.mock.calls[0][0]).toEqual(
          expect.not.objectContaining({
            options: { sessionId },
          })
        );

        expect(
          (sessionService as jest.Mocked<ISessionService>).getSearchOptions
        ).toHaveBeenCalledWith(sessionId);
      });

      test('should not show warning if a search is available during restore', async () => {
        setup({
          isRestore: true,
          isStored: true,
          sessionId: '123',
        });

        const responses = [
          {
            time: 10,
            value: {
              isPartial: false,
              isRunning: false,
              isRestored: true,
              id: '1',
              rawResponse: {
                took: 1,
              },
            },
          },
        ];
        mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

        const response = searchInterceptor.search(
          {},
          {
            sessionId: '123',
          }
        );
        response.subscribe({ next, error, complete });

        await timeTravel(10);

        expect(SearchSessionIncompleteWarningMock).toBeCalledTimes(0);
      });

      test('should not show warning if a search outside of session is running', async () => {
        setup({
          isRestore: false,
          isStored: false,
        });

        const responses = [
          {
            time: 10,
            value: {
              isPartial: false,
              isRunning: false,
              isRestored: false,
              id: '1',
              rawResponse: {
                took: 1,
              },
            },
          },
        ];
        mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

        const response = searchInterceptor.search(
          {},
          {
            sessionId: undefined,
          }
        );
        response.subscribe({ next, error, complete });

        await timeTravel(10);

        expect(SearchSessionIncompleteWarningMock).toBeCalledTimes(0);
      });

      describe('when background search is disabled', () => {
        test('should show warning once if a search is not available during restore', async () => {
          mockCoreStart.featureFlags.getBooleanValue.mockReturnValue(false);

          setup({
            isRestore: true,
            isStored: true,
            sessionId: '123',
          });

          const responses = [
            {
              time: 10,
              value: getMockSearchResponse({
                isPartial: false,
                isRunning: false,
                isRestored: false,
                id: '1',
                rawResponse: {
                  took: 1,
                },
              }),
            },
          ];
          mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

          searchInterceptor
            .search(
              {},
              {
                sessionId: '123',
              }
            )
            .subscribe({ next, error, complete });

          await timeTravel(10);

          expect(SearchSessionIncompleteWarningMock).toHaveBeenCalledTimes(1);
          expect(mockCoreSetup.notifications.toasts.addWarning).toHaveBeenCalledWith(
            expect.objectContaining({
              title: 'Your background search is still running',
            }),
            expect.anything()
          );

          searchInterceptor
            .search(
              {},
              {
                sessionId: '123',
              }
            )
            .subscribe({ next, error, complete });

          await timeTravel(10);

          expect(SearchSessionIncompleteWarningMock).toHaveBeenCalledTimes(1);
        });
      });

      describe('when background search is enabled', () => {
        test('should show warning once if a search is not available during restore', async () => {
          setup({
            isRestore: true,
            isStored: true,
            sessionId: '123',
          });

          const responses = [
            {
              time: 10,
              value: getMockSearchResponse({
                isPartial: false,
                isRunning: false,
                isRestored: false,
                id: '1',
                rawResponse: {
                  took: 1,
                },
              }),
            },
          ];
          mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

          searchInterceptor
            .search(
              {},
              {
                sessionId: '123',
              }
            )
            .subscribe({ next, error, complete });

          await timeTravel(10);

          expect(SearchSessionIncompleteWarningMock).toHaveBeenCalledTimes(1);
          expect(mockCoreSetup.notifications.toasts.addWarning).toHaveBeenCalledWith(
            expect.objectContaining({
              title: 'Your background search is still running',
            }),
            expect.anything()
          );

          searchInterceptor
            .search(
              {},
              {
                sessionId: '123',
              }
            )
            .subscribe({ next, error, complete });

          await timeTravel(10);

          expect(SearchSessionIncompleteWarningMock).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('Session tracking', () => {
      beforeEach(() => {
        const responses = [
          {
            time: 10,
            value: getMockSearchResponse({
              isPartial: true,
              isRunning: true,
              rawResponse: {},
              id: '1',
            }),
          },
          {
            time: 300,
            value: getMockSearchResponse({
              isPartial: false,
              isRunning: false,
              rawResponse: {},
              id: '1',
            }),
          },
        ];

        mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));
      });

      test('should track searches', async () => {
        const sessionId = 'sessionId';
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);

        const trackSearchComplete = jest.fn();
        sessionService.trackSearch.mockImplementation(() => ({
          complete: trackSearchComplete,
          error: () => {},
          beforePoll: () => [{ isSearchStored: false }, () => {}],
        }));

        const response = searchInterceptor.search({}, { pollInterval: 0, sessionId });
        response.subscribe({ next, error });
        await timeTravel(10);
        expect(sessionService.trackSearch).toBeCalledTimes(1);
        expect(trackSearchComplete).not.toBeCalled();
        await timeTravel(300);
        expect(sessionService.trackSearch).toBeCalledTimes(1);
        expect(trackSearchComplete).toBeCalledTimes(1);
      });

      test('session service should be able to cancel search', async () => {
        const sessionId = 'sessionId';
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);

        const response = searchInterceptor.search({}, { pollInterval: 0, sessionId });
        response.subscribe({ next, error });
        await timeTravel(10);
        expect(sessionService.trackSearch).toBeCalledTimes(1);

        const abort = sessionService.trackSearch.mock.calls[0][0].abort;
        expect(abort).toBeInstanceOf(Function);

        abort(AbortReason.REPLACED);

        await timeTravel(10);

        expect(error).toHaveBeenCalled();
        expect(error.mock.calls[0][0]).toBeInstanceOf(AbortError);
      });

      test("don't track non current session searches", async () => {
        const sessionId = 'sessionId';
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);

        const response1 = searchInterceptor.search(
          {},
          { pollInterval: 0, sessionId: 'something different' }
        );
        response1.subscribe({ next, error });

        const response2 = searchInterceptor.search({}, { pollInterval: 0, sessionId: undefined });
        response2.subscribe({ next, error });

        await timeTravel(10);
        expect(sessionService.trackSearch).toBeCalledTimes(0);
      });

      test("don't track if no current session", async () => {
        sessionService.getSessionId.mockImplementation(() => undefined);
        sessionService.isCurrentSession.mockImplementation((_sessionId) => false);

        const response1 = searchInterceptor.search(
          {},
          { pollInterval: 0, sessionId: 'something different' }
        );
        response1.subscribe({ next, error });

        const response2 = searchInterceptor.search({}, { pollInterval: 0, sessionId: undefined });
        response2.subscribe({ next, error });

        await timeTravel(10);
        expect(sessionService.trackSearch).toBeCalledTimes(0);
      });
    });

    describe('session client caching', () => {
      const sessionId = 'sessionId';
      const basicReq = {
        params: {
          test: 1,
        },
      };

      const basicCompleteResponse = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            id: '1',
            rawResponse: {
              took: 1,
            },
          }),
        },
      ];

      const partialCompleteResponse = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            id: '1',
            rawResponse: {
              took: 1,
            },
          }),
        },
        {
          time: 20,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            id: '1',
            rawResponse: {
              took: 1,
            },
          }),
        },
      ];

      beforeEach(() => {
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);
      });

      test('should be disabled if there is no session', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(basicCompleteResponse));

        searchInterceptor.search(basicReq, {}).subscribe({ next, error, complete });
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        searchInterceptor.search(basicReq, {}).subscribe({ next, error, complete });
        expect(mockCoreSetup.http.post).toBeCalledTimes(2);
      });

      test('should fetch different requests in a single session', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(basicCompleteResponse));

        const req2 = {
          params: {
            test: 2,
          },
        };

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        searchInterceptor.search(req2, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(2);
      });

      test('should fetch the same request for two different sessions', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(basicCompleteResponse));

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        searchInterceptor
          .search(basicReq, { sessionId: 'anotherSession' })
          .subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(2);
      });

      test('should not track searches that come from cache', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(partialCompleteResponse));
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);

        const completeSearch = jest.fn();

        sessionService.trackSearch.mockImplementation((params) => ({
          complete: completeSearch,
          error: jest.fn(),
          beforePoll: jest.fn(() => {
            return [{ isSearchStored: false }, () => {}];
          }),
        }));

        const req = {
          params: {
            test: 200,
          },
        };

        const response = searchInterceptor.search(req, { pollInterval: 1, sessionId });
        const response2 = searchInterceptor.search(req, { pollInterval: 1, sessionId });
        response.subscribe({ next, error, complete });
        response2.subscribe({ next, error, complete });
        await timeTravel(10);

        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
        expect(sessionService.trackSearch).toBeCalledTimes(1);
        expect(completeSearch).not.toBeCalled();
        await timeTravel(300);
        // Should be called only 2 times (once per partial response)
        expect(mockCoreSetup.http.post).toBeCalledTimes(2);
        expect(sessionService.trackSearch).toBeCalledTimes(1);
        expect(completeSearch).toBeCalledTimes(1);

        expect(next).toBeCalledTimes(4);
        expect(error).toBeCalledTimes(0);
        expect(complete).toBeCalledTimes(2);
      });

      test('should cache partial responses', async () => {
        const responses = [
          {
            time: 10,
            value: getMockSearchResponse({
              isPartial: true,
              isRunning: true,
              rawResponse: {},
              id: '1',
            }),
          },
        ];

        mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
      });

      test('should not cache error responses', async () => {
        const responses = [
          {
            time: 10,
            value: getMockSearchResponse({
              isPartial: true,
              isRunning: false,
              id: '1',
              rawResponse: {},
            }),
            isError: true,
          },
        ];

        mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(2);
      });

      test('should ignore anything outside params when hashing', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(basicCompleteResponse));

        const req = {
          something: 123,
          params: {
            test: 1,
          },
        };

        const req2 = {
          something: 321,
          params: {
            test: 1,
          },
        };

        searchInterceptor.search(req, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        searchInterceptor.search(req2, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
      });

      test('should deliver error to all replays', async () => {
        const responses = [
          {
            time: 10,
            value: {
              statusCode: 500,
              message: 'Aborted',
              id: '1',
            },
            isError: true,
          },
        ];

        mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
        expect(error).toBeCalledTimes(2);
        expect(error.mock.calls[0][0].message).toEqual('Aborted');
        expect(error.mock.calls[1][0].message).toEqual('Aborted');
      });

      test('should ignore preference when hashing', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(basicCompleteResponse));

        const req = {
          params: {
            test: 1,
            preference: 123,
          },
        };

        const req2 = {
          params: {
            test: 1,
            preference: 321,
          },
        };

        searchInterceptor.search(req, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        searchInterceptor.search(req2, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
      });

      test('should return from cache for identical requests in the same session', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(basicCompleteResponse));

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
      });

      test('aborting a search that didnt get any response should retrigger search', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(basicCompleteResponse));

        const abortController = new AbortController();

        // Start a search request
        searchInterceptor
          .search(basicReq, { sessionId, abortSignal: abortController.signal })
          .subscribe({ next, error, complete });

        // Abort the search request before it started
        abortController.abort();

        // Time travel to make sure nothing appens
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(0);
        expect(next).toBeCalledTimes(0);
        expect(error).toBeCalledTimes(1);
        expect(complete).toBeCalledTimes(0);

        const error2 = jest.fn();
        const next2 = jest.fn();
        const complete2 = jest.fn();

        // Search for the same thing again
        searchInterceptor
          .search(basicReq, { sessionId })
          .subscribe({ next: next2, error: error2, complete: complete2 });

        // Should search again
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
        expect(next2).toBeCalledTimes(1);
        expect(error2).toBeCalledTimes(0);
        expect(complete2).toBeCalledTimes(1);
      });

      test('aborting a running first search shouldnt clear cache', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(partialCompleteResponse));
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);

        const completeSearch = jest.fn();

        sessionService.trackSearch.mockImplementation((params) => ({
          complete: completeSearch,
          error: jest.fn(),
          beforePoll: jest.fn(() => {
            return [{ isSearchStored: false }, () => {}];
          }),
        }));

        const req = {
          params: {
            test: 200,
          },
        };

        const abortController = new AbortController();

        const response = searchInterceptor.search(req, {
          pollInterval: 1,
          sessionId,
          abortSignal: abortController.signal,
        });
        response.subscribe({ next, error, complete });
        await timeTravel(10);

        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
        expect(next).toBeCalledTimes(1);
        expect(error).toBeCalledTimes(0);
        expect(complete).toBeCalledTimes(0);
        expect(sessionService.trackSearch).toBeCalledTimes(1);

        const next2 = jest.fn();
        const error2 = jest.fn();
        const complete2 = jest.fn();
        const response2 = searchInterceptor.search(req, { pollInterval: 1, sessionId });
        response2.subscribe({ next: next2, error: error2, complete: complete2 });
        await timeTravel(0);

        abortController.abort();

        await timeTravel(300);
        // Only first searches should be tracked and untracked
        expect(sessionService.trackSearch).toBeCalledTimes(1);
        expect(completeSearch).toBeCalledTimes(1);

        // First search should error
        expect(next).toBeCalledTimes(1);
        expect(error).toBeCalledTimes(1);
        expect(complete).toBeCalledTimes(0);

        // Second search should complete
        expect(next2).toBeCalledTimes(2);
        expect(error2).toBeCalledTimes(0);
        expect(complete2).toBeCalledTimes(1);

        // Should be called only 2 times (once per partial response)
        expect(mockCoreSetup.http.post).toBeCalledTimes(2);
      });

      test('aborting a running second search shouldnt clear cache', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(partialCompleteResponse));
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);

        const completeSearch = jest.fn();

        sessionService.trackSearch.mockImplementation((params) => ({
          complete: completeSearch,
          error: jest.fn(),
          beforePoll: jest.fn(() => {
            return [{ isSearchStored: false }, () => {}];
          }),
        }));

        const req = {
          params: {
            test: 200,
          },
        };

        const abortController = new AbortController();

        const response = searchInterceptor.search(req, { pollInterval: 1, sessionId });
        response.subscribe({ next, error, complete });
        await timeTravel(10);

        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
        expect(next).toBeCalledTimes(1);
        expect(error).toBeCalledTimes(0);
        expect(complete).toBeCalledTimes(0);
        expect(sessionService.trackSearch).toBeCalledTimes(1);
        expect(completeSearch).not.toBeCalled();

        const next2 = jest.fn();
        const error2 = jest.fn();
        const complete2 = jest.fn();
        const response2 = searchInterceptor.search(req, {
          pollInterval: 0,
          sessionId,
          abortSignal: abortController.signal,
        });
        response2.subscribe({ next: next2, error: error2, complete: complete2 });
        await timeTravel(0);

        abortController.abort();

        await timeTravel(300);
        expect(sessionService.trackSearch).toBeCalledTimes(1);
        expect(completeSearch).toBeCalledTimes(1);

        expect(next).toBeCalledTimes(2);
        expect(error).toBeCalledTimes(0);
        expect(complete).toBeCalledTimes(1);

        expect(next2).toBeCalledTimes(1);
        expect(error2).toBeCalledTimes(1);
        expect(complete2).toBeCalledTimes(0);

        // Should be called only 2 times (once per partial response)
        expect(mockCoreSetup.http.post).toBeCalledTimes(2);
      });

      test('aborting both requests should cancel underlaying search only once', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(partialCompleteResponse));
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);

        const req = {
          params: {
            test: 200,
          },
        };

        const abortController = new AbortController();

        const response = searchInterceptor.search(req, {
          pollInterval: 1,
          sessionId,
          abortSignal: abortController.signal,
        });
        response.subscribe({ next, error, complete });

        const response2 = searchInterceptor.search(req, {
          pollInterval: 1,
          sessionId,
          abortSignal: abortController.signal,
        });
        response2.subscribe({ next, error, complete });
        await timeTravel(10);

        abortController.abort();

        await timeTravel(300);

        expect(mockCoreSetup.http.delete).toHaveBeenCalledTimes(1);
      });

      test('aborting both searches should stop searching and clear cache', async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(partialCompleteResponse));
        sessionService.isCurrentSession.mockImplementation(
          (_sessionId) => _sessionId === sessionId
        );
        sessionService.getSessionId.mockImplementation(() => sessionId);

        const completeSearch = jest.fn();

        sessionService.trackSearch.mockImplementation((params) => ({
          complete: completeSearch,
          error: jest.fn(),
          beforePoll: jest.fn(() => {
            return [{ isSearchStored: false }, () => {}];
          }),
        }));

        const req = {
          params: {
            test: 200,
          },
        };

        const abortController = new AbortController();

        const response = searchInterceptor.search(req, {
          pollInterval: 1,
          sessionId,
          abortSignal: abortController.signal,
        });
        response.subscribe({ next, error, complete });
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        const response2 = searchInterceptor.search(req, {
          pollInterval: 1,
          sessionId,
          abortSignal: abortController.signal,
        });
        response2.subscribe({ next, error, complete });
        await timeTravel(0);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        abortController.abort();

        await timeTravel(300);

        expect(next).toBeCalledTimes(2);
        expect(error).toBeCalledTimes(2);
        expect(complete).toBeCalledTimes(0);
        expect(error.mock.calls[0][0]).toBeInstanceOf(AbortError);
        expect(error.mock.calls[1][0]).toBeInstanceOf(AbortError);

        // Should be called only 1 times (one partial response)
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        // Clear mock and research
        mockCoreSetup.http.post.mockReset();
        mockCoreSetup.http.post.mockImplementation(getHttpMock(partialCompleteResponse));
        // Run the search again to see that we don't hit the cache
        const response3 = searchInterceptor.search(req, { pollInterval: 1, sessionId });
        response3.subscribe({ next, error, complete });

        await timeTravel(10);
        await timeTravel(10);
        await timeTravel(300);

        // Should be called 2 times (two partial response)
        expect(mockCoreSetup.http.post).toBeCalledTimes(2);
        expect(complete).toBeCalledTimes(1);
      });

      test("aborting a completed search shouldn't effect cache", async () => {
        mockCoreSetup.http.post.mockImplementation(getHttpMock(basicCompleteResponse));

        const abortController = new AbortController();

        // Start a search request
        searchInterceptor
          .search(basicReq, { sessionId, abortSignal: abortController.signal })
          .subscribe({ next, error, complete });

        // Get a final response
        await timeTravel(10);
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);

        // Abort the search request
        abortController.abort();

        // Search for the same thing again
        searchInterceptor.search(basicReq, { sessionId }).subscribe({ next, error, complete });

        // Get the response from cache
        expect(mockCoreSetup.http.post).toBeCalledTimes(1);
      });
    });

    describe('Should throw typed errors', () => {
      test('Observable should fail if fetch has an internal error', async () => {
        const mockResponse: any = new Error('Internal Error');
        mockCoreSetup.http.post.mockRejectedValue(mockResponse);
        const mockRequest: IEsSearchRequest = {
          params: {},
        };
        const response = searchInterceptor.search(mockRequest);
        await expect(response.toPromise()).rejects.toThrow('Internal Error');
      });

      describe('Should handle Timeout errors', () => {
        test('Should throw SearchTimeoutError on server timeout AND show toast', async () => {
          const mockResponse: any = {
            statusCode: 500,
            message: 'Request timed out',
          };
          mockCoreSetup.http.post.mockRejectedValueOnce(mockResponse);
          const mockRequest: IEsSearchRequest = {
            params: {},
          };
          const response = searchInterceptor.search(mockRequest);
          await expect(response.toPromise()).rejects.toThrow(SearchTimeoutError);
          expect(mockCoreSetup.notifications.toasts.addDanger).toBeCalledTimes(1);
        });

        test('Timeout error should show multiple times if not in a session', async () => {
          const mockResponse: any = {
            statusCode: 500,
            message: 'Request timed out',
          };
          mockCoreSetup.http.post.mockRejectedValue(mockResponse);
          const mockRequest: IEsSearchRequest = {
            params: {},
          };

          await expect(searchInterceptor.search(mockRequest).toPromise()).rejects.toThrow(
            SearchTimeoutError
          );
          await expect(searchInterceptor.search(mockRequest).toPromise()).rejects.toThrow(
            SearchTimeoutError
          );
          expect(mockCoreSetup.notifications.toasts.addDanger).toBeCalledTimes(2);
        });

        test('Timeout error should show once per each session', async () => {
          const mockResponse: any = {
            statusCode: 500,
            message: 'Request timed out',
          };
          mockCoreSetup.http.post.mockRejectedValue(mockResponse);
          const mockRequest: IEsSearchRequest = {
            params: {},
          };

          await expect(
            searchInterceptor.search(mockRequest, { sessionId: 'abc' }).toPromise()
          ).rejects.toThrow(SearchTimeoutError);
          await expect(
            searchInterceptor.search(mockRequest, { sessionId: 'def' }).toPromise()
          ).rejects.toThrow(SearchTimeoutError);
          expect(mockCoreSetup.notifications.toasts.addDanger).toBeCalledTimes(2);
        });

        test('Timeout error should show once in a single session', async () => {
          const mockResponse: any = {
            statusCode: 500,
            message: 'Request timed out',
          };
          mockCoreSetup.http.post.mockRejectedValue(mockResponse);
          const mockRequest: IEsSearchRequest = {
            params: {},
          };
          await expect(
            searchInterceptor.search(mockRequest, { sessionId: 'abc' }).toPromise()
          ).rejects.toThrow(SearchTimeoutError);
          await expect(
            searchInterceptor.search(mockRequest, { sessionId: 'abc' }).toPromise()
          ).rejects.toThrow(SearchTimeoutError);
          expect(mockCoreSetup.notifications.toasts.addDanger).toBeCalledTimes(1);
        });
      });

      test('Should throw ES error on ES server error', async () => {
        const mockResponse: IEsError = {
          statusCode: 400,
          message: 'resource_not_found_exception',
          attributes: {
            error: resourceNotFoundException.error,
          },
        };
        mockCoreSetup.http.post.mockRejectedValueOnce(mockResponse);
        const mockRequest: IEsSearchRequest = {
          params: {},
        };
        const response = searchInterceptor.search(mockRequest);
        await expect(response.toPromise()).rejects.toThrow(EsError);
      });

      test('Observable should fail if user aborts (test merged signal)', async () => {
        const abortController = new AbortController();
        mockCoreSetup.http.post.mockImplementationOnce((options: any) => {
          return new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              reject(new AbortError());
            });

            setTimeout(resolve, 500);
          });
        });
        const mockRequest: IEsSearchRequest = {
          params: {},
        };
        const response = searchInterceptor.search(mockRequest, {
          abortSignal: abortController.signal,
        });

        error.mockImplementation((e) => {
          expect(next).not.toBeCalled();
          expect(e).toBeInstanceOf(AbortError);
        });

        response.subscribe({ next, error });
        setTimeout(() => abortController.abort(), 200);
        jest.advanceTimersByTime(5000);

        await flushPromises();
      });

      test('Immediately aborts if passed an aborted abort signal', async () => {
        const abort = new AbortController();
        const mockRequest: IEsSearchRequest = {
          params: {},
        };
        const response = searchInterceptor.search(mockRequest, { abortSignal: abort.signal });
        abort.abort();

        error.mockImplementation((e) => {
          expect(e).toBeInstanceOf(AbortError);
          expect(mockCoreSetup.http.post).not.toBeCalled();
        });

        response.subscribe({ error });
      });
    });

    describe('partial results', () => {
      beforeEach(() => {
        mockCoreSetup.http.post.mockResolvedValue(
          getMockSearchResponse({
            id: '1',
            isPartial: true,
            isRunning: true,
            rawResponse: {},
          })
        );
      });

      test('should request partial results and throw error if timed out', async () => {
        const abortController = new AbortController();
        setTimeout(() => {
          abortController.abort(AbortReason.TIMEOUT);
        }, 50);

        const response = searchInterceptor.search(
          {},
          { abortSignal: abortController.signal, pollInterval: 100 }
        );
        response.subscribe({ next, error });

        await timeTravel(); // Run first request/response

        expect(next).toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();

        await timeTravel(50); // Run until abort

        expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);
        expect(mockCoreSetup.http.post.mock.calls[1]).toMatchInlineSnapshot(`
          Array [
            "/internal/search/ese/1",
            Object {
              "asResponse": true,
              "body": "{\\"id\\":\\"1\\",\\"params\\":{},\\"returnIntermediateResults\\":true,\\"stream\\":true}",
              "context": undefined,
              "signal": AbortSignal {},
              "version": "1",
            },
          ]
        `);
        expect(error).toHaveBeenCalled();
      });

      test('should request partial results and not throw error if canceled', async () => {
        const abortController = new AbortController();
        setTimeout(() => {
          abortController.abort(AbortReason.CANCELED);
        }, 50);

        const response = searchInterceptor.search(
          {},
          { abortSignal: abortController.signal, pollInterval: 100 }
        );
        response.subscribe({ next, error });

        await timeTravel(); // Run first request/response

        expect(next).toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();

        await timeTravel(50); // Run until abort

        expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);
        expect(mockCoreSetup.http.post.mock.calls[1]).toMatchInlineSnapshot(`
          Array [
            "/internal/search/ese/1",
            Object {
              "asResponse": true,
              "body": "{\\"id\\":\\"1\\",\\"params\\":{},\\"returnIntermediateResults\\":true,\\"stream\\":true}",
              "context": undefined,
              "signal": AbortSignal {},
              "version": "1",
            },
          ]
        `);
        expect(error).not.toHaveBeenCalled();
      });

      test('should not request partial results and throw error if canceled for a reason other than CANCELED/TIMEOUT', async () => {
        const abortController = new AbortController();
        setTimeout(() => {
          abortController.abort(AbortReason.CLEANUP);
        }, 50);

        const response = searchInterceptor.search(
          {},
          { abortSignal: abortController.signal, pollInterval: 100 }
        );
        response.subscribe({ next, error });

        await timeTravel(); // Run first request/response

        expect(next).toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();

        await timeTravel(50); // Run until abort

        expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalled();
      });
    });
  });

  describe('project_routing parameter handling', () => {
    const createMockCPSManager = (projectRouting: string | undefined): ICPSManager =>
      ({
        getProjectRouting: jest
          .fn()
          .mockImplementation(
            (passedProjectRouting?: string) => passedProjectRouting ?? projectRouting
          ),
      } as unknown as ICPSManager);

    const getSearchInterceptor = (overrides?: Partial<SearchInterceptorDeps>) => {
      return new SearchInterceptor({
        toasts: mockCoreSetup.notifications.toasts,
        startServices: new Promise((resolve) => {
          resolve([
            mockCoreStart,
            {
              inspector: {} as unknown as InspectorStart,
            } as unknown as SearchServiceStartDependencies,
            {},
          ]);
        }),
        uiSettings: mockCoreSetup.uiSettings,
        http: mockCoreSetup.http,
        executionContext: mockCoreSetup.executionContext,
        session: sessionService,
        searchConfig: getMockSearchConfig({}),
        ...overrides,
      });
    };
    beforeEach(() => {
      mockCoreSetup.http.post.mockResolvedValue(getMockSearchResponse());
    });

    describe('ESQL_ASYNC_SEARCH_STRATEGY', () => {
      test('User passes "_alias:*" with global "_alias:_origin" - sends to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:_origin')),
        });

        await searchInterceptor
          .search(
            { params: {} },
            { projectRouting: '_alias:*', strategy: ESQL_ASYNC_SEARCH_STRATEGY }
          )
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:*');
      });

      test('User passes "_alias:*" with global "_alias:*" - sends to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:*')),
        });

        await searchInterceptor
          .search(
            { params: {} },
            { projectRouting: '_alias:*', strategy: ESQL_ASYNC_SEARCH_STRATEGY }
          )
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:*');
      });

      test('User passes "_alias:_origin" with global "_alias:_origin" - sends to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:_origin')),
        });

        await searchInterceptor
          .search(
            { params: {} },
            { projectRouting: '_alias:_origin', strategy: ESQL_ASYNC_SEARCH_STRATEGY }
          )
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:_origin');
      });

      test('User passes "_alias:_origin" with global "_alias:*" - sends to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:*')),
        });

        await searchInterceptor
          .search(
            { params: {} },
            { projectRouting: '_alias:_origin', strategy: ESQL_ASYNC_SEARCH_STRATEGY }
          )
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:_origin');
      });

      test('User passes nothing with global "_alias:_origin" - sends global to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:_origin')),
        });

        await searchInterceptor
          .search({ params: {} }, { strategy: ESQL_ASYNC_SEARCH_STRATEGY })
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:_origin');
      });

      test('User passes nothing with global "_alias:*" - sends global to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:*')),
        });

        await searchInterceptor
          .search({ params: {} }, { strategy: ESQL_ASYNC_SEARCH_STRATEGY })
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:*');
      });

      test('User passes nothing with global undefined - does not send to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager(undefined)),
        });

        await searchInterceptor
          .search({ params: {} }, { strategy: ESQL_ASYNC_SEARCH_STRATEGY })
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBeUndefined();
      });

      test('CPS unavailable - does not send to ES', async () => {
        searchInterceptor = getSearchInterceptor({ getCPSManager: undefined });

        await searchInterceptor
          .search(
            { params: {} },
            { projectRouting: '_alias:_origin', strategy: ESQL_ASYNC_SEARCH_STRATEGY }
          )
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBeUndefined();
      });
    });

    describe('ENHANCED_ES_SEARCH_STRATEGY', () => {
      test('User passes "_alias:*" with global "_alias:_origin" - sends to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:_origin')),
        });

        await searchInterceptor
          .search(
            { params: { body: {} } },
            { projectRouting: '_alias:*', strategy: ENHANCED_ES_SEARCH_STRATEGY }
          )
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:*');
      });

      test('User passes "_alias:_origin" with global "_alias:*" - sends to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:*')),
        });

        await searchInterceptor
          .search(
            { params: { body: {} } },
            { projectRouting: '_alias:_origin', strategy: ENHANCED_ES_SEARCH_STRATEGY }
          )
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:_origin');
      });

      test('User passes nothing with global "_alias:_origin" - sends global to ES', async () => {
        searchInterceptor = getSearchInterceptor({
          getCPSManager: jest.fn().mockReturnValue(createMockCPSManager('_alias:_origin')),
        });

        await searchInterceptor
          .search({ params: { body: {} } }, { strategy: ENHANCED_ES_SEARCH_STRATEGY })
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBe('_alias:_origin');
      });

      test('CPS unavailable - does not send to ES', async () => {
        searchInterceptor = getSearchInterceptor({ getCPSManager: undefined });

        await searchInterceptor
          .search(
            { params: { body: {} } },
            { projectRouting: '_alias:_origin', strategy: ENHANCED_ES_SEARCH_STRATEGY }
          )
          .toPromise();

        const requestOptions = (
          mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
        )[1];
        const requestBody = JSON.parse(requestOptions.body as string);
        expect(requestBody.projectRouting).toBeUndefined();
      });
    });
  });

  describe('approximation parameter handling', () => {
    const getSearchInterceptor = () =>
      new SearchInterceptor({
        toasts: mockCoreSetup.notifications.toasts,
        startServices: new Promise((resolve) => {
          resolve([
            mockCoreStart,
            {
              inspector: {} as unknown as InspectorStart,
            } as unknown as SearchServiceStartDependencies,
            {},
          ]);
        }),
        uiSettings: mockCoreSetup.uiSettings,
        http: mockCoreSetup.http,
        executionContext: mockCoreSetup.executionContext,
        session: sessionService,
        searchConfig: getMockSearchConfig({}),
      });

    beforeEach(() => {
      mockCoreSetup.http.post.mockResolvedValue(getMockSearchResponse());
    });

    test('sends approximation to ES when passed', async () => {
      searchInterceptor = getSearchInterceptor();

      await searchInterceptor
        .search({ params: {} }, { approximation: true, strategy: ESQL_ASYNC_SEARCH_STRATEGY })
        .toPromise();

      const requestOptions = (
        mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
      )[1];
      const requestBody = JSON.parse(requestOptions.body as string);
      expect(requestBody.approximation).toBe(true);
    });

    test('does not send approximation when not passed', async () => {
      searchInterceptor = getSearchInterceptor();

      await searchInterceptor
        .search({ params: {} }, { strategy: ESQL_ASYNC_SEARCH_STRATEGY })
        .toPromise();

      const requestOptions = (
        mockCoreSetup.http.post.mock.calls[0] as unknown as [string, HttpFetchOptions]
      )[1];
      const requestBody = JSON.parse(requestOptions.body as string);
      expect(requestBody.approximation).toBeUndefined();
    });
  });

  describe('pollLength configuration', () => {
    const inspectorServiceMock = {
      open: () => {},
    } as unknown as InspectorStart;

    beforeEach(() => {
      mockCoreSetup.http.post.mockReset();
    });

    test('should use DEFAULT_MULTIPLEXING_POLL_LENGTH when pollLength is not set and protocol supports multiplexing', async () => {
      const interceptor = new SearchInterceptor({
        toasts: mockCoreSetup.notifications.toasts,
        startServices: new Promise((resolve) => {
          resolve([
            mockCoreStart,
            { inspector: inspectorServiceMock } as unknown as SearchServiceStartDependencies,
            {},
          ]);
        }),
        uiSettings: mockCoreSetup.uiSettings,
        http: mockCoreSetup.http,
        executionContext: mockCoreSetup.executionContext,
        session: sessionService,
        searchConfig: {
          asyncSearch: {
            waitForCompletion: moment.duration(100, 'ms'),
            keepAlive: moment.duration(1, 'm'),
            batchedReduceSize: 64,
            pollLength: undefined, // Explicitly undefined
          },
          sessions: {
            enabled: true,
            defaultExpiration: moment.duration(7, 'd'),
          },
        } as any,
      });
      (interceptor as any).protocolSupportsMultiplexing = true;

      const responses = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            id: '1',
            rawResponse: {},
          }),
        },
        {
          time: 20,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            id: '1',
            rawResponse: {},
          }),
        },
      ];

      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = interceptor.search({ params: {} }, { pollInterval: 0 });
      response.subscribe({ next, error, complete });

      await timeTravel(10);
      await timeTravel(20);

      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);

      const pollRequest = (
        mockCoreSetup.http.post.mock.calls[1] as unknown as [string, HttpFetchOptions]
      )[1];
      const pollBody = JSON.parse(pollRequest?.body as string);

      // Should use DEFAULT_MULTIPLEXING_POLL_LENGTH (30s)
      expect(pollBody.params.wait_for_completion_timeout).toBe('30s');
    });

    test('should not set wait_for_completion_timeout when pollLength is not set and protocol does not support multiplexing', async () => {
      const interceptor = new SearchInterceptor({
        toasts: mockCoreSetup.notifications.toasts,
        startServices: new Promise((resolve) => {
          resolve([
            mockCoreStart,
            { inspector: inspectorServiceMock } as unknown as SearchServiceStartDependencies,
            {},
          ]);
        }),
        uiSettings: mockCoreSetup.uiSettings,
        http: mockCoreSetup.http,
        executionContext: mockCoreSetup.executionContext,
        session: sessionService,
        searchConfig: {
          asyncSearch: {
            waitForCompletion: moment.duration(100, 'ms'),
            keepAlive: moment.duration(1, 'm'),
            batchedReduceSize: 64,
            pollLength: undefined, // Explicitly undefined
          },
          sessions: {
            enabled: true,
            defaultExpiration: moment.duration(7, 'd'),
          },
        } as any,
      });
      (interceptor as any).protocolSupportsMultiplexing = false;

      const responses = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            id: '1',
            rawResponse: {},
          }),
        },
        {
          time: 20,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            id: '1',
            rawResponse: {},
          }),
        },
      ];

      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = interceptor.search({ params: {} }, { pollInterval: 0 });
      response.subscribe({ next, error, complete });

      await timeTravel(10);
      await timeTravel(20);

      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);

      const pollRequest = (
        mockCoreSetup.http.post.mock.calls[1] as unknown as [string, HttpFetchOptions]
      )[1];
      const pollBody = JSON.parse(pollRequest?.body as string);

      // Should not have wait_for_completion_timeout
      expect(pollBody.params.wait_for_completion_timeout).toBeUndefined();
    });

    test('should not set wait_for_completion_timeout when pollLength is set even if protocol supports multiplexing', async () => {
      const interceptor = new SearchInterceptor({
        toasts: mockCoreSetup.notifications.toasts,
        startServices: new Promise((resolve) => {
          resolve([
            mockCoreStart,
            { inspector: inspectorServiceMock } as unknown as SearchServiceStartDependencies,
            {},
          ]);
        }),
        uiSettings: mockCoreSetup.uiSettings,
        http: mockCoreSetup.http,
        executionContext: mockCoreSetup.executionContext,
        session: sessionService,
        searchConfig: {
          asyncSearch: {
            waitForCompletion: moment.duration(100, 'ms'),
            keepAlive: moment.duration(1, 'm'),
            batchedReduceSize: 64,
            pollLength: moment.duration(1, 'm'), // Explicitly set
          },
          sessions: {
            enabled: true,
            defaultExpiration: moment.duration(7, 'd'),
          },
        } as any,
      });
      (interceptor as any).protocolSupportsMultiplexing = true;

      const responses = [
        {
          time: 10,
          value: getMockSearchResponse({
            isPartial: true,
            isRunning: true,
            id: '1',
            rawResponse: {},
          }),
        },
        {
          time: 20,
          value: getMockSearchResponse({
            isPartial: false,
            isRunning: false,
            id: '1',
            rawResponse: {},
          }),
        },
      ];

      mockCoreSetup.http.post.mockImplementation(getHttpMock(responses));

      const response = interceptor.search({ params: {} }, { pollInterval: 0 });
      response.subscribe({ next, error, complete });

      await timeTravel(10);
      await timeTravel(20);

      expect(mockCoreSetup.http.post).toHaveBeenCalledTimes(2);

      const pollRequest = (
        mockCoreSetup.http.post.mock.calls[1] as unknown as [string, HttpFetchOptions]
      )[1];
      const pollBody = JSON.parse(pollRequest?.body as string);

      // Should not have wait_for_completion_timeout
      expect(pollBody.params.wait_for_completion_timeout).toBeUndefined();
    });
  });
});
