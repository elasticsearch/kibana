/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LogsExtractionClient } from './logs_extraction_client';
import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { DataViewsService } from '@kbn/data-views-plugin/common';
import type { ESQLSearchResponse } from '@kbn/es-types';
import moment from 'moment';
import { executeEsqlQuery } from '../../infra/elasticsearch/esql';
import { ingestEntities } from '../../infra/elasticsearch/ingest';
import { HASHED_ID_FIELD } from './logs_extraction_query_builder';
import { ENGINE_METADATA_UNTYPED_ID_FIELD, TIMESTAMP_FIELD } from './query_builder_commons';
import { LOG_PAGINATION_CURSOR_TOTAL_LOGS_FIELD } from './log_pagination_probe_query_builder';

const LOG_PAGINATION_CURSOR_PROBE_COLUMNS: ESQLSearchResponse['columns'] = [
  { name: TIMESTAMP_FIELD, type: 'date' },
  { name: LOG_PAGINATION_CURSOR_TOTAL_LOGS_FIELD, type: 'long' },
];

/**
 * Default total_logs = maxLogsPerPage, which is always >= the scaled sample limit
 * (`scaledProbeLimit(maxLogsPerPage) = round(maxLogsPerPage * 0.1)`), so by default this mocks a
 * saturated (non-final) slice — more pages may follow. Pass a smaller `totalLogsInSlice` below
 * the effective page's scaled limit to mock a last/partial page instead.
 */
function mockLogPaginationCursorProbeRow(
  timestamp: string,
  totalLogsInSlice: number = LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT
): ESQLSearchResponse {
  return {
    columns: LOG_PAGINATION_CURSOR_PROBE_COLUMNS,
    values: [[timestamp, totalLogsInSlice]],
  };
}

function mockLogPaginationCursorProbeEmpty(): ESQLSearchResponse {
  return {
    columns: LOG_PAGINATION_CURSOR_PROBE_COLUMNS,
    values: [],
  };
}

/**
 * First slice + extraction + terminal empty log pagination cursor probe (end of window) +
 * the follow-up sweep extraction that the terminal empty probe now unconditionally triggers.
 * A sampled probe returning zero rows does not prove the real remainder is empty, so the loop
 * always re-scans `[logsPageCursorStart, toDateISO]` for real docs before exiting — see
 * `runMainExtractionLoop`'s unification of the `hasLogsToProcess: false` and `isLastLogsPage`
 * branches. That sweep is a 4th ESQL call (an extraction, here mocked empty).
 */
function mockExtractSuccessSequence(
  mainExtractionResponse: ESQLSearchResponse,
  totalLogsInSlice?: number
): void {
  mockExecuteEsqlQuery
    .mockResolvedValueOnce(
      mockLogPaginationCursorProbeRow(
        String(mainExtractionResponse.values.at(-1)?.[0] ?? '2024-01-02T12:00:00.000Z'),
        totalLogsInSlice
      )
    )
    .mockResolvedValueOnce(mainExtractionResponse)
    .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty())
    .mockResolvedValueOnce({ columns: [], values: [] });
}
import {
  LogExtractionConfig,
  LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT,
  type EngineDescriptorClient,
  type EntityStoreGlobalState,
  type EntityStoreGlobalStateClient,
  type EntityStoreGlobalStateOverrides,
} from '../saved_objects';
import { ENGINE_STATUS } from '../constants';
import type { EntityType } from '../../../common/domain/definitions/entity_schema';

jest.mock('../../infra/elasticsearch/esql');
jest.mock('../../infra/elasticsearch/ingest');

const mockExecuteEsqlQuery = executeEsqlQuery as jest.MockedFunction<typeof executeEsqlQuery>;
const mockIngestEntities = ingestEntities as jest.MockedFunction<typeof ingestEntities>;

function createMockEngineDescriptor(
  type: EntityType = 'user',
  overrides?: Partial<{
    lookbackPeriod: string;
    delay: string;
    checkpointTimestamp: string;
    paginationId: string;
    lastExecutionTimestamp: string;
    sliceEndTimestamp: string;
    nonPriorityLogExtractionState: {
      checkpointTimestamp: string | null;
      paginationId: string | null;
      lastExecutionTimestamp: string | null;
      sliceEndTimestamp: string | null;
    } | null;
  }>
) {
  const logExtractionState = {
    checkpointTimestamp: overrides?.checkpointTimestamp ?? null,
    paginationId: overrides?.paginationId ?? null,
    lastExecutionTimestamp: overrides?.lastExecutionTimestamp ?? null,
    sliceEndTimestamp: overrides?.sliceEndTimestamp ?? null,
  };
  return {
    type,
    status: ENGINE_STATUS.STARTED,
    logExtractionState,
    nonPriorityLogExtractionState: overrides?.nonPriorityLogExtractionState ?? null,
    versionState: { version: 2, state: 'running' as const, isMigratedFromV1: false },
  };
}

type GlobalStateLogExtractionOverrides = Partial<{
  lookbackPeriod: string;
  delay: string;
  maxTimeWindowSize: string;
  maxLogsPerWindow: number;
  excludedIndexPatterns: string[];
  additionalIndexPatterns: string[];
  docsLimit: number;
}>;

function createMockGlobalStateClient(
  logExtractionOverrides?: GlobalStateLogExtractionOverrides
): jest.Mocked<
  Pick<
    EntityStoreGlobalStateClient,
    'find' | 'findOrThrow' | 'findLogExtractionOverrides' | 'update'
  >
> {
  const logsExtraction = LogExtractionConfig.parse({
    docsLimit: logExtractionOverrides?.docsLimit ?? 10000,
    additionalIndexPatterns: logExtractionOverrides?.additionalIndexPatterns ?? [],
    excludedIndexPatterns: logExtractionOverrides?.excludedIndexPatterns ?? [],
    lookbackPeriod: logExtractionOverrides?.lookbackPeriod ?? '3h',
    delay: logExtractionOverrides?.delay ?? '1m',
    // Default to a very large cap so existing tests run as a single sub-window. The dedicated
    // sub-window cap describe block overrides this to exercise capping behavior.
    maxTimeWindowSize: logExtractionOverrides?.maxTimeWindowSize ?? '999d',
    // Default to 0 (disabled) so volume-cap logic doesn't interfere with unrelated tests.
    // The dedicated volume-cap describe block overrides this via setupVolCapTest.
    maxLogsPerWindow: logExtractionOverrides?.maxLogsPerWindow ?? 0,
  });
  const state = { logsExtraction } as EntityStoreGlobalState;
  return {
    find: jest.fn().mockResolvedValue(state),
    findOrThrow: jest.fn().mockResolvedValue(state),
    findLogExtractionOverrides: jest.fn().mockResolvedValue(logsExtraction),
    update: jest.fn().mockImplementation(async (partial: EntityStoreGlobalStateOverrides) => ({
      ...state,
      logsExtraction: LogExtractionConfig.parse({
        ...logsExtraction,
        ...partial.logsExtraction,
      }),
    })),
  };
}

/** Points every global-state read at the same fixture. The extraction path consumes `findLogExtractionOverrides`, not `findOrThrow`. */
function setGlobalState(
  mockGlobalStateClient: ReturnType<typeof createMockGlobalStateClient>,
  state: EntityStoreGlobalState
): void {
  mockGlobalStateClient.find.mockResolvedValue(state);
  mockGlobalStateClient.findOrThrow.mockResolvedValue(state);
  mockGlobalStateClient.findLogExtractionOverrides.mockResolvedValue(state.logsExtraction);
}

interface TestContext {
  client: LogsExtractionClient;
  mockLogger: ReturnType<typeof loggerMock.create>;
  mockEsClient: jest.Mocked<ElasticsearchClient>;
  mockDataViewsService: jest.Mocked<DataViewsService>;
  mockEngineDescriptorClient: jest.Mocked<Pick<EngineDescriptorClient, 'findOrThrow' | 'update'>>;
  mockGlobalStateClient: ReturnType<typeof createMockGlobalStateClient>;
}

