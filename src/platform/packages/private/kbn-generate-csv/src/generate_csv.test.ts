/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { identity, range } from 'lodash';
import * as Rx from 'rxjs';
import type { Writable } from 'stream';

import type { estypes } from '@elastic/elasticsearch';
import { errors as esErrors } from '@elastic/elasticsearch';
import type { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import type { IScopedClusterClient, IUiSettingsClient, Logger } from '@kbn/core/server';
import {
  elasticsearchServiceMock,
  loggingSystemMock,
  savedObjectsClientMock,
  uiSettingsServiceMock,
} from '@kbn/core/server/mocks';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';
import { stubLogstashFieldSpecMap } from '@kbn/data-views-plugin/common/field.stub';
import type { ISearchClient, IKibanaSearchResponse } from '@kbn/search-types';
import type { ISearchStartSearchSource, SearchSourceFields } from '@kbn/data-plugin/common';
import { searchSourceInstanceMock } from '@kbn/data-plugin/common/search/search_source/mocks';
import {
  type IScopedSearchClient,
  INTERNAL_ENHANCED_ES_SEARCH_STRATEGY,
} from '@kbn/data-plugin/server';
import { dataPluginMock } from '@kbn/data-plugin/server/mocks';
import type { FieldFormatsRegistry } from '@kbn/field-formats-plugin/common';
import { CancellationToken } from '@kbn/reporting-common';
import type { JobParamsCSV } from '@kbn/reporting-export-types-csv-common';
import type { ReportingConfigType } from '@kbn/reporting-server';
import {
  UI_SETTINGS_CSV_QUOTE_VALUES,
  UI_SETTINGS_CSV_SEPARATOR,
  UI_SETTINGS_DATEFORMAT_TZ,
} from '../constants';
import { CsvGenerator } from './generate_csv';
import moment from 'moment';

type CsvConfigType = ReportingConfigType['csv'];

const getMockConfig = (opts: Partial<CsvConfigType> = {}): CsvConfigType => ({
  checkForFormulas: true,
  escapeFormulaValues: true,
  maxSizeBytes: 180000,
  useByteOrderMarkEncoding: false,
  scroll: { size: 500, duration: '30s', strategy: 'pit' },
  maxConcurrentShardRequests: 5,
  maxRows: 500,
  ...opts,
});

const createMockJob = (baseObj: Partial<JobParamsCSV> = {}): JobParamsCSV =>
  ({
    ...baseObj,
  } as JobParamsCSV);
const mockTaskInstanceFields = { startedAt: null, retryAt: null };

const jobId = 'mock-job-id';

describe('CsvGenerator', () => {
  let mockEsClient: IScopedClusterClient;
  let mockDataClient: ISearchClient;
  let mockConfig: CsvConfigType;
  let mockLogger: jest.Mocked<Logger>;
  let uiSettingsClient: IUiSettingsClient;
  let stream: jest.Mocked<Writable>;
  let content: string;

  const searchSourceMock = {
    ...searchSourceInstanceMock,
    getSearchRequestBody: jest.fn(() => ({})),
  };

  const mockSearchSourceService: jest.Mocked<ISearchStartSearchSource> = {
    create: jest.fn().mockReturnValue(searchSourceMock),
    createLazy: jest.fn().mockReturnValue(searchSourceMock),
    createEmpty: jest.fn().mockReturnValue(searchSourceMock),
    telemetry: jest.fn(),
    inject: jest.fn(),
    extract: jest.fn(),
    getAllMigrations: jest.fn(),
  };

  const mockCursorId = 'oju9fs3698s3902f02-8qg3-u9w36oiewiuyew6';

  const getMockRawResponse = (
    hits: Array<estypes.SearchHit<unknown>> = [],
    total = hits.length
  ) => ({
    took: 1,
    timed_out: false,
    pit_id: mockCursorId,
    _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
    hits: { hits, total, max_score: 0 },
  });

  const mockDataClientSearchDefault = jest.fn().mockImplementation(
    (): Rx.Observable<{ rawResponse: SearchResponse<unknown> }> =>
      Rx.of({
        rawResponse: getMockRawResponse(),
      })
  );

  const mockFieldFormatsRegistry = {
    deserialize: jest.fn().mockImplementation(() => ({
      id: 'string',
      convertToText: jest.fn().mockImplementation(identity),
    })),
  } as unknown as FieldFormatsRegistry;

  beforeEach(async () => {
    content = '';
    stream = { write: jest.fn((chunk) => (content += chunk)) } as unknown as typeof stream;
    mockEsClient = elasticsearchServiceMock.createScopedClusterClient();
    mockDataClient = dataPluginMock.createStartContract().search.asScoped({} as any);
    mockDataClient.search = mockDataClientSearchDefault;

    mockEsClient.asCurrentUser.openPointInTime = jest
      .fn()
      .mockResolvedValueOnce({ id: mockCursorId });

    uiSettingsClient = uiSettingsServiceMock
      .createStartContract()
      .asScopedToClient(savedObjectsClientMock.create());
    uiSettingsClient.get = jest.fn().mockImplementation((key): any => {
      switch (key) {
        case UI_SETTINGS_CSV_QUOTE_VALUES:
          return true;
        case UI_SETTINGS_CSV_SEPARATOR:
          return ',';
        case UI_SETTINGS_DATEFORMAT_TZ:
          return 'Browser';
      }
    });

    mockConfig = getMockConfig();

    const dataView = createStubDataView({
      spec: {
        id: 'test',
        title: 'logstash-*',
        fields: {
          ...stubLogstashFieldSpecMap,
          bytes: {
            ...stubLogstashFieldSpecMap.bytes,
            customLabel: 'bytes_custom_label',
          },
        },
      },
      opts: {
        metaFields: ['_id', '_index', '_type', '_score'],
      },
    });

    dataView.getFormatterForField = jest.fn();

    searchSourceMock.getField = jest.fn((key: keyof SearchSourceFields) => {
      if (key === 'pit') {
        return { id: mockCursorId };
      }
      if (key === 'index') {
        return dataView;
      }
      return undefined;
    }) as unknown as typeof searchSourceMock.getField;

    mockLogger = loggingSystemMock.createLogger();
  });

  it('formats an empty search result to CSV content', async () => {
    const generateCsv = new CsvGenerator(
      createMockJob({ columns: ['date', 'ip', 'message'] }),
      mockConfig,
      mockTaskInstanceFields,
      {
        es: mockEsClient,
        data: mockDataClient,
        uiSettings: uiSettingsClient,
      },
      {
        searchSourceStart: mockSearchSourceService,
        fieldFormatsRegistry: mockFieldFormatsRegistry,
      },
      new CancellationToken(),
      mockLogger,
      stream,
      false, // isServerless
      jobId
    );
    const csvResult = await generateCsv.generateData();
    expect(content).toMatchSnapshot();
    expect(csvResult.csv_contains_formulas).toBe(false);
  });

  it('formats a search result to CSV content', async () => {
    mockDataClient.search = jest.fn().mockImplementation(() =>
      Rx.of({
        rawResponse: getMockRawResponse([
          {
            fields: {
              date: `["2020-12-31T00:14:28.000Z"]`,
              ip: `["110.135.176.89"]`,
              message: `["This is a great message!"]`,
              bytes: `[100]`,
            },
          } as unknown as estypes.SearchHit,
        ]),
      })
    );
    const generateCsv = new CsvGenerator(
      createMockJob({ columns: ['date', 'ip', 'message', 'bytes'] }),
      mockConfig,
      mockTaskInstanceFields,
      {
        es: mockEsClient,
        data: mockDataClient,
        uiSettings: uiSettingsClient,
      },
      {
        searchSourceStart: mockSearchSourceService,
        fieldFormatsRegistry: mockFieldFormatsRegistry,
      },
      new CancellationToken(),
      mockLogger,
      stream,
      false, // isServerless
      jobId
    );
    const csvResult = await generateCsv.generateData();
    expect(content).toMatchSnapshot();
    expect(csvResult.csv_contains_formulas).toBe(false);
  });

  const HITS_TOTAL = 100;

  it('calculates the bytes of the content', async () => {
    mockDataClient.search = jest.fn().mockImplementation(() =>
      Rx.of({
        rawResponse: getMockRawResponse(
          range(0, HITS_TOTAL).map(
            () =>
              ({
                fields: {
                  message: ['this is a great message'],
                },
              } as unknown as estypes.SearchHit)
          )
        ),
      })
    );

    const generateCsv = new CsvGenerator(
      createMockJob({ columns: ['message'] }),
      mockConfig,
      mockTaskInstanceFields,
      {
        es: mockEsClient,
        data: mockDataClient,
        uiSettings: uiSettingsClient,
      },
      {
        searchSourceStart: mockSearchSourceService,
        fieldFormatsRegistry: mockFieldFormatsRegistry,
      },
      new CancellationToken(),
      mockLogger,
      stream,
      false, // isServerless
      jobId
    );
    const csvResult = await generateCsv.generateData();
    expect(csvResult.max_size_reached).toBe(false);
    expect(csvResult.warnings).toEqual([]);
  });

  describe('PIT strategy', () => {
    const mockJobUsingPitPaging = createMockJob({
      columns: ['date', 'ip', 'message'],
      pagingStrategy: 'pit',
    });

    it('warns if max size was reached', async () => {
      const TEST_MAX_SIZE = 500;
      mockConfig = getMockConfig({
        maxSizeBytes: TEST_MAX_SIZE,
      });

      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse(
            range(0, HITS_TOTAL).map(
              () =>
                ({
                  fields: {
                    date: ['2020-12-31T00:14:28.000Z'],
                    ip: ['110.135.176.89'],
                    message: ['super cali fragile istic XPLA docious'],
                  },
                } as unknown as estypes.SearchHit)
            )
          ),
        })
      );

      const generateCsv = new CsvGenerator(
        mockJobUsingPitPaging,
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      const csvResult = await generateCsv.generateData();
      expect(csvResult.max_size_reached).toBe(true);
      expect(csvResult.warnings).toEqual([]);
    });

    it('uses the pit ID to page all the data', async () => {
      mockDataClient.search = jest
        .fn()
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              range(0, HITS_TOTAL / 10).map(
                () =>
                  ({
                    fields: {
                      date: ['2020-12-31T00:14:28.000Z'],
                      ip: ['110.135.176.89'],
                      message: ['hit from the initial search'],
                    },
                  } as unknown as estypes.SearchHit)
              ),
              HITS_TOTAL
            ),
          })
        )
        .mockImplementation(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              range(0, HITS_TOTAL / 10).map(
                () =>
                  ({
                    fields: {
                      date: ['2020-12-31T00:14:28.000Z'],
                      ip: ['110.135.176.89'],
                      message: ['hit from a subsequent scroll'],
                    },
                  } as unknown as estypes.SearchHit)
              )
            ),
          })
        );

      const generateCsv = new CsvGenerator(
        mockJobUsingPitPaging,
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      const csvResult = await generateCsv.generateData();
      expect(csvResult.warnings).toEqual([]);
      expect(content).toMatchSnapshot();

      expect(mockDataClient.search).toHaveBeenCalledTimes(10);
      expect(mockDataClient.search).toBeCalledWith(
        { params: { max_concurrent_shard_requests: 5 } },
        {
          abortSignal: expect.any(AbortSignal),
          strategy: 'es',
          transport: { maxRetries: 0, requestTimeout: '30s' },
        }
      );

      expect(mockEsClient.asCurrentUser.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockEsClient.asCurrentUser.openPointInTime).toHaveBeenCalledWith(
        {
          ignore_unavailable: true,
          index: 'logstash-*',
          keep_alive: '30s',
        },
        {
          maxConcurrentShardRequests: 5,
          maxRetries: 0,
          requestTimeout: '30s',
          signal: expect.any(AbortSignal),
        }
      );

      expect(mockEsClient.asCurrentUser.closePointInTime).toHaveBeenCalledTimes(1);
      expect(mockEsClient.asCurrentUser.closePointInTime).toHaveBeenCalledWith({
        id: mockCursorId,
      });
    });

    it('keeps order of the columns during the scroll', async () => {
      mockDataClient.search = jest
        .fn()
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              [{ fields: { a: ['a1'], b: ['b1'] } } as unknown as estypes.SearchHit],
              3
            ),
          })
        )
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              [{ fields: { b: ['b2'] } } as unknown as estypes.SearchHit],
              3
            ),
          })
        )
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              [{ fields: { a: ['a3'], c: ['c3'] } } as unknown as estypes.SearchHit],
              3
            ),
          })
        );

      const generateCsv = new CsvGenerator(
        createMockJob({ searchSource: {}, columns: [], pagingStrategy: 'pit' }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      await generateCsv.generateData();
      expect(content).toMatchSnapshot();
    });

    it('adds a warning if export was unable to close the PIT', async () => {
      mockEsClient.asCurrentUser.closePointInTime = jest.fn().mockRejectedValueOnce(
        new esErrors.ResponseError({
          statusCode: 419,
          warnings: [],
          meta: { context: 'test' } as any,
        })
      );

      const generateCsv = new CsvGenerator(
        mockJobUsingPitPaging,
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );

      await expect(generateCsv.generateData()).resolves.toMatchInlineSnapshot(`
        Object {
          "content_type": "text/csv",
          "csv_contains_formulas": false,
          "error_code": undefined,
          "max_size_reached": false,
          "metrics": Object {
            "csv": Object {
              "rows": 0,
            },
          },
          "warnings": Array [
            "Unable to close the Point-In-Time used for search. Check the Kibana server logs.",
          ],
        }
      `);
    });

    describe('debug logging', () => {
      it('logs the the total hits relation if relation is provided', async () => {
        mockDataClient.search = jest.fn().mockImplementation(() =>
          Rx.of({
            rawResponse: {
              took: 1,
              timed_out: false,
              pit_id: mockCursorId,
              _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
              hits: { hits: [], total: { relation: 'eq', value: 12345 }, max_score: 0 },
            },
          })
        );

        const debugLogSpy = jest.spyOn(mockLogger, 'debug');
        const generateCsv = new CsvGenerator(
          mockJobUsingPitPaging,
          mockConfig,
          mockTaskInstanceFields,
          {
            es: mockEsClient,
            data: mockDataClient,
            uiSettings: uiSettingsClient,
          },
          {
            searchSourceStart: mockSearchSourceService,
            fieldFormatsRegistry: mockFieldFormatsRegistry,
          },
          new CancellationToken(),
          mockLogger,
          stream,
          false, // isServerless
          jobId
        );

        await generateCsv.generateData();
        expect(debugLogSpy).toHaveBeenCalledWith('Received total hits: 12345. Accuracy: eq.');
      });

      it('logs the the total hits relation as "unknown" if relation is not provided', async () => {
        mockDataClient.search = jest.fn().mockImplementation(() =>
          Rx.of({
            rawResponse: {
              took: 1,
              timed_out: false,
              pit_id: mockCursorId,
              _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
              hits: { hits: [], total: 12345, max_score: 0 },
            },
          })
        );

        const debugLogSpy = jest.spyOn(mockLogger, 'debug');
        const generateCsv = new CsvGenerator(
          mockJobUsingPitPaging,
          mockConfig,
          mockTaskInstanceFields,
          {
            es: mockEsClient,
            data: mockDataClient,
            uiSettings: uiSettingsClient,
          },
          {
            searchSourceStart: mockSearchSourceService,
            fieldFormatsRegistry: mockFieldFormatsRegistry,
          },
          new CancellationToken(),
          mockLogger,
          stream,
          false, // isServerless
          jobId
        );

        await generateCsv.generateData();
        expect(debugLogSpy).toHaveBeenCalledWith('Received total hits: 12345. Accuracy: unknown.');
      });
    });

    describe('useInternalUser parameter', () => {
      beforeEach(() => {
        mockEsClient.asInternalUser.openPointInTime = jest
          .fn()
          .mockResolvedValue({ id: mockCursorId });
        mockEsClient.asInternalUser.closePointInTime = jest.fn().mockResolvedValue({});
      });

      it('uses internal user client when useInternalUser is true', async () => {
        const generateCsv = new CsvGenerator(
          mockJobUsingPitPaging,
          mockConfig,
          mockTaskInstanceFields,
          {
            es: mockEsClient,
            data: mockDataClient,
            uiSettings: uiSettingsClient,
          },
          {
            searchSourceStart: mockSearchSourceService,
            fieldFormatsRegistry: mockFieldFormatsRegistry,
          },
          new CancellationToken(),
          mockLogger,
          stream,
          false,
          jobId,
          true
        );

        await generateCsv.generateData();

        expect(mockEsClient.asInternalUser.openPointInTime).toHaveBeenCalledWith(
          {
            ignore_unavailable: true,
            index: 'logstash-*',
            keep_alive: '30s',
          },
          {
            maxConcurrentShardRequests: 5,
            maxRetries: 0,
            requestTimeout: '30s',
            signal: expect.any(AbortSignal),
          }
        );
        expect(mockEsClient.asCurrentUser.openPointInTime).not.toHaveBeenCalled();

        expect(mockDataClient.search).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            strategy: INTERNAL_ENHANCED_ES_SEARCH_STRATEGY,
          })
        );
      });
    });
  });

  describe('export behavior when scroll duration config is auto', () => {
    const getTaskInstanceFields = (intervalFromNow: { seconds: number }) => {
      const now = new Date(Date.now());
      return { startedAt: now, retryAt: moment(now).add(intervalFromNow).toDate() };
    };

    let mockConfigWithAutoScrollDuration: ReportingConfigType['csv'];
    let mockDataClientSearchFn: jest.MockedFunction<IScopedSearchClient['search']>;

    beforeEach(() => {
      mockConfigWithAutoScrollDuration = {
        ...mockConfig,
        scroll: {
          ...mockConfig.scroll,
          duration: 'auto',
        },
      };

      mockDataClientSearchFn = jest.fn();

      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();

      mockDataClientSearchFn.mockRestore();
    });

    it('csv gets generated if search resolves without errors before the computed timeout value passed to the search data client elapses', async () => {
      const timeFromNowInMs = 4 * 60 * 1000;

      const taskInstanceFields = getTaskInstanceFields({
        seconds: timeFromNowInMs / 1000,
      });

      mockDataClientSearchFn.mockImplementation((_, options) => {
        const getSearchResult = () => {
          const queuedAt = Date.now();

          return new Promise<IKibanaSearchResponse<ReturnType<typeof getMockRawResponse>>>(
            (resolve, reject) => {
              setTimeout(() => {
                if (
                  new Date(Date.now()).getTime() - new Date(queuedAt).getTime() >
                  Number((options?.transport?.requestTimeout! as string).replace(/ms/, ''))
                ) {
                  reject(
                    new esErrors.ResponseError({ statusCode: 408, meta: {} as any, warnings: [] })
                  );
                } else {
                  resolve({
                    rawResponse: getMockRawResponse(
                      [
                        {
                          fields: { a: ['a1'], b: ['b1'] },
                        } as unknown as estypes.SearchHit,
                      ],
                      3
                    ),
                  });
                }
              }, timeFromNowInMs / 4);
            }
          );
        };

        return Rx.defer(getSearchResult);
      });

      const generateCsvPromise = new CsvGenerator(
        createMockJob({ searchSource: {}, columns: ['a', 'b'] }),
        mockConfigWithAutoScrollDuration,
        taskInstanceFields,
        {
          es: mockEsClient,
          data: {
            ...mockDataClient,
            search: mockDataClientSearchFn,
          },
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      ).generateData();

      await jest.advanceTimersByTimeAsync(timeFromNowInMs);

      expect(await generateCsvPromise).toEqual(
        expect.objectContaining({
          warnings: [],
        })
      );

      expect(mockDataClientSearchFn).toBeCalledWith(
        { params: { max_concurrent_shard_requests: 5 } },
        {
          abortSignal: expect.any(AbortSignal),
          strategy: 'es',
          transport: { maxRetries: 0, requestTimeout: `${timeFromNowInMs}ms` },
        }
      );

      expect(content).toMatchSnapshot();
    });

    it('csv generation errors if search request does not resolve before the computed timeout value passed to the search data client elapses', async () => {
      const timeFromNowInMs = 4 * 60 * 1000;

      const taskInstanceFields = getTaskInstanceFields({
        seconds: timeFromNowInMs / 1000,
      });

      const requestDuration = timeFromNowInMs + 1000;

      mockDataClientSearchFn.mockImplementation((_, options) => {
        const getSearchResult = () => {
          const queuedAt = Date.now();

          return new Promise<IKibanaSearchResponse<ReturnType<typeof getMockRawResponse>>>(
            (resolve, reject) => {
              setTimeout(() => {
                if (
                  new Date(Date.now()).getTime() - new Date(queuedAt).getTime() >
                  Number((options?.transport?.requestTimeout! as string).replace(/ms/, ''))
                ) {
                  reject(
                    new esErrors.ResponseError({ statusCode: 408, meta: {} as any, warnings: [] })
                  );
                } else {
                  resolve({
                    rawResponse: getMockRawResponse(
                      [
                        {
                          fields: { a: ['a1'], b: ['b1'] },
                        } as unknown as estypes.SearchHit,
                      ],
                      3
                    ),
                  });
                }
              }, requestDuration);
            }
          );
        };

        return Rx.defer(getSearchResult);
      });

      const generateCsvPromise = new CsvGenerator(
        createMockJob({ searchSource: {}, columns: ['a', 'b'] }),
        mockConfigWithAutoScrollDuration,
        taskInstanceFields,
        {
          es: mockEsClient,
          data: {
            ...mockDataClient,
            search: mockDataClientSearchFn,
          },
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      ).generateData();

      await jest.advanceTimersByTimeAsync(requestDuration);

      expect(await generateCsvPromise).toEqual(
        expect.objectContaining({
          warnings: expect.arrayContaining([
            expect.stringContaining('Received a 408 response from Elasticsearch'),
          ]),
        })
      );

      expect(mockDataClientSearchFn).toBeCalledWith(
        { params: { max_concurrent_shard_requests: 5 } },
        {
          abortSignal: expect.any(AbortSignal),
          strategy: 'es',
          transport: { maxRetries: 0, requestTimeout: `${timeFromNowInMs}ms` },
        }
      );
    });
  });

  describe('Scroll strategy', () => {
    const mockJobUsingScrollPaging = createMockJob({
      columns: ['date', 'ip', 'message'],
      pagingStrategy: 'scroll',
    });

    beforeEach(() => {
      mockDataClient.search = jest
        .fn()
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              range(0, HITS_TOTAL / 10).map(
                () =>
                  ({
                    fields: {
                      date: ['2020-12-31T00:14:28.000Z'],
                      ip: ['110.135.176.89'],
                      message: ['hit from the initial search'],
                    },
                  } as unknown as estypes.SearchHit)
              ),
              HITS_TOTAL
            ),
          })
        )
        .mockImplementation(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              range(0, HITS_TOTAL / 10).map(
                () =>
                  ({
                    fields: {
                      date: ['2020-12-31T00:14:28.000Z'],
                      ip: ['110.135.176.89'],
                      message: ['hit from a subsequent scroll'],
                    },
                  } as unknown as estypes.SearchHit)
              )
            ),
          })
        );
    });

    it('warns if max size was reached', async () => {
      const TEST_MAX_SIZE = 500;

      const generateCsv = new CsvGenerator(
        mockJobUsingScrollPaging,
        getMockConfig({
          maxSizeBytes: TEST_MAX_SIZE,
          scroll: { size: 500, duration: '30s', strategy: 'scroll' },
        }),
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      const csvResult = await generateCsv.generateData();
      expect(csvResult.max_size_reached).toBe(true);
      expect(csvResult.warnings).toEqual([]);
    });

    it('uses the scroll context to page all the data', async () => {
      const generateCsv = new CsvGenerator(
        mockJobUsingScrollPaging,
        getMockConfig({
          scroll: { size: 500, duration: '30s', strategy: 'scroll' },
        }),
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      const csvResult = await generateCsv.generateData();
      expect(csvResult.warnings).toEqual([]);
      expect(content).toMatchSnapshot();

      expect(mockDataClient.search).toHaveBeenCalledTimes(10);
      expect(mockDataClient.search).toBeCalledWith(
        {
          params: expect.objectContaining({
            index: 'logstash-*',
            scroll: '30s',
            size: 500,
            max_concurrent_shard_requests: 5,
          }),
        },
        {
          abortSignal: expect.any(AbortSignal),
          strategy: 'es',
          transport: { maxRetries: 0, requestTimeout: '30s' },
        }
      );

      expect(mockEsClient.asCurrentUser.openPointInTime).not.toHaveBeenCalled();
    });

    it('keeps order of the columns during the scroll', async () => {
      mockDataClient.search = jest
        .fn()
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              [{ fields: { a: ['a1'], b: ['b1'] } } as unknown as estypes.SearchHit],
              3
            ),
          })
        )
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              [{ fields: { b: ['b2'] } } as unknown as estypes.SearchHit],
              3
            ),
          })
        )
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              [{ fields: { a: ['a3'], c: ['c3'] } } as unknown as estypes.SearchHit],
              3
            ),
          })
        );

      const generateCsv = new CsvGenerator(
        createMockJob({ searchSource: {}, columns: [], pagingStrategy: 'scroll' }),
        getMockConfig({
          scroll: { size: 500, duration: '30s', strategy: 'scroll' },
        }),
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      await generateCsv.generateData();
      expect(content).toMatchSnapshot();
    });

    describe('debug logging', () => {
      it('logs the the total hits relation if relation is provided', async () => {
        mockDataClient.search = jest.fn().mockImplementation(() =>
          Rx.of({
            rawResponse: {
              took: 1,
              timed_out: false,
              _scroll_id: mockCursorId,
              _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
              hits: { hits: [], total: { relation: 'eq', value: 100 }, max_score: 0 },
            },
          })
        );

        const debugLogSpy = jest.spyOn(mockLogger, 'debug');
        const generateCsv = new CsvGenerator(
          mockJobUsingScrollPaging,
          getMockConfig({
            scroll: { size: 500, duration: '30s', strategy: 'scroll' },
          }),
          mockTaskInstanceFields,
          {
            es: mockEsClient,
            data: mockDataClient,
            uiSettings: uiSettingsClient,
          },
          {
            searchSourceStart: mockSearchSourceService,
            fieldFormatsRegistry: mockFieldFormatsRegistry,
          },
          new CancellationToken(),
          mockLogger,
          stream,
          false, // isServerless
          jobId
        );

        await generateCsv.generateData();
        expect(debugLogSpy).toHaveBeenCalledWith('Received total hits: 100. Accuracy: eq.');
      });

      it('logs the the total hits relation as "unknown" if relation is not provided', async () => {
        const debugLogSpy = jest.spyOn(mockLogger, 'debug');
        const generateCsv = new CsvGenerator(
          mockJobUsingScrollPaging,
          getMockConfig({
            scroll: { size: 500, duration: '30s', strategy: 'scroll' },
          }),
          mockTaskInstanceFields,
          {
            es: mockEsClient,
            data: mockDataClient,
            uiSettings: uiSettingsClient,
          },
          {
            searchSourceStart: mockSearchSourceService,
            fieldFormatsRegistry: mockFieldFormatsRegistry,
          },
          new CancellationToken(),
          mockLogger,
          stream,
          false, // isServerless
          jobId
        );

        await generateCsv.generateData();
        expect(debugLogSpy).toHaveBeenCalledWith('Received total hits: 100. Accuracy: unknown.');
      });
    });
  });

  describe('fields from job.searchSource.getFields() (7.12 generated)', () => {
    it('cells can be multi-value', async () => {
      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              _id: 'my-cool-id',
              _index: 'my-cool-index',
              _version: 4,
              fields: {
                sku: [`This is a cool SKU.`, `This is also a cool SKU.`],
              },
            },
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({ searchSource: {}, columns: ['_id', 'sku'] }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      await generateCsv.generateData();

      expect(content).toMatchSnapshot();
    });

    it('provides top-level underscored fields as columns', async () => {
      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              _id: 'my-cool-id',
              _index: 'my-cool-index',
              _version: 4,
              fields: {
                date: ['2020-12-31T00:14:28.000Z'],
                message: [`it's nice to see you`],
              },
            },
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({
          searchSource: {
            query: { query: '', language: 'kuery' },
            sort: [{ '@date': 'desc' as any }],
            index: '93f4bc50-6662-11eb-98bc-f550e2308366',
            fields: ['_id', '_index', '@date', 'message'],
            filter: [],
          },
          columns: ['_id', '_index', 'date', 'message'],
        }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );

      const csvResult = await generateCsv.generateData();

      expect(content).toMatchSnapshot();
      expect(csvResult.csv_contains_formulas).toBe(false);
    });

    it('sorts the fields when they are to be used as table column names', async () => {
      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              _id: 'my-cool-id',
              _index: 'my-cool-index',
              _version: 4,
              fields: {
                date: ['2020-12-31T00:14:28.000Z'],
                message_z: [`test field Z`],
                message_y: [`test field Y`],
                message_x: [`test field X`],
                message_w: [`test field W`],
                message_v: [`test field V`],
                message_u: [`test field U`],
                message_t: [`test field T`],
              },
            },
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({
          searchSource: {
            query: { query: '', language: 'kuery' },
            sort: [{ '@date': 'desc' as any }],
            index: '93f4bc50-6662-11eb-98bc-f550e2308366',
            fields: ['*'],
            filter: [],
          },
        }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );

      const csvResult = await generateCsv.generateData();

      expect(content).toMatchSnapshot();
      expect(csvResult.csv_contains_formulas).toBe(false);
    });
  });

  describe('fields from job.columns (7.13+ generated)', () => {
    it('cells can be multi-value', async () => {
      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              _id: 'my-cool-id',
              _index: 'my-cool-index',
              _version: 4,
              fields: {
                product: 'coconut',
                category: [`cool`, `rad`],
              },
            },
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({ searchSource: {}, columns: ['product', 'category'] }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      await generateCsv.generateData();

      expect(content).toMatchSnapshot();
    });

    it('columns can be top-level fields such as _id and _index', async () => {
      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              _id: 'my-cool-id',
              _index: 'my-cool-index',
              _version: 4,
              fields: {
                product: 'coconut',
                category: [`cool`, `rad`],
              },
            },
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({ searchSource: {}, columns: ['_id', '_index', 'product', 'category'] }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      await generateCsv.generateData();

      expect(content).toMatchSnapshot();
    });

    it('default column names come from tabify', async () => {
      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              _id: 'my-cool-id',
              _index: 'my-cool-index',
              _version: 4,
              fields: {
                product: 'coconut',
                category: [`cool`, `rad`],
              },
            },
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({ searchSource: {}, columns: [] }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );
      await generateCsv.generateData();

      expect(content).toMatchSnapshot();
    });
  });

  describe('formulas', () => {
    const TEST_FORMULA = '=SUM(A1:A2)';

    it(`escapes formula values in a cell, doesn't warn the csv contains formulas`, async () => {
      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              fields: {
                date: ['2020-12-31T00:14:28.000Z'],
                ip: ['110.135.176.89'],
                message: [TEST_FORMULA],
              },
            } as unknown as estypes.SearchHit,
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({ columns: ['date', 'ip', 'message'] }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );

      const csvResult = await generateCsv.generateData();

      expect(content).toMatchSnapshot();
      expect(csvResult.csv_contains_formulas).toBe(false);
    });

    it(`escapes formula values in a header, doesn't warn the csv contains formulas`, async () => {
      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              fields: {
                date: ['2020-12-31T00:14:28.000Z'],
                ip: ['110.135.176.89'],
                [TEST_FORMULA]: 'This is great data',
              },
            } as unknown as estypes.SearchHit,
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({ columns: ['date', 'ip', TEST_FORMULA] }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );

      const csvResult = await generateCsv.generateData();

      expect(content).toMatchSnapshot();
      expect(csvResult.csv_contains_formulas).toBe(false);
    });

    it('can check for formulas, without escaping them', async () => {
      mockConfig = getMockConfig({
        checkForFormulas: true,
        escapeFormulaValues: false,
      });

      mockDataClient.search = jest.fn().mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse([
            {
              fields: {
                date: ['2020-12-31T00:14:28.000Z'],
                ip: ['110.135.176.89'],
                message: [TEST_FORMULA],
              },
            } as unknown as estypes.SearchHit,
          ]),
        })
      );

      const generateCsv = new CsvGenerator(
        createMockJob({ columns: ['date', 'ip', 'message'] }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );

      const csvResult = await generateCsv.generateData();

      expect(content).toMatchSnapshot();
      expect(csvResult.csv_contains_formulas).toBe(true);
    });
  });

  it('can override ignoring frozen indices', async () => {
    const originalGet = uiSettingsClient.get;
    uiSettingsClient.get = jest.fn().mockImplementation((key): any => {
      if (key === 'search:includeFrozen') {
        return true;
      }
      return originalGet(key);
    });

    const generateCsv = new CsvGenerator(
      createMockJob({}),
      mockConfig,
      mockTaskInstanceFields,
      { es: mockEsClient, data: mockDataClient, uiSettings: uiSettingsClient },
      {
        searchSourceStart: mockSearchSourceService,
        fieldFormatsRegistry: mockFieldFormatsRegistry,
      },
      new CancellationToken(),
      mockLogger,
      stream,
      false, // isServerless
      jobId
    );

    await generateCsv.generateData();

    expect(mockEsClient.asCurrentUser.openPointInTime).toHaveBeenCalledWith(
      {
        ignore_unavailable: true,
        querystring: { ignore_throttled: false },
        index: 'logstash-*',
        keep_alive: '30s',
      },
      {
        maxConcurrentShardRequests: 5,
        maxRetries: 0,
        requestTimeout: '30s',
        signal: expect.any(AbortSignal),
      }
    );

    expect(mockDataClient.search).toBeCalledWith(
      {
        params: {
          max_concurrent_shard_requests: 5,
        },
      },
      {
        abortSignal: expect.any(AbortSignal),
        strategy: 'es',
        transport: { maxRetries: 0, requestTimeout: '30s' },
      }
    );
  });

  it('will return partial data and a warning if search results exceed the max rows', async () => {
    const mockJobUsingPitPaging = createMockJob({
      columns: ['date', 'ip', 'message'],
      pagingStrategy: 'pit',
    });
    mockDataClient.search = jest
      .fn()
      .mockImplementationOnce(() =>
        Rx.of({
          rawResponse: getMockRawResponse(
            range(0, HITS_TOTAL / 20).map(
              () =>
                ({
                  fields: {
                    date: ['2020-12-31T00:14:28.000Z'],
                    ip: ['110.135.176.89'],
                    message: ['hit from the initial search'],
                  },
                } as unknown as estypes.SearchHit)
            ),
            HITS_TOTAL
          ),
        })
      )
      .mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse(
            range(0, HITS_TOTAL / 20).map(
              () =>
                ({
                  fields: {
                    date: ['2020-12-31T00:14:28.000Z'],
                    ip: ['110.135.176.89'],
                    message: ['hit from a subsequent scroll'],
                  },
                } as unknown as estypes.SearchHit)
            )
          ),
        })
      );

    const generateCsv = new CsvGenerator(
      mockJobUsingPitPaging,
      getMockConfig({
        maxRows: 5,
      }),
      mockTaskInstanceFields,
      {
        es: mockEsClient,
        data: mockDataClient,
        uiSettings: uiSettingsClient,
      },
      {
        searchSourceStart: mockSearchSourceService,
        fieldFormatsRegistry: mockFieldFormatsRegistry,
      },
      new CancellationToken(),
      mockLogger,
      stream,
      false, // isServerless
      jobId
    );
    const warnLogSpy = jest.spyOn(mockLogger, 'warn');
    const csvResult = await generateCsv.generateData();
    expect(csvResult).toMatchInlineSnapshot(`
      Object {
        "content_type": "text/csv",
        "csv_contains_formulas": false,
        "error_code": undefined,
        "max_size_reached": false,
        "metrics": Object {
          "csv": Object {
            "rows": 5,
          },
        },
        "warnings": Array [
          "Your export would have generated 100 total rows, but was limited to the maximum recommended row limit of 5. This limit can be configured in kibana.yml, but increasing it may impact performance.",
        ],
      }
    `);
    expect(warnLogSpy).toHaveBeenCalledWith(
      'Your requested export includes 100 rows, which has exceeded the recommended row limit (5). This limit can be configured in kibana.yml, but increasing it may impact performance.'
    );
  });

  it('will return warning that doesnt reference kibana.yml in serverless if search results exceed the max rows', async () => {
    const mockJobUsingPitPaging = createMockJob({
      columns: ['date', 'ip', 'message'],
      pagingStrategy: 'pit',
    });
    mockDataClient.search = jest
      .fn()
      .mockImplementationOnce(() =>
        Rx.of({
          rawResponse: getMockRawResponse(
            range(0, HITS_TOTAL / 20).map(
              () =>
                ({
                  fields: {
                    date: ['2020-12-31T00:14:28.000Z'],
                    ip: ['110.135.176.89'],
                    message: ['hit from the initial search'],
                  },
                } as unknown as estypes.SearchHit)
            ),
            HITS_TOTAL
          ),
        })
      )
      .mockImplementation(() =>
        Rx.of({
          rawResponse: getMockRawResponse(
            range(0, HITS_TOTAL / 20).map(
              () =>
                ({
                  fields: {
                    date: ['2020-12-31T00:14:28.000Z'],
                    ip: ['110.135.176.89'],
                    message: ['hit from a subsequent scroll'],
                  },
                } as unknown as estypes.SearchHit)
            )
          ),
        })
      );

    const generateCsv = new CsvGenerator(
      mockJobUsingPitPaging,
      getMockConfig({
        maxRows: 5,
      }),
      mockTaskInstanceFields,
      {
        es: mockEsClient,
        data: mockDataClient,
        uiSettings: uiSettingsClient,
      },
      {
        searchSourceStart: mockSearchSourceService,
        fieldFormatsRegistry: mockFieldFormatsRegistry,
      },
      new CancellationToken(),
      mockLogger,
      stream,
      true, // isServerless
      jobId
    );
    const warnLogSpy = jest.spyOn(mockLogger, 'warn');
    const csvResult = await generateCsv.generateData();
    expect(csvResult).toMatchInlineSnapshot(`
      Object {
        "content_type": "text/csv",
        "csv_contains_formulas": false,
        "error_code": undefined,
        "max_size_reached": false,
        "metrics": Object {
          "csv": Object {
            "rows": 5,
          },
        },
        "warnings": Array [
          "Your export would have generated 100 total rows, but was limited to the maximum recommended row limit of 5.",
        ],
      }
    `);
    expect(warnLogSpy).toHaveBeenCalledWith(
      'Your requested export includes 100 rows, which has exceeded the recommended row limit (5).'
    );
  });

  it('will return partial data if the scroll or search fails', async () => {
    mockDataClient.search = jest.fn().mockImplementation(() => {
      throw new esErrors.ResponseError({
        statusCode: 500,
        meta: {} as any,
        body: 'my error',
        warnings: [],
      });
    });
    const generateCsv = new CsvGenerator(
      createMockJob({ columns: ['date', 'ip', 'message'] }),
      mockConfig,
      mockTaskInstanceFields,
      {
        es: mockEsClient,
        data: mockDataClient,
        uiSettings: uiSettingsClient,
      },
      {
        searchSourceStart: mockSearchSourceService,
        fieldFormatsRegistry: mockFieldFormatsRegistry,
      },
      new CancellationToken(),
      mockLogger,
      stream,
      false, // isServerless
      jobId
    );
    await expect(generateCsv.generateData()).resolves.toMatchInlineSnapshot(`
      Object {
        "content_type": "text/csv",
        "csv_contains_formulas": false,
        "error_code": undefined,
        "max_size_reached": false,
        "metrics": Object {
          "csv": Object {
            "rows": 0,
          },
        },
        "warnings": Array [
          "Received a 500 response from Elasticsearch: my error",
          "Encountered an error with the number of CSV rows generated from the search: expected rows were indeterminable, received 0.",
        ],
      }
    `);
    expect(mockLogger.error.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          [ResponseError: CSV export search error: my error],
          Object {
            "tags": Array [
              "mock-job-id",
            ],
          },
        ],
      ]
    `);
  });

  it('handles unknown errors', async () => {
    const streamWriteSpy = jest.spyOn(stream, 'write');
    mockDataClient.search = jest.fn().mockImplementation(() => {
      throw new Error('An unknown error');
    });
    const generateCsv = new CsvGenerator(
      createMockJob({ columns: ['date', 'ip', 'message'] }),
      mockConfig,
      mockTaskInstanceFields,
      {
        es: mockEsClient,
        data: mockDataClient,
        uiSettings: uiSettingsClient,
      },
      {
        searchSourceStart: mockSearchSourceService,
        fieldFormatsRegistry: mockFieldFormatsRegistry,
      },
      new CancellationToken(),
      mockLogger,
      stream,
      false, // isServerless
      jobId
    );

    await expect(generateCsv.generateData()).resolves.toMatchInlineSnapshot(`
      Object {
        "content_type": "text/csv",
        "csv_contains_formulas": false,
        "error_code": undefined,
        "max_size_reached": false,
        "metrics": Object {
          "csv": Object {
            "rows": 0,
          },
        },
        "warnings": Array [
          "Encountered an unknown error: CSV export search error: An unknown error",
          "Encountered an error with the number of CSV rows generated from the search: expected rows were indeterminable, received 0.",
        ],
      }
    `);
    expect(streamWriteSpy.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "",
        ],
        Array [
          "
      \\"Encountered an unknown error: CSV export search error: An unknown error\\"
      \\"Encountered an error with the number of CSV rows generated from the search: expected rows were indeterminable, received 0.\\"",
        ],
      ]
    `);
  });

  describe('error codes', () => {
    it('returns the expected error code when authentication expires', async () => {
      mockDataClient.search = jest
        .fn()
        .mockImplementationOnce(() =>
          Rx.of({
            rawResponse: getMockRawResponse(
              range(0, 5).map(() => ({
                _index: 'lasdf',
                _id: 'lasdf123',
                fields: {
                  date: ['2020-12-31T00:14:28.000Z'],
                  ip: ['110.135.176.89'],
                  message: ['super cali fragile istic XPLA docious'],
                },
              })),
              10
            ),
          })
        )
        .mockImplementationOnce(() => {
          throw new esErrors.ResponseError({ statusCode: 403, meta: {} as any, warnings: [] });
        });

      const generateCsv = new CsvGenerator(
        createMockJob({ columns: ['date', 'ip', 'message'] }),
        mockConfig,
        mockTaskInstanceFields,
        {
          es: mockEsClient,
          data: mockDataClient,
          uiSettings: uiSettingsClient,
        },
        {
          searchSourceStart: mockSearchSourceService,
          fieldFormatsRegistry: mockFieldFormatsRegistry,
        },
        new CancellationToken(),
        mockLogger,
        stream,
        false, // isServerless
        jobId
      );

      const { error_code: errorCode, warnings } = await generateCsv.generateData();
      expect(errorCode).toBe('authentication_expired_error');
      expect(warnings).toMatchInlineSnapshot(`
        Array [
          "This report contains partial CSV results because the authentication token expired. Export a smaller amount of data or increase the timeout of the authentication token.",
          "Encountered an error with the number of CSV rows generated from the search: expected 10, received 5.",
        ]
      `);

      expect(mockLogger.error.mock.calls).toMatchInlineSnapshot(`
        Array [
          Array [
            [ResponseError: CSV export search error: Response Error],
            Object {
              "tags": Array [
                "mock-job-id",
              ],
            },
          ],
        ]
      `);
    });
  });
});