/** Fresh mocks + client for one test. Shared by every top-level describe in this file. */
function createTestContext(globalStateOverrides?: GlobalStateLogExtractionOverrides): TestContext {
  jest.clearAllMocks();
  // clearAllMocks does NOT drain mockResolvedValueOnce queues — only mockReset does.
  // Cap tests consume fewer queued calls than were set up (cap fires early), leaving stale
  // Once values that would otherwise pollute the next test.
  mockExecuteEsqlQuery.mockReset();
  mockIngestEntities.mockReset();

  const mockLogger = loggerMock.create();
  const mockEsClient = {
    indices: {
      resolveIndex: jest.fn().mockResolvedValue({ indices: [], aliases: [], data_streams: [] }),
    },
  } as unknown as jest.Mocked<ElasticsearchClient>;
  const mockDataViewsService = {
    get: jest.fn(),
  } as unknown as jest.Mocked<DataViewsService>;
  const mockEngineDescriptorClient: TestContext['mockEngineDescriptorClient'] = {
    findOrThrow: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
  const mockGlobalStateClient = createMockGlobalStateClient(globalStateOverrides);

  const client = new LogsExtractionClient({
    logger: mockLogger,
    namespace: 'default',
    esClient: mockEsClient,
    dataViewsService: mockDataViewsService,
    engineDescriptorClient: mockEngineDescriptorClient as unknown as EngineDescriptorClient,
    globalStateClient: mockGlobalStateClient as unknown as EntityStoreGlobalStateClient,
  });

  return {
    client,
    mockLogger,
    mockEsClient,
    mockDataViewsService,
    mockEngineDescriptorClient,
    mockGlobalStateClient,
  };
}

describe('LogsExtractionClient', () => {
  let client: LogsExtractionClient;
  let mockLogger: ReturnType<typeof loggerMock.create>;
  let mockEsClient: jest.Mocked<ElasticsearchClient>;
  let mockDataViewsService: jest.Mocked<DataViewsService>;
  let mockEngineDescriptorClient: jest.Mocked<
    Pick<EngineDescriptorClient, 'findOrThrow' | 'update'>
  >;
  let mockGlobalStateClient: ReturnType<typeof createMockGlobalStateClient>;

  beforeEach(() => {
    ({
      client,
      mockLogger,
      mockEsClient,
      mockDataViewsService,
      mockEngineDescriptorClient,
      mockGlobalStateClient,
    } = createTestContext());
  });

  describe('extractLogs', () => {
    it('should successfully extract logs and ingest entities', async () => {
      const lastTimestamp = '2024-01-02T12:00:00.000Z';
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
          { name: 'user.name', type: 'keyword' },
          { name: 'host.name', type: 'keyword' },
        ],
        values: [
          ['2024-01-02T10:00:00.000Z', 'hash1', 'user1', 'host1'],
          [lastTimestamp, 'hash2', 'user2', 'host2'],
        ],
      };

      const mockDataView = {
        getIndexPattern: jest
          .fn()
          .mockReturnValue('logs-*,filebeat-*,.alerts-security.alerts-default'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExtractSuccessSequence(mockEsqlResponse);
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      expect(result.success && result.count).toBe(2);
      expect(result.success && result.scannedIndices).toContain('logs-*');
      expect(result.success && result.scannedIndices).toContain('filebeat-*');
      expect(result.success && result.scannedIndices).not.toContain(
        '.alerts-security.alerts-default'
      );

      expect(mockEngineDescriptorClient.findOrThrow).toHaveBeenCalledWith('user');
      // probe, extraction, terminal empty probe, and the follow-up sweep extraction it triggers.
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(4);
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          esClient: mockEsClient,
          query: expect.any(String),
        })
      );

      // The sweep extraction after the terminal empty probe ingests 0 rows but still calls
      // ingestEntities unconditionally (see ingestEntityPagesWithinCurrentLogPage).
      expect(mockIngestEntities).toHaveBeenCalledTimes(2);
      expect(mockIngestEntities).toHaveBeenCalledWith({
        esClient: mockEsClient,
        esqlResponse: mockEsqlResponse,
        esIdField: HASHED_ID_FIELD,
        targetIndex: expect.stringContaining('.entities.v2.latest.default'),
        logger: expect.any(Object),
        abortController: undefined,
        refresh: true,
        onDropped: expect.any(Function),
      });

      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith(
        'user',
        expect.objectContaining({
          logExtractionState: expect.objectContaining({
            checkpointTimestamp: null,
            paginationId: null,
            lastExecutionTimestamp: expect.any(String),
          }),
        })
      );
    });

    it('threads excludedIndexPatterns into the extraction ES query as -pattern entries', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockGlobalStateClient = createMockGlobalStateClient({
        excludedIndexPatterns: ['logs-proxy-*'],
      });
      client = new LogsExtractionClient({
        logger: mockLogger,
        namespace: 'default',
        esClient: mockEsClient,
        dataViewsService: mockDataViewsService,
        engineDescriptorClient: mockEngineDescriptorClient as unknown as EngineDescriptorClient,
        globalStateClient: mockGlobalStateClient as unknown as EntityStoreGlobalStateClient,
      });

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());

      await client.extractLogs('user');

      const queries = mockExecuteEsqlQuery.mock.calls.map(([{ query }]) => query);
      expect(queries.some((q) => q.includes('-logs-proxy-*'))).toBe(true);
    });

    it('excludes internal ES|QL views on origin and every remote cluster without naming linked projects', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*,$.alert-actions'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());

      await client.extractLogs('user');

      const queries = mockExecuteEsqlQuery.mock.calls.map(([{ query }]) => query);
      expect(queries.some((q) => q.includes('-$.*'))).toBe(true);
      expect(queries.some((q) => q.includes('*:-$.*'))).toBe(true);
      expect(queries.every((q) => !q.includes('kayak-f86d55'))).toBe(true);
    });

    it('retries the probe after a remote-view error and reuses those exclusions for extraction', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
        ],
        values: [['2024-01-02T10:00:00.000Z', 'hash1']],
      };
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };
      const remoteViewError = {
        message:
          'ES|QL queries with remote views are not supported. Matched [kayak-f86d55:logs-security-summary]. Remove them from the query pattern or exclude them with [kayak-f86d55:-logs-security-summary] if matched by a wildcard.',
        meta: {
          body: {
            error: {
              type: 'remote_resource_not_supported_exception',
              reason:
                'ES|QL queries with remote views are not supported. Matched [kayak-f86d55:logs-security-summary].',
              'es.esql.view.names': ['kayak-f86d55:logs-security-summary'],
            },
          },
        },
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery
        .mockRejectedValueOnce(remoteViewError)
        .mockResolvedValueOnce(mockLogPaginationCursorProbeRow('2024-01-02T10:00:00.000Z'))
        .mockResolvedValueOnce(mockEsqlResponse)
        .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty())
        .mockResolvedValueOnce({ columns: [], values: [] });
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      // probe fail, probe retry, extraction, terminal empty probe, sweep extraction
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(5);

      const probeRetryQuery = mockExecuteEsqlQuery.mock.calls[1][0].query;
      const extractionQuery = mockExecuteEsqlQuery.mock.calls[2][0].query;
      expect(probeRetryQuery).toContain('*:-logs-security-summary');
      expect(extractionQuery).toContain('*:-logs-security-summary');
      expect(extractionQuery).toContain('kayak-f86d55:-logs-security-summary');
    });

    it('propagates extraction error when the probe succeeded but extraction hits a remote view not seen by the probe', async () => {
      // The probe accumulates remote-resource exclusions into indexPatterns; by the time
      // extraction runs those exclusions are already present. A remote view error on extraction
      // therefore represents a view the probe did not encounter (race condition), and it
      // propagates as a failure rather than being silently retried.
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };
      const remoteViewError = {
        message: 'remote_resource_not_supported_exception',
        meta: {
          body: {
            error: {
              type: 'remote_resource_not_supported_exception',
              reason: 'ES|QL queries with remote views are not supported.',
              'es.esql.view.names': ['booking-aa11:custom-view'],
            },
          },
        },
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(mockLogPaginationCursorProbeRow('2024-01-02T10:00:00.000Z'))
        .mockRejectedValueOnce(remoteViewError);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(false);
    });

    it('should handle empty results from ESQL query', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      expect(result.success && result.count).toBe(0);

      // A terminal empty probe no longer breaks immediately: it is unified with the last-page
      // path and still runs a follow-up sweep extraction over the window before the loop exits,
      // since a sampled probe returning zero rows does not prove the real remainder is empty.
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
      expect(mockIngestEntities).toHaveBeenCalledTimes(1);
      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith(
        'user',
        expect.objectContaining({
          logExtractionState: expect.objectContaining({
            checkpointTimestamp: null,
            paginationId: null,
            lastExecutionTimestamp: expect.any(String),
          }),
        })
      );
    });

    it('sweeps and ingests real docs when the sampled probe returns zero rows (does not silently drop them)', async () => {
      // Core correctness guarantee of the SAMPLE-based probe: sampling can return zero rows
      // (hasLogsToProcess: false) even though real, unsampled docs still exist in the window
      // (e.g. a couple of docs, ~90% chance neither gets sampled at the default p=0.1). The
      // follow-up sweep extraction always re-scans the real [logsPageCursorStart, toDateISO]
      // window and ingests idempotently, so nothing the sample missed is silently dropped.
      const realDocsResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
        ],
        values: [
          ['2024-01-02T10:00:00.000Z', 'hash1'],
          ['2024-01-02T10:00:01.000Z', 'hash2'],
        ],
      };

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      // Probe samples zero rows, but the follow-up sweep extraction still finds real docs.
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty())
        .mockResolvedValueOnce(realDocsResponse);
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      // Nothing is silently dropped: the sweep extraction's real docs are still ingested.
      expect(result.success && result.count).toBe(2);
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
      expect(mockIngestEntities).toHaveBeenCalledTimes(1);
      expect(mockIngestEntities).toHaveBeenCalledWith(
        expect.objectContaining({ esqlResponse: realDocsResponse })
      );
    });

    it('does not run a sweep extraction when an exact (unsampled) probe finds nothing', async () => {
      // effectiveMaxLogsPerPage=1 (via maxLogsPerWindow=1) → pickSampleProbability(1)=1: too
      // small for sampling to help, so the probe is exact. An empty result from an exact probe
      // is definitive (no real docs can be missed the way a sampled probe can miss them), so
      // the loop should stop immediately instead of running a redundant sweep extraction.
      mockGlobalStateClient = createMockGlobalStateClient({ maxLogsPerWindow: 1 });
      client = new LogsExtractionClient({
        logger: mockLogger,
        namespace: 'default',
        esClient: mockEsClient,
        dataViewsService: mockDataViewsService,
        engineDescriptorClient: mockEngineDescriptorClient as unknown as EngineDescriptorClient,
        globalStateClient: mockGlobalStateClient as unknown as EntityStoreGlobalStateClient,
      });

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue({
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      } as any);
      mockExecuteEsqlQuery.mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty());

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      expect(result.success && result.count).toBe(0);
      expect(result.success && result.logsProcessed).toBe(0);
      expect(result.success && result.logsCapApplied).toBe(false);
      // Only the single (empty) probe call — no follow-up sweep extraction.
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
      expect(mockIngestEntities).not.toHaveBeenCalled();
    });

    it('should compute extraction window from lookbackPeriod and delay when no custom range', async () => {
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      jest.useFakeTimers({ now: fixedNow.getTime() });

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      const globalStateWithDelay5s = {
        logsExtraction: LogExtractionConfig.parse({
          lookbackPeriod: '3h',
          delay: '5s',
          maxTimeWindowSize: '999d',
        }),
      } as EntityStoreGlobalState;
      setGlobalState(mockGlobalStateClient, globalStateWithDelay5s);
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      mockIngestEntities.mockResolvedValue(undefined);

      await client.extractLogs('user');

      const expectedFrom = moment.utc(fixedNow).subtract(3, 'hours').toISOString();
      const expectedTo = moment.utc(fixedNow).subtract(5, 'seconds').toISOString();

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          esClient: mockEsClient,
          query: expect.stringContaining(expectedFrom),
        })
      );
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          esClient: mockEsClient,
          query: expect.stringContaining(expectedTo),
        })
      );

      jest.useRealTimers();
    });

    it('uses lookback as extraction window from when no checkpoint set', async () => {
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      jest.useFakeTimers({ now: fixedNow.getTime() });

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      const globalStateWithDelay5s = {
        logsExtraction: LogExtractionConfig.parse({
          lookbackPeriod: '3h',
          delay: '5s',
          maxTimeWindowSize: '999d',
        }),
      } as EntityStoreGlobalState;
      setGlobalState(mockGlobalStateClient, globalStateWithDelay5s);
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      mockIngestEntities.mockResolvedValue(undefined);

      await client.extractLogs('user');

      const lookbackFrom = moment.utc(fixedNow).subtract(3, 'hours').toISOString();
      const firstEsql = mockExecuteEsqlQuery.mock.calls[0][0].query;
      expect(firstEsql).toContain(lookbackFrom);

      jest.useRealTimers();
    });

    it('uses lastExecutionTimestamp as extraction window from when no checkpoint set', async () => {
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      jest.useFakeTimers({ now: fixedNow.getTime() });

      const lastExecutionTimestamp = '2025-01-15T11:00:00.000Z';
      const delayedLastExecution = moment.utc(fixedNow).subtract(5, 'seconds').toISOString();

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      const globalStateWithDelay5s = {
        logsExtraction: LogExtractionConfig.parse({
          lookbackPeriod: '3h',
          delay: '5s',
          maxTimeWindowSize: '999d',
        }),
      } as EntityStoreGlobalState;
      setGlobalState(mockGlobalStateClient, globalStateWithDelay5s);
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user', { lastExecutionTimestamp }) as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      mockIngestEntities.mockResolvedValue(undefined);

      await client.extractLogs('user');

      const firstEsql = mockExecuteEsqlQuery.mock.calls[0][0].query;
      expect(firstEsql).toContain(delayedLastExecution);

      jest.useRealTimers();
    });

    it('should use checkpointTimestamp as from and subtract delay for to', async () => {
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      jest.useFakeTimers({ now: fixedNow.getTime() });

      const checkpointTimestamp = '2025-01-15T10:30:00.000Z';

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user', {
          lookbackPeriod: '3h',
          delay: '1m',
          checkpointTimestamp,
        }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      mockIngestEntities.mockResolvedValue(undefined);

      await client.extractLogs('user');

      const expectedTo = moment.utc(fixedNow).subtract(1, 'minute').toISOString();

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          esClient: mockEsClient,
          query: expect.stringContaining(checkpointTimestamp),
        })
      );
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          esClient: mockEsClient,
          query: expect.stringContaining(expectedTo),
        })
      );

      jest.useRealTimers();
    });

    it('should return error when specificWindow has from date after to date', async () => {
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue({
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      } as any);

      const fromDate = '2024-01-02T12:00:00.000Z';
      const toDate = '2024-01-01T00:00:00.000Z';

      const result = await client.extractLogs('user', {
        specificWindow: { fromDateISO: fromDate, toDateISO: toDate },
      });

      expect(result.success).toBe(false);
      expect(!result.success && result.error.message).toBe(
        'From 2024-01-02T12:00:00.000Z date is after to 2024-01-01T00:00:00.000Z date'
      );
      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
      expect(mockIngestEntities).not.toHaveBeenCalled();
      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith('user', {
        error: {
          message: 'From 2024-01-02T12:00:00.000Z date is after to 2024-01-01T00:00:00.000Z date',
          action: 'extractLogs',
        },
      });
    });

    it('should return error when computed extraction window has from date after to date', async () => {
      const fixedNow = new Date('2025-01-15T11:00:00.000Z');
      jest.useFakeTimers({ now: fixedNow.getTime() });

      const checkpointTimestamp = '2025-01-15T12:00:00.000Z'; // after fixedNow
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user', {
          lookbackPeriod: '3h',
          delay: '1m',
          checkpointTimestamp,
        }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
      );
      mockDataViewsService.get.mockResolvedValue({
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      } as any);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(false);
      expect(!result.success && result.error.message).toBe(
        'From 2025-01-15T12:00:00.000Z date is after to 2025-01-15T10:59:00.000Z date'
      );
      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
      expect(mockIngestEntities).not.toHaveBeenCalled();
      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith('user', {
        error: {
          message: 'From 2025-01-15T12:00:00.000Z date is after to 2025-01-15T10:59:00.000Z date',
          action: 'extractLogs',
        },
      });

      jest.useRealTimers();
    });

    it('should use custom date range when provided', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      mockIngestEntities.mockResolvedValue(undefined);

      const fromDate = '2024-01-01T00:00:00.000Z';
      const toDate = '2024-01-02T00:00:00.000Z';

      await client.extractLogs('user', {
        specificWindow: { fromDateISO: fromDate, toDateISO: toDate },
      });

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          esClient: mockEsClient,
          query: expect.stringContaining(fromDate),
        })
      );
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          esClient: mockEsClient,
          query: expect.stringContaining(toDate),
        })
      );
      expect(mockEngineDescriptorClient.update).not.toHaveBeenCalled();
    });

    it('should not update engine descriptor when specificWindow is provided', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
        ],
        values: [
          ['2024-01-02T10:00:00.000Z', 'hash1'],
          ['2024-01-02T12:00:00.000Z', 'hash2'],
        ],
      };

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExtractSuccessSequence(mockEsqlResponse);
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user', {
        specificWindow: {
          fromDateISO: '2024-01-01T00:00:00.000Z',
          toDateISO: '2024-01-02T00:00:00.000Z',
        },
      });

      expect(result.success).toBe(true);
      expect(result.success && result.count).toBe(2);
      // probe, extraction, terminal empty probe, and its follow-up sweep extraction.
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(4);
      expect(mockIngestEntities).toHaveBeenCalledTimes(2);
      expect(mockEngineDescriptorClient.update).not.toHaveBeenCalled();
    });

    it('should handle errors from executeEsqlQuery', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      const testError = new Error('ESQL query failed');
      mockExecuteEsqlQuery.mockRejectedValue(testError);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(false);
      expect(!result.success && result.error).toBe(testError);
      expect(mockIngestEntities).not.toHaveBeenCalled();
      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith('user', {
        error: { message: testError.message, action: 'extractLogs' },
      });
    });

    it('should handle errors from ingestEntities', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
        ],
        values: [['2024-01-02T10:00:00.000Z', 'hash1']],
      };

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(mockLogPaginationCursorProbeRow('2024-01-02T10:00:00.000Z'))
        .mockResolvedValueOnce(mockEsqlResponse);
      const testError = new Error('Ingestion failed');
      mockIngestEntities.mockRejectedValue(testError);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(false);
      expect(!result.success && result.error).toBe(testError);
      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith('user', {
        error: { message: testError.message, action: 'extractLogs' },
      });
    });

    it('should include remote index patterns in the main extraction query', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
          { name: 'entity.id', type: 'keyword' },
        ],
        values: [['2024-01-02T10:00:00.000Z', 'hash1', 'user:u1']],
      };

      const mockDataView = {
        getIndexPattern: jest
          .fn()
          .mockReturnValue('logs-*,remote_cluster:logs-*,other:filebeat-*,metrics-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExtractSuccessSequence(mockEsqlResponse);
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      // All patterns (local and remote) flow through the main LOOKUP JOIN path.
      expect(result.success && result.scannedIndices).toContain('logs-*');
      expect(result.success && result.scannedIndices).toContain('metrics-*');
      expect(result.success && result.scannedIndices).toContain('remote_cluster:logs-*');
      expect(result.success && result.scannedIndices).toContain('other:filebeat-*');
      // probe, extraction, terminal empty probe, and its follow-up sweep extraction.
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(4);
    });

    it('should clear a previous error after a successful extraction', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue({
        ...createMockEngineDescriptor('user'),
        error: { message: 'previous error', action: 'extractLogs' as const },
      } as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>);
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      mockIngestEntities.mockResolvedValue(undefined);

      await client.extractLogs('user');

      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith(
        'user',
        expect.objectContaining({ error: null })
      );
    });

    it('should fallback to logs-* when data view is not found', async () => {
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      const error = new Error('Data view not found');
      mockDataViewsService.get.mockRejectedValue(error);
      mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      expect(result.success && result.scannedIndices).toContain('logs-*');
      expect(!result.success && result.error).toBeFalsy();
    });

    it('should work with different entity types', async () => {
      const lastTimestamp = '2024-01-02T11:00:00.000Z';
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
        ],
        values: [[lastTimestamp, 'hash1']],
      };

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('host') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExtractSuccessSequence(mockEsqlResponse);
      mockIngestEntities.mockResolvedValue(undefined);

      await client.extractLogs('host');

      expect(mockEngineDescriptorClient.findOrThrow).toHaveBeenCalledWith('host');
      // probe, extraction, terminal empty probe, and its follow-up sweep extraction.
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(4);
      expect(mockIngestEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          targetIndex: expect.stringContaining('.entities.v2.latest.default'),
        })
      );
      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith(
        'host',
        expect.objectContaining({
          logExtractionState: expect.objectContaining({
            checkpointTimestamp: null,
            paginationId: null,
            lastExecutionTimestamp: expect.any(String),
          }),
        })
      );
    });

    it('should return success false when engine is not started', async () => {
      const descriptor = createMockEngineDescriptor('user');
      descriptor.status = 'stopped';

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        descriptor as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
      );

      const result = await client.extractLogs('user');

      expect(result.success).toBe(false);
      expect(!result.success && result.error.message).toContain(
        'Entity store is not started for type user'
      );
      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
      expect(mockIngestEntities).not.toHaveBeenCalled();
      expect(mockEngineDescriptorClient.update).not.toHaveBeenCalled();
    });

    describe('volume cap', () => {
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      const effectiveWindowEnd = '2025-01-15T11:59:00.000Z'; // now - 1m delay

      const setupVolCapTest = (overrides: {
        maxLogsPerWindow: number;
        maxLogsPerWindowCapBehavior?: 'defer' | 'drop';
      }) => {
        jest.useFakeTimers({ now: fixedNow.getTime() });
        const globalState = {
          logsExtraction: LogExtractionConfig.parse({
            lookbackPeriod: '3h',
            delay: '1m',
            maxTimeWindowSize: '999d',
            maxLogsPerWindow: overrides.maxLogsPerWindow,
            maxLogsPerWindowCapBehavior: overrides.maxLogsPerWindowCapBehavior ?? 'drop',
          }),
        } as EntityStoreGlobalState;
        setGlobalState(mockGlobalStateClient, globalState);
        mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
          createMockEngineDescriptor('user') as Awaited<
            ReturnType<EngineDescriptorClient['findOrThrow']>
          >
        );
        mockDataViewsService.get.mockResolvedValue({
          getIndexPattern: jest.fn().mockReturnValue('logs-*'),
        } as any);
      };

      afterEach(() => {
        jest.useRealTimers();
      });

      it('defer — stops early, preserves cursor, skips final logExtractionState clear', async () => {
        const mainExtractionResponse: ESQLSearchResponse = {
          columns: [
            { name: '@timestamp', type: 'date' },
            { name: HASHED_ID_FIELD, type: 'keyword' },
            { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2025-01-15T11:00:00.000Z', 'hash1', 'entity1'],
            ['2025-01-15T11:00:01.000Z', 'hash2', 'entity2'],
          ],
        };
        setupVolCapTest({ maxLogsPerWindow: 1, maxLogsPerWindowCapBehavior: 'defer' });
        mockExtractSuccessSequence(mainExtractionResponse, 1);
        mockIngestEntities.mockResolvedValue(undefined);

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.count).toBe(2);
        expect(result.logsCapApplied).toBe(true);
        // effectiveMaxLogsPerPage=1 → pickSampleProbability(1)=1 (too small for sampling to help,
        // falls back to an exact probe) → scaledProbeLimit(1, 1)=1 → LIMIT 1 → total_logs=1
        // (saturated, not last) → sliceLogCount=round(1 / 1)=1 (exact, no estimation). This
        // already meets maxLogsPerWindow=1, so the cap fires after slice 1.
        expect(result.logsProcessed).toBe(1);

        // Final engineDescriptorClient.update must NOT include logExtractionState —
        // the cursor is already persisted by the inner loop.
        expect(mockEngineDescriptorClient.update).toHaveBeenCalled();
        const finalUpdate = mockEngineDescriptorClient.update.mock.calls.at(-1)!;
        expect(finalUpdate[1]).not.toHaveProperty('logExtractionState');

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Deferring remaining logs')
        );
      });

      it('drop — advances cursor to effectiveWindowEnd and clears all cursor fields', async () => {
        const mainExtractionResponse: ESQLSearchResponse = {
          columns: [
            { name: '@timestamp', type: 'date' },
            { name: HASHED_ID_FIELD, type: 'keyword' },
            { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2025-01-15T11:00:00.000Z', 'hash1', 'entity1'],
            ['2025-01-15T11:00:01.000Z', 'hash2', 'entity2'],
          ],
        };
        setupVolCapTest({ maxLogsPerWindow: 1, maxLogsPerWindowCapBehavior: 'drop' });
        mockExtractSuccessSequence(mainExtractionResponse, 1);
        mockIngestEntities.mockResolvedValue(undefined);

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.count).toBe(2);
        expect(result.logsCapApplied).toBe(true);
        // effectiveMaxLogsPerPage=1 → pickSampleProbability(1)=1 (exact probe) →
        // scaledProbeLimit(1, 1)=1 → total_logs=1 (saturated) → sliceLogCount=round(1 / 1)=1,
        // which already meets maxLogsPerWindow=1.
        expect(result.logsProcessed).toBe(1);
        expect(result.lastSearchTimestamp).toBe(effectiveWindowEnd);

        const finalUpdate = mockEngineDescriptorClient.update.mock.calls.at(-1)!;
        expect(finalUpdate[1]).toHaveProperty('logExtractionState');
        expect(finalUpdate[1].logExtractionState).toMatchObject({
          checkpointTimestamp: null,
          paginationId: null,
          lastExecutionTimestamp: effectiveWindowEnd,
        });

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Dropping remaining logs')
        );
      });

      it('maxLogsPerWindow=0 disables the cap and processes all logs', async () => {
        const mainExtractionResponse: ESQLSearchResponse = {
          columns: [
            { name: '@timestamp', type: 'date' },
            { name: HASHED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2025-01-15T11:00:00.000Z', 'hash1'],
            ['2025-01-15T11:00:01.000Z', 'hash2'],
          ],
        };
        setupVolCapTest({ maxLogsPerWindow: 0 });
        mockExtractSuccessSequence(mainExtractionResponse);
        mockIngestEntities.mockResolvedValue(undefined);

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.count).toBe(2);
        expect(result.logsCapApplied).toBe(false);

        // Normal final update — no cap triggered, logExtractionState is cleared
        const finalUpdate = mockEngineDescriptorClient.update.mock.calls.at(-1)!;
        expect(finalUpdate[1]).toHaveProperty('logExtractionState');
        expect(finalUpdate[1].logExtractionState).toMatchObject({
          checkpointTimestamp: null,
          lastExecutionTimestamp: expect.any(String),
        });

        // No cap-related warnings
        const warnCalls = (mockLogger.warn as jest.Mock).mock.calls.map(([msg]) => msg);
        expect(warnCalls.some((m: string) => m.includes('volume cap'))).toBe(false);
      });

      it('specificWindow + defer — cap fires, lastSearchTimestamp is last page end, no engine update', async () => {
        const toDateISO = '2024-01-02T23:59:00.000Z';
        const lastPageTimestamp = '2024-01-02T11:00:00.000Z';
        const mainExtractionResponse: ESQLSearchResponse = {
          columns: [
            { name: '@timestamp', type: 'date' },
            { name: HASHED_ID_FIELD, type: 'keyword' },
            { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2024-01-02T10:00:00.000Z', 'hash1', 'entity1'],
            [lastPageTimestamp, 'hash2', 'entity2'],
          ],
        };
        setupVolCapTest({ maxLogsPerWindow: 1, maxLogsPerWindowCapBehavior: 'defer' });
        // effectiveMaxLogsPerPage=1 → pickSampleProbability(1)=1 (exact probe) →
        // scaledProbeLimit(1, 1)=1 → LIMIT 1 → total_logs=1 (saturates the scaled limit, so not
        // the last page) → sliceLogCount=round(1 / 1)=1, which already meets
        // maxLogsPerWindow=1, so the cap fires after the first slice — the terminal empty probe
        // below is never reached.
        mockExecuteEsqlQuery
          .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(lastPageTimestamp, 1))
          .mockResolvedValueOnce(mainExtractionResponse)
          .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty());
        mockIngestEntities.mockResolvedValue(undefined);

        const result = await client.extractLogs('user', {
          specificWindow: { fromDateISO: '2024-01-02T00:00:00.000Z', toDateISO },
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.logsCapApplied).toBe(true);
        expect(result.logsProcessed).toBe(1);
        // defer: lastSearchTimestamp is where the loop stopped, NOT the window end
        expect(result.lastSearchTimestamp).toBe(lastPageTimestamp);
        expect(result.lastSearchTimestamp).not.toBe(toDateISO);
        // specificWindow never touches engineDescriptorClient
        expect(mockEngineDescriptorClient.update).not.toHaveBeenCalled();
      });

      it('specificWindow + drop — cap fires, lastSearchTimestamp equals toDateISO, no engine update', async () => {
        const toDateISO = '2024-01-02T23:59:00.000Z';
        const mainExtractionResponse: ESQLSearchResponse = {
          columns: [
            { name: '@timestamp', type: 'date' },
            { name: HASHED_ID_FIELD, type: 'keyword' },
            { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2024-01-02T10:00:00.000Z', 'hash1', 'entity1'],
            ['2024-01-02T11:00:00.000Z', 'hash2', 'entity2'],
          ],
        };
        setupVolCapTest({ maxLogsPerWindow: 1, maxLogsPerWindowCapBehavior: 'drop' });
        mockExtractSuccessSequence(mainExtractionResponse, 1);
        mockIngestEntities.mockResolvedValue(undefined);

        const result = await client.extractLogs('user', {
          specificWindow: { fromDateISO: '2024-01-02T00:00:00.000Z', toDateISO },
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.logsCapApplied).toBe(true);
        // effectiveMaxLogsPerPage=1 → pickSampleProbability(1)=1 (exact probe) →
        // scaledProbeLimit(1, 1)=1 → total_logs=1 (saturated) → sliceLogCount=round(1 / 1)=1,
        // which already meets maxLogsPerWindow=1.
        expect(result.logsProcessed).toBe(1);
        // drop: lastSearchTimestamp is advanced to the window end
        expect(result.lastSearchTimestamp).toBe(toDateISO);
        expect(mockEngineDescriptorClient.update).not.toHaveBeenCalled();
      });
    });

    describe('stall detection', () => {
      // `isFirstRunInThisCycle=true` on the first outer-loop iteration always passes
      // `logsPageCursorStart=undefined` to the probe, so stall detection is inactive on iteration 1.
      // Stall can only fire from iteration 2 onward (once `isFirstRunInThisCycle` is cleared).
      // Tests therefore use two slice iterations: slice 1 advances `checkpointTimestamp`
      // via `advanceEngineStateAfterLogPageCompletes`, and slice 2 is the stall candidate.
      // After the stall, a terminal empty probe is reached (full-page count no longer signals
      // last page); a terminal empty probe is unified with the last-page path, so it still
      // triggers one more (swept) extraction call before the loop actually ends.

      const setupStallTest = () => {
        mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
          createMockEngineDescriptor('user') as Awaited<
            ReturnType<EngineDescriptorClient['findOrThrow']>
          >
        );
        mockDataViewsService.get.mockResolvedValue({
          getIndexPattern: jest.fn().mockReturnValue('logs-*'),
        } as any);
        mockIngestEntities.mockResolvedValue(undefined);
      };

      it('logs warn and bumps cursor by 1ms when timestamp unchanged and page is full', async () => {
        const stalledTs = '2024-01-02T10:00:00.000Z';
        const bumpedTs = moment(stalledTs).add(1, 'ms').toISOString();
        setupStallTest();

        // Slice 1: ends at stalledTs (full page → not last, loop continues).
        // Slice 2: same stalledTs + full page → stall fires, extraction skipped, cursor bumped.
        // Probe 3 (with bumpedTs): empty → unified with the last-page path, so the loop still
        // runs one more (swept) extraction over [bumpedTs, toDateISO] before ending.
        mockExecuteEsqlQuery
          .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(stalledTs)) // slice 1, not last
          .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 1
          .mockResolvedValueOnce(
            mockLogPaginationCursorProbeRow(stalledTs, LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT) // slice 2: stall fires, extraction skipped
          )
          .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty()) // probe 3 with bumpedTs → last page
          .mockResolvedValueOnce({ columns: [], values: [] }); // follow-up sweep extraction → loop ends

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        // The message names the concrete effective per-page limit, not the (unavailable in this
        // scope) raw config variable name.
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            `Log-slice probe stalled at ${stalledTs} with a saturated page; advancing cursor by 1ms. Docs sharing this timestamp beyond the configured per-page limit (${LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT}) will be dropped.`
          )
        );
        // After the stall bump, a later update persists checkpointTimestamp = bumpedTs.
        const updateCalls = (mockEngineDescriptorClient.update as jest.Mock).mock.calls;
        const persistedCheckpoints = updateCalls
          .map(([, patch]) => patch?.logExtractionState?.checkpointTimestamp)
          .filter((ts) => ts != null);
        expect(persistedCheckpoints).toContain(bumpedTs);
      });

      it('does not warn when timestamp advances between slices', async () => {
        const ts1 = '2024-01-02T10:00:00.000Z';
        const ts2 = '2024-01-02T10:00:01.000Z'; // different timestamp → no stall
        setupStallTest();

        // Slice 1 ends at ts1; slice 2 ends at ts2 (advances) → no stall.
        // Full page (total=max) → isLastLogsPage=false → loop continues; terminal empty probe
        // still triggers one more (swept) extraction before the loop ends.
        mockExecuteEsqlQuery
          .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(ts1)) // slice 1, not last
          .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 1
          .mockResolvedValueOnce(
            mockLogPaginationCursorProbeRow(ts2, LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT) // full page, different ts → not last
          )
          .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 2
          .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty()) // terminal probe → last page
          .mockResolvedValueOnce({ columns: [], values: [] }); // follow-up sweep extraction → loop ends

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('does not warn when page is partial even if timestamp unchanged', async () => {
        const stalledTs = '2024-01-02T10:00:00.000Z';
        setupStallTest();

        // Slice 1 ends at stalledTs. Slice 2: same ts but only 5 docs (partial) → no stall.
        mockExecuteEsqlQuery
          .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(stalledTs)) // slice 1, not last
          .mockResolvedValueOnce({ columns: [], values: [] })
          .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(stalledTs, 5)) // same ts, partial → no stall
          .mockResolvedValueOnce({ columns: [], values: [] });

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('does not warn on first iteration (isFirstRunInThisCycle always starts true)', async () => {
        // On the first outer-loop iteration logsPageCursorStart is forced to undefined,
        // so the stall guard is always inactive regardless of page size.
        setupStallTest();

        const someTs = '2024-01-02T10:00:00.000Z';
        // Full page (total=max → isLastLogsPage=false): loop continues; terminal empty probe
        // still triggers one more (swept) extraction before the loop ends.
        mockExecuteEsqlQuery
          .mockResolvedValueOnce(
            mockLogPaginationCursorProbeRow(someTs, LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT)
          )
          .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction
          .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty()) // terminal probe → last page
          .mockResolvedValueOnce({ columns: [], values: [] }); // follow-up sweep extraction → loop ends

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });
    });

    describe('sub-window cap', () => {
      // fixedNow = 12:00:00 ; delay = 1m → effectiveWindowEnd = 11:59:00.
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      const effectiveWindowEnd = '2025-01-15T11:59:00.000Z';

      const setupCapTest = (overrides: {
        lastExecutionTimestamp: string;
        maxTimeWindowSize: string;
      }) => {
        jest.useFakeTimers({ now: fixedNow.getTime() });
        const globalState = {
          logsExtraction: LogExtractionConfig.parse({
            lookbackPeriod: '3h',
            delay: '1m',
            maxTimeWindowSize: overrides.maxTimeWindowSize,
          }),
        } as EntityStoreGlobalState;
        setGlobalState(mockGlobalStateClient, globalState);
        mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
          createMockEngineDescriptor('user', {
            lastExecutionTimestamp: overrides.lastExecutionTimestamp,
          }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
        );
        mockDataViewsService.get.mockResolvedValue({
          getIndexPattern: jest.fn().mockReturnValue('logs-*'),
        } as any);
        mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());
      };

      afterEach(() => {
        jest.useRealTimers();
      });

      it('walks the time window in capped sub-windows when fromDateISO is far behind effectiveWindowEnd', async () => {
        // Window = effectiveWindowEnd - lastExec = 30m. cap=5m, grace=30s → 6 sub-windows
        // (final sub-window has width 5m which fits in cap+grace, so it is not capped).
        setupCapTest({
          lastExecutionTimestamp: '2025-01-15T11:29:00.000Z',
          maxTimeWindowSize: '5m',
        });

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        // 6 sub-windows × (1 probe + 1 follow-up sweep extraction) each. A terminal empty probe
        // is unified with the last-page path: it still runs `advanceEngineStateAfterLogPageCompletes`
        // and a swept extraction before that sub-window's inner loop ends, since a sampled probe
        // returning zero rows does not prove the real remainder is empty.
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(12);

        // 6 per-slice persistence calls (one per sub-window's inner loop) + 1 final cleanup call
        // at the end of extractLogs.
        expect(mockEngineDescriptorClient.update).toHaveBeenCalledTimes(7);
        expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith(
          'user',
          expect.objectContaining({
            logExtractionState: {
              checkpointTimestamp: null,
              paginationId: null,
              lastExecutionTimestamp: effectiveWindowEnd,
              sliceEndTimestamp: null,
            },
          })
        );
      });

      it('does not cap when fromDateISO is within maxTimeWindowSize + grace', async () => {
        // Window = 5m10s, cap=5m, grace=30s → 5m10s <= 5m30s, no cap. Single sub-window.
        setupCapTest({
          lastExecutionTimestamp: '2025-01-15T11:53:50.000Z',
          maxTimeWindowSize: '5m',
        });

        await client.extractLogs('user');

        // 1 probe + 1 follow-up sweep extraction (terminal empty probe unified with last-page path).
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
        // 1 per-slice persistence call (inner loop) + 1 final cleanup call.
        expect(mockEngineDescriptorClient.update).toHaveBeenCalledTimes(2);
        expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith(
          'user',
          expect.objectContaining({
            logExtractionState: expect.objectContaining({
              lastExecutionTimestamp: effectiveWindowEnd,
            }),
          })
        );
      });

      it('bypasses the sub-window cap when specificWindow is provided', async () => {
        const fromDate = '2024-01-01T00:00:00.000Z';
        const toDate = '2024-01-01T23:59:00.000Z'; // 24h, far exceeds the 5m default cap

        const globalState = {
          logsExtraction: LogExtractionConfig.parse({
            lookbackPeriod: '3h',
            delay: '1m',
            maxTimeWindowSize: '5m',
          }),
        } as EntityStoreGlobalState;
        setGlobalState(mockGlobalStateClient, globalState);
        mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
          createMockEngineDescriptor('user') as Awaited<
            ReturnType<EngineDescriptorClient['findOrThrow']>
          >
        );
        mockDataViewsService.get.mockResolvedValue({
          getIndexPattern: jest.fn().mockReturnValue('logs-*'),
        } as any);
        mockExecuteEsqlQuery.mockResolvedValue(mockLogPaginationCursorProbeEmpty());

        await client.extractLogs('user', {
          specificWindow: { fromDateISO: fromDate, toDateISO: toDate },
        });

        // A single probe over the full user-supplied window (no sub-window splitting), plus its
        // follow-up sweep extraction; specificWindow mode never persists to the engine descriptor.
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
        const probeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query;
        expect(probeQuery).toContain(fromDate);
        expect(probeQuery).toContain(toDate);
        // specificWindow runs do not touch the engine descriptor.
        expect(mockEngineDescriptorClient.update).not.toHaveBeenCalled();
      });

      it('passes monotonically advancing fromDateISO/toDateISO across sub-windows', async () => {
        // Window=15m, cap=5m, grace=30s → 3 sub-windows.
        setupCapTest({
          lastExecutionTimestamp: '2025-01-15T11:44:00.000Z',
          maxTimeWindowSize: '5m',
        });

        await client.extractLogs('user');

        // Each sub-window's terminal empty probe now also triggers a follow-up sweep extraction
        // (same bounds as the probe), so calls interleave as [probe, sweep] per sub-window —
        // index 0/2/4 are the probes, index 1/3/5 the sweeps.
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(6);

        const subWindow1 = mockExecuteEsqlQuery.mock.calls[0][0].query;
        expect(subWindow1).toContain('2025-01-15T11:44:00.000Z');
        expect(subWindow1).toContain('2025-01-15T11:49:00.000Z');

        const subWindow2 = mockExecuteEsqlQuery.mock.calls[2][0].query;
        expect(subWindow2).toContain('2025-01-15T11:49:00.000Z');
        expect(subWindow2).toContain('2025-01-15T11:54:00.000Z');

        const subWindow3 = mockExecuteEsqlQuery.mock.calls[4][0].query;
        expect(subWindow3).toContain('2025-01-15T11:54:00.000Z');
        expect(subWindow3).toContain(effectiveWindowEnd);
      });
    });
  });

  describe('getLocalAndRemoteIndexPatterns', () => {
    it('should split local and cluster-prefixed remote index patterns', async () => {
      const mockDataView = {
        getIndexPattern: jest
          .fn()
          .mockReturnValue('logs-*,remote_cluster:logs-*,metrics-*,other:filebeat-*'),
      };
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);

      const { localIndexPatterns, remoteIndexPatterns } =
        await client.getLocalAndRemoteIndexPatterns(['custom-index']);

      expect(localIndexPatterns).toContain('logs-*');
      expect(localIndexPatterns).toContain('metrics-*');
      expect(localIndexPatterns).toContain('custom-index');
      expect(localIndexPatterns).not.toContain('remote_cluster:logs-*');
      expect(localIndexPatterns).not.toContain('other:filebeat-*');

      expect(remoteIndexPatterns).toContain('remote_cluster:logs-*');
      expect(remoteIndexPatterns).toContain('other:filebeat-*');
      expect(remoteIndexPatterns).not.toContain('logs-*');
      expect(remoteIndexPatterns).not.toContain('metrics-*');
    });

    it('drops internal ES|QL view includes from local and remote pattern lists', async () => {
      const mockDataView = {
        getIndexPattern: jest
          .fn()
          .mockReturnValue(
            'logs-*,$.alert-actions,kayak-f86d55:$.rule-events,remote_cluster:logs-*'
          ),
      };
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);

      const { localIndexPatterns, remoteIndexPatterns } =
        await client.getLocalAndRemoteIndexPatterns();

      expect(localIndexPatterns).toContain('logs-*');
      expect(localIndexPatterns).not.toContain('$.alert-actions');
      expect(remoteIndexPatterns).toContain('remote_cluster:logs-*');
      expect(remoteIndexPatterns).not.toContain('kayak-f86d55:$.rule-events');
    });

    it('should exclude alerts index from both local and remote', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*,.alerts-security.alerts-default'),
      };
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);

      const { localIndexPatterns, remoteIndexPatterns } =
        await client.getLocalAndRemoteIndexPatterns();

      expect(localIndexPatterns).not.toContain('.alerts-security.alerts-default');
      expect(remoteIndexPatterns).not.toContain('.alerts-security.alerts-default');
    });

    it('adds an excluded pattern to localIndexPatterns', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*,metrics-*'),
      };
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);

      const { localIndexPatterns, remoteIndexPatterns } =
        await client.getLocalAndRemoteIndexPatterns([], ['logs-proxy-*', 'metrics-debug']);

      expect(localIndexPatterns).toContain('-logs-proxy-*');
      expect(localIndexPatterns).toContain('-metrics-debug');
      expect(remoteIndexPatterns).not.toContain('-logs-proxy-*');
    });

    it('adds an excluded pattern to remoteIndexPatterns', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('remote_cluster:logs-*'),
      };
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);

      const { localIndexPatterns, remoteIndexPatterns } =
        await client.getLocalAndRemoteIndexPatterns([], ['remote_cluster:logs-proxy-*']);

      expect(remoteIndexPatterns).toContain('-remote_cluster:logs-proxy-*');
      expect(localIndexPatterns).not.toContain('-remote_cluster:logs-proxy-*');
    });

    it('adds an excluded pattern after the included ones', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);

      const { localIndexPatterns } = await client.getLocalAndRemoteIndexPatterns(
        [],
        ['logs-proxy-*']
      );

      const includeIdx = localIndexPatterns.indexOf('logs-*');
      const excludeIdx = localIndexPatterns.indexOf('-logs-proxy-*');
      expect(includeIdx).toBeGreaterThanOrEqual(0);
      expect(excludeIdx).toBeGreaterThan(includeIdx);
    });
  });

  describe('getLocalIndexPatterns', () => {
    it('forwards excludedIndexPatterns and includes local negations only', async () => {
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*,remote_cluster:logs-*'),
      };
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);

      const indexPatterns = await client.getLocalIndexPatterns(
        [],
        ['logs-proxy-*', 'remote_cluster:logs-debug-*']
      );

      expect(indexPatterns).toContain('-logs-proxy-*');
      // Cluster-prefixed excludes are routed to remote and not returned here
      expect(indexPatterns).not.toContain('-remote_cluster:logs-debug-*');
      // remote includes are also not returned
      expect(indexPatterns).not.toContain('remote_cluster:logs-*');
      // View exclusions are query-only (`*:-\$.*` is not a privilege target)
      expect(indexPatterns).not.toContain('*:-$.*');
    });
  });

  describe('updateConfig', () => {
    it('should merge provided params over current config and persist via globalStateClient', async () => {
      await client.updateConfig({ delay: '5m' });

      expect(mockGlobalStateClient.update).toHaveBeenCalledWith({
        logsExtraction: expect.objectContaining({ delay: '5m' }),
      });
    });

    it('should return the merged config', async () => {
      const result = await client.updateConfig({ delay: '5m', frequency: '2m' });

      expect(result.delay).toBe('5m');
      expect(result.frequency).toBe('2m');
    });

    it('should preserve existing config values not present in params', async () => {
      // createMockGlobalStateClient sets lookbackPeriod to '3h'
      const result = await client.updateConfig({ delay: '5m' });

      expect(result.lookbackPeriod).toBe('3h');
    });

    it('should apply defaults for any config fields absent from both params and current state', async () => {
      // logsExtraction from mock has all fields set via LogExtractionConfig.parse
      // providing no params should keep the full config intact
      const result = await client.updateConfig({});

      expect(result.delay).toBe('1m');
      expect(result.lookbackPeriod).toBe('3h');
      expect(result.docsLimit).toBe(10000);
    });

    it('should update multiple fields at once', async () => {
      const result = await client.updateConfig({
        additionalIndexPatterns: ['custom-logs-*'],
        lookbackPeriod: '6h',
        delay: '30s',
        frequency: '1m',
        docsLimit: 5000,
        fieldHistoryLength: 5,
      });

      expect(result.additionalIndexPatterns).toEqual(['custom-logs-*']);
      expect(result.lookbackPeriod).toBe('6h');
      expect(result.delay).toBe('30s');
      expect(result.frequency).toBe('1m');
      expect(result.docsLimit).toBe(5000);
      expect(result.fieldHistoryLength).toBe(5);
    });

    it('should throw when global state is not found', async () => {
      const notFoundError = new Error('No global state found for this namespace');
      mockGlobalStateClient.update.mockRejectedValue(notFoundError);

      await expect(client.updateConfig({ delay: '5m' })).rejects.toThrow(
        'No global state found for this namespace'
      );
    });
  });
});

describe('LogsExtractionClient mid-slice resume', () => {
  const fixedNow = new Date('2025-01-15T12:00:00.000Z');
  const checkpointTimestamp = '2025-01-15T10:00:00.000Z';
  const sliceEndTimestamp = '2025-01-15T10:05:00.000Z';

  /** A probe query aggregates MAX(@timestamp); an extraction query joins the latest index. */
  const isProbeQuery = (query: string) => query.includes('MAX(@timestamp)');
  const isExtractionQuery = (query: string) => query.includes('LOOKUP JOIN');

  const extractionColumns: ESQLSearchResponse['columns'] = [
    { name: '@timestamp', type: 'date' },
    { name: HASHED_ID_FIELD, type: 'keyword' },
    { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
  ];

  let ctx: TestContext;

  const setup = (globalStateOverrides?: GlobalStateLogExtractionOverrides) => {
    ctx = createTestContext(globalStateOverrides);
    ctx.mockDataViewsService.get.mockResolvedValue({
      getIndexPattern: jest.fn().mockReturnValue('logs-*'),
    } as any);
    mockIngestEntities.mockResolvedValue(undefined);
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: fixedNow.getTime() });
    setup();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resumes with the pinned slice end and id cursor, skipping the boundary probe', async () => {
    ctx.mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user', {
        checkpointTimestamp,
        paginationId: 'entity-cursor',
        sliceEndTimestamp,
      }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
    );
    mockExecuteEsqlQuery
      // resumed slice: extraction directly, no probe (1 row < docsLimit → slice done)
      .mockResolvedValueOnce({
        columns: extractionColumns,
        values: [['2025-01-15T10:02:00.000Z', 'hash3', 'entity3']],
      })
      // probe for the next slice: empty (sampled → follow-up sweep extraction)
      .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty())
      .mockResolvedValueOnce({ columns: [], values: [] });

    const result = await ctx.client.extractLogs('user');

    expect(result.success).toBe(true);
    const queries = mockExecuteEsqlQuery.mock.calls.map(([{ query }]) => query);
    // First query re-enters the slice: an extraction bounded by the persisted slice end,
    // paginating past the persisted id cursor; the probe is not re-run for this slice.
    expect(isExtractionQuery(queries[0])).toBe(true);
    expect(queries[0]).toContain(`@timestamp <= TO_DATETIME("${sliceEndTimestamp}")`);
    expect(queries[0]).toContain('> "entity-cursor"');
    expect(isProbeQuery(queries[1])).toBe(true);
    expect(ctx.mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Resuming mid-slice'));
  });

  it('discards an id cursor persisted without a pinned slice end and re-processes the slice', async () => {
    ctx.mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user', {
        checkpointTimestamp,
        paginationId: 'stale-cursor',
      }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
    );
    mockExtractSuccessSequence({ columns: extractionColumns, values: [] });

    const result = await ctx.client.extractLogs('user');

    expect(result.success).toBe(true);
    const queries = mockExecuteEsqlQuery.mock.calls.map(([{ query }]) => query);
    // Without a pinned slice end the cursor is discarded: probe-first flow from the checkpoint.
    expect(isProbeQuery(queries[0])).toBe(true);
    expect(queries[0]).toContain(checkpointTimestamp);
    expect(queries.every((q) => !q.includes('stale-cursor'))).toBe(true);
    expect(ctx.mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('without a pinned slice end')
    );
  });

  it('persists the id cursor and pinned slice end mid-slice, leaving the checkpoint at the slice start', async () => {
    // docsLimit=2 so a full 2-row page saturates the limit and produces an entity cursor.
    setup({ docsLimit: 2 });
    ctx.mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user', {
        checkpointTimestamp,
      }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
    );
    mockExecuteEsqlQuery
      // probe: saturated slice ending at sliceEndTimestamp (more slices may follow)
      .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(sliceEndTimestamp))
      // entity page 1: 2 rows == docsLimit → pagination continues
      .mockResolvedValueOnce({
        columns: extractionColumns,
        values: [
          ['2025-01-15T10:01:00.000Z', 'hash1', 'entity1'],
          ['2025-01-15T10:02:00.000Z', 'hash2', 'entity2'],
        ],
      })
      // entity page 2: empty → slice done
      .mockResolvedValueOnce({ columns: extractionColumns, values: [] })
      // probe for next slice: empty → sweep extraction → done
      .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty())
      .mockResolvedValueOnce({ columns: extractionColumns, values: [] });

    const result = await ctx.client.extractLogs('user');

    expect(result.success).toBe(true);
    const stateUpdates = ctx.mockEngineDescriptorClient.update.mock.calls
      .map(([, update]) => update.logExtractionState)
      .filter(Boolean);
    // Mid-slice persist: id cursor + pinned end, checkpoint untouched at the slice start.
    expect(stateUpdates[0]).toMatchObject({
      checkpointTimestamp,
      paginationId: 'entity2',
      sliceEndTimestamp,
    });
    // Slice completion: checkpoint advances to the slice end, both cursors cleared.
    expect(stateUpdates[1]).toMatchObject({
      checkpointTimestamp: sliceEndTimestamp,
      paginationId: null,
      sliceEndTimestamp: null,
    });
  });

  it('pins the window start as the checkpoint on a first-ever cycle so the resume lower bound cannot drift', async () => {
    setup({ docsLimit: 2 });
    // Fresh engine: no checkpoint and no lastExecutionTimestamp, so the window start falls back
    // to now - lookbackPeriod (09:00 at the frozen clock) - a value that moves between runs.
    ctx.mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user') as Awaited<
        ReturnType<EngineDescriptorClient['findOrThrow']>
      >
    );
    const lookbackStartAtRun1 = '2025-01-15T09:00:00.000Z';

    // Run 1: probe pins the slice end, page 1 persists the cursor, the run dies on page 2.
    mockExecuteEsqlQuery
      .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(sliceEndTimestamp))
      .mockResolvedValueOnce({
        columns: extractionColumns,
        values: [
          ['2025-01-15T09:01:00.000Z', 'hash1', 'entity1'],
          ['2025-01-15T09:02:00.000Z', 'hash2', 'entity2'],
        ],
      })
      .mockRejectedValueOnce(new Error('crash mid-slice on first-ever cycle'));

    const run1 = await ctx.client.extractLogs('user');
    expect(run1.success).toBe(false);

    const persistedState = ctx.mockEngineDescriptorClient.update.mock.calls
      .map(([, update]) => update.logExtractionState)
      .filter((s) => s?.paginationId)
      .at(-1)!;
    // The slice start is pinned even though the engine state held no checkpoint.
    expect(persistedState.checkpointTimestamp).toBe(lookbackStartAtRun1);

    // Advance the clock: a re-derived now - lookbackPeriod would now be 09:02, not 09:00.
    jest.setSystemTime(new Date('2025-01-15T12:02:00.000Z'));

    // Run 2 resumes from the persisted state.
    ctx.mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user', {
        checkpointTimestamp: persistedState.checkpointTimestamp!,
        paginationId: persistedState.paginationId!,
        sliceEndTimestamp: persistedState.sliceEndTimestamp!,
      }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
    );
    mockExecuteEsqlQuery
      .mockResolvedValueOnce({ columns: extractionColumns, values: [] })
      .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty())
      .mockResolvedValueOnce({ columns: extractionColumns, values: [] });

    const run2 = await ctx.client.extractLogs('user');
    expect(run2.success).toBe(true);

    // The resumed slice re-runs with run 1's exact bounds: the pinned start, not the drifted one.
    const run2FirstQuery = mockExecuteEsqlQuery.mock.calls.at(-3)![0].query;
    expect(isExtractionQuery(run2FirstQuery)).toBe(true);
    expect(run2FirstQuery).toContain(`@timestamp >= TO_DATETIME("${lookbackStartAtRun1}")`);
    expect(run2FirstQuery).toContain(`@timestamp <= TO_DATETIME("${sliceEndTimestamp}")`);
  });

  it.each(['user', 'host', 'service', 'generic'] as const)(
    'resume determinism for %s: no entity skipped or duplicated across an interrupted run and its resume',
    async (entityType) => {
      setup({ docsLimit: 2 });
      ctx.mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor(entityType, {
          checkpointTimestamp,
        }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
      );

      const ingestedIds: string[] = [];
      mockIngestEntities.mockImplementation(async ({ esqlResponse }) => {
        const idIdx = esqlResponse.columns.findIndex(
          ({ name }) => name === ENGINE_METADATA_UNTYPED_ID_FIELD
        );
        esqlResponse.values.forEach((row) => {
          if (row[idIdx]) {
            ingestedIds.push(String(row[idIdx]));
          }
        });
      });

      // Run 1: probe pins the slice end, page 1 ingests entity1+entity2 and persists the
      // cursor, then the run dies mid-slice on the page-2 query.
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(sliceEndTimestamp))
        .mockResolvedValueOnce({
          columns: extractionColumns,
          values: [
            ['2025-01-15T10:01:00.000Z', 'hash1', 'entity1'],
            ['2025-01-15T10:02:00.000Z', 'hash2', 'entity2'],
          ],
        })
        .mockRejectedValueOnce(new Error('node restarted mid-slice'));

      const run1 = await ctx.client.extractLogs(entityType);
      expect(run1.success).toBe(false);

      // The state a real deployment would resume from: the last persisted mid-slice cursor.
      const persistedState = ctx.mockEngineDescriptorClient.update.mock.calls
        .map(([, update]) => update.logExtractionState)
        .filter((s) => s?.paginationId)
        .at(-1)!;
      expect(persistedState).toMatchObject({
        checkpointTimestamp,
        paginationId: 'entity2',
        sliceEndTimestamp,
      });

      // Run 2: resumes the same slice from the persisted cursor.
      ctx.mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor(entityType, {
          checkpointTimestamp: persistedState.checkpointTimestamp ?? undefined,
          paginationId: persistedState.paginationId!,
          sliceEndTimestamp: persistedState.sliceEndTimestamp!,
        }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
      );
      mockExecuteEsqlQuery
        // resumed slice: remaining page (1 row < docsLimit → slice done)
        .mockResolvedValueOnce({
          columns: extractionColumns,
          values: [['2025-01-15T10:03:00.000Z', 'hash3', 'entity3']],
        })
        .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty())
        .mockResolvedValueOnce({ columns: extractionColumns, values: [] });

      const run2 = await ctx.client.extractLogs(entityType);
      expect(run2.success).toBe(true);

      // The resumed extraction reuses the pinned bounds and pages past the persisted cursor.
      const run2FirstQuery = mockExecuteEsqlQuery.mock.calls.at(-3)![0].query;
      expect(isExtractionQuery(run2FirstQuery)).toBe(true);
      expect(run2FirstQuery).toContain(`@timestamp <= TO_DATETIME("${sliceEndTimestamp}")`);
      expect(run2FirstQuery).toContain('> "entity2"');

      // The union across both runs covers every entity exactly once: no skips, no duplicates.
      expect(ingestedIds).toEqual(['entity1', 'entity2', 'entity3']);
    }
  );
});

describe('LogsExtractionClient extraction mode cursor routing', () => {
  const fixedNow = new Date('2025-01-15T12:00:00.000Z');

  const extractionColumns: ESQLSearchResponse['columns'] = [
    { name: '@timestamp', type: 'date' },
    { name: HASHED_ID_FIELD, type: 'keyword' },
    { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
  ];

  function createContextWithMode(mode: 'single' | 'priority' | 'nonPriority') {
    jest.clearAllMocks();
    mockExecuteEsqlQuery.mockReset();
    mockIngestEntities.mockReset();

    const mockLogger = loggerMock.create();
    const mockEsClient = {
      indices: {
        resolveIndex: jest.fn().mockResolvedValue({ indices: [], aliases: [], data_streams: [] }),
      },
    } as unknown as jest.Mocked<ElasticsearchClient>;
    const mockDataViewsService = {
      get: jest.fn().mockResolvedValue({ getIndexPattern: jest.fn().mockReturnValue('logs-*') }),
    } as unknown as jest.Mocked<DataViewsService>;
    const mockEngineDescriptorClient: jest.Mocked<
      Pick<EngineDescriptorClient, 'findOrThrow' | 'update'>
    > = {
      findOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    const mockGlobalStateClient = createMockGlobalStateClient();

    const client = new LogsExtractionClient({
      logger: mockLogger,
      namespace: 'default',
      esClient: mockEsClient,
      dataViewsService: mockDataViewsService,
      engineDescriptorClient: mockEngineDescriptorClient as unknown as EngineDescriptorClient,
      globalStateClient: mockGlobalStateClient as unknown as EntityStoreGlobalStateClient,
      extractionMode: mode,
    });

    return { client, mockEngineDescriptorClient, mockDataViewsService };
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: fixedNow.getTime() });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('nonPriority mode writes nonPriorityLogExtractionState on mid-run and end-of-run persists', async () => {
    const { client, mockEngineDescriptorClient } = createContextWithMode('nonPriority');
    mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user') as Awaited<
        ReturnType<EngineDescriptorClient['findOrThrow']>
      >
    );
    mockIngestEntities.mockResolvedValue(undefined);
    // probe → extraction (1 row, non-final) → empty probe (end of window) → sweep
    mockExecuteEsqlQuery
      .mockResolvedValueOnce(mockLogPaginationCursorProbeRow('2025-01-15T11:00:00.000Z'))
      .mockResolvedValueOnce({
        columns: extractionColumns,
        values: [['2025-01-15T10:30:00.000Z', 'hash1', 'entity1']],
      })
      .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty())
      .mockResolvedValueOnce({ columns: extractionColumns, values: [] });

    await client.extractLogs('user');

    const updateCalls = mockEngineDescriptorClient.update.mock.calls.map(([, update]) => update);
    // Every update must use nonPriorityLogExtractionState, never logExtractionState.
    expect(updateCalls.every((u) => !('logExtractionState' in u))).toBe(true);
    expect(updateCalls.some((u) => 'nonPriorityLogExtractionState' in u)).toBe(true);
  });

  it('single mode writes logExtractionState — regression guard for the default path', async () => {
    const { client, mockEngineDescriptorClient } = createContextWithMode('single');
    mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user') as Awaited<
        ReturnType<EngineDescriptorClient['findOrThrow']>
      >
    );
    mockIngestEntities.mockResolvedValue(undefined);
    mockExtractSuccessSequence({ columns: extractionColumns, values: [] });

    await client.extractLogs('user');

    const updateCalls = mockEngineDescriptorClient.update.mock.calls.map(([, update]) => update);
    expect(updateCalls.every((u) => !('nonPriorityLogExtractionState' in u))).toBe(true);
  });

  it('priority mode writes logExtractionState and resumes from the existing checkpoint', async () => {
    const { client, mockEngineDescriptorClient } = createContextWithMode('priority');
    const existingCheckpoint = '2025-01-15T11:30:00.000Z';
    mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user', {
        checkpointTimestamp: existingCheckpoint,
        lastExecutionTimestamp: existingCheckpoint,
      }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
    );
    mockIngestEntities.mockResolvedValue(undefined);
    mockExtractSuccessSequence({ columns: extractionColumns, values: [] });

    await client.extractLogs('user');

    const updateCalls = mockEngineDescriptorClient.update.mock.calls.map(([, update]) => update);
    // priority shares logExtractionState with single — never touches nonPriorityLogExtractionState.
    expect(updateCalls.every((u) => !('nonPriorityLogExtractionState' in u))).toBe(true);
    expect(updateCalls.some((u) => 'logExtractionState' in u)).toBe(true);
    // The first ES|QL query starts from the existing checkpoint, not from lookbackPeriod.
    const firstQuery = mockExecuteEsqlQuery.mock.calls[0][0].query;
    expect(firstQuery).toContain(existingCheckpoint);
  });

  it('nonPriority with a live logExtractionState checkpoint starts from lookbackPeriod, not from the priority cursor', async () => {
    // The priority process has a live checkpoint; the non-priority cursor is absent (null).
    // The non-priority client must not read the priority cursor — it starts fresh.
    const { client, mockEngineDescriptorClient } = createContextWithMode('nonPriority');
    const priorityCheckpoint = '2025-01-14T00:00:00.000Z'; // 36 hours ago — outside lookback
    mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
      createMockEngineDescriptor('user', {
        checkpointTimestamp: priorityCheckpoint,
        lastExecutionTimestamp: priorityCheckpoint,
        // nonPriorityLogExtractionState absent → null default → fresh start
      }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
    );
    mockIngestEntities.mockResolvedValue(undefined);
    mockExtractSuccessSequence({ columns: extractionColumns, values: [] });

    await client.extractLogs('user');

    // The first query should probe from lookbackPeriod (3h back from fixedNow = 09:00),
    // not from the priority cursor 36 hours ago.
    const firstQuery = mockExecuteEsqlQuery.mock.calls[0][0].query;
    expect(firstQuery).not.toContain(priorityCheckpoint);
    expect(firstQuery).toContain('2025-01-15T09:00:00.000Z');
  });
});
