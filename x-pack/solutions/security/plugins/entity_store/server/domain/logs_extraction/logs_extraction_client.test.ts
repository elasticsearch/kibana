/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LogsExtractionClient } from './logs_extraction_client';
import type { RemoteExtractionStrategy } from './remote/strategies';
import type { RemoteLogsExtractionClient } from './remote';
import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { DataViewsService } from '@kbn/data-views-plugin/common';
import type { ESQLSearchResponse } from '@kbn/es-types';
import moment from 'moment';
import { executeEsqlQuery } from '../../infra/elasticsearch/esql';
import { ingestEntities } from '../../infra/elasticsearch/ingest';
import { HASHED_ID_FIELD } from './logs_extraction_query_builder';
import {
  ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
  ENGINE_METADATA_UNTYPED_ID_FIELD,
  TIMESTAMP_FIELD,
} from './query_builder_commons';
import { LOG_PAGINATION_CURSOR_TOTAL_LOGS_FIELD } from './log_pagination_probe_query_builder';

const LOG_PAGINATION_CURSOR_PROBE_COLUMNS: ESQLSearchResponse['columns'] = [
  { name: TIMESTAMP_FIELD, type: 'date' },
  { name: LOG_PAGINATION_CURSOR_TOTAL_LOGS_FIELD, type: 'long' },
];

/** Default total_logs = maxLogsPerPage so interpret marks a non-final slice (full page → more may follow). */
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

/** First slice + extraction + terminal empty log pagination cursor probe (end of window). */
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
    .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty());
}
import {
  LogExtractionConfig,
  LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT,
  type EngineDescriptorClient,
  type EntityStoreGlobalState,
  type EntityStoreGlobalStateClient,
} from '../saved_objects';
import { ENGINE_STATUS } from '../constants';
import type { EntityType } from '../../../common/domain/definitions/entity_schema';

type MockRemoteLogsExtractionClient = jest.Mocked<
  Pick<RemoteLogsExtractionClient, 'extractToUpdates'>
> & {
  strategy: Pick<RemoteExtractionStrategy, 'id' | 'buildPatterns'>;
};

function createMockRemoteLogsExtractionClient(): MockRemoteLogsExtractionClient {
  return {
    extractToUpdates: jest.fn().mockResolvedValue({ count: 0, pages: 0 }),
    strategy: {
      id: 'ccs',
      buildPatterns: jest.fn(({ remoteIndexPatterns }) => remoteIndexPatterns),
    },
  };
}

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
  }>
) {
  const logExtractionState = {
    checkpointTimestamp: overrides?.checkpointTimestamp ?? null,
    paginationId: overrides?.paginationId ?? null,
    lastExecutionTimestamp: overrides?.lastExecutionTimestamp ?? null,
  };
  return {
    type,
    status: ENGINE_STATUS.STARTED,
    logExtractionState,
    versionState: { version: 2, state: 'running' as const, isMigratedFromV1: false },
  };
}

function createMockGlobalStateClient(
  logExtractionOverrides?: Partial<{
    lookbackPeriod: string;
    delay: string;
    maxTimeWindowSize: string;
    maxLogsPerWindow: number;
    excludedIndexPatterns: string[];
    additionalIndexPatterns: string[];
  }>
): jest.Mocked<Pick<EntityStoreGlobalStateClient, 'find' | 'findOrThrow' | 'update'>> {
  const logsExtraction = LogExtractionConfig.parse({
    docsLimit: 10000,
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
    update: jest.fn().mockResolvedValue({}),
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
  let mockRemoteLogsExtractionClient: ReturnType<typeof createMockRemoteLogsExtractionClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks does NOT drain mockResolvedValueOnce queues — only mockReset does.
    // Cap tests consume fewer queued calls than were set up (cap fires early), leaving stale
    // Once values that would otherwise pollute the next test.
    mockExecuteEsqlQuery.mockReset();
    mockIngestEntities.mockReset();

    mockLogger = loggerMock.create();
    mockEsClient = {} as jest.Mocked<ElasticsearchClient>;
    mockDataViewsService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<DataViewsService>;
    mockEngineDescriptorClient = {
      findOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    mockGlobalStateClient = createMockGlobalStateClient();
    mockRemoteLogsExtractionClient = createMockRemoteLogsExtractionClient();

    client = new LogsExtractionClient({
      logger: mockLogger,
      namespace: 'default',
      esClient: mockEsClient,
      dataViewsService: mockDataViewsService,
      engineDescriptorClient: mockEngineDescriptorClient as unknown as EngineDescriptorClient,
      globalStateClient: mockGlobalStateClient as unknown as EntityStoreGlobalStateClient,
      remoteLogsExtractionClient:
        mockRemoteLogsExtractionClient as unknown as RemoteLogsExtractionClient,
    });
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
      expect(result.success && result.scannedIndices).toContain(
        '.entities.v2.updates.security_default'
      );
      expect(result.success && result.scannedIndices).not.toContain(
        '.alerts-security.alerts-default'
      );

      expect(mockEngineDescriptorClient.findOrThrow).toHaveBeenCalledWith('user');
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.any(String),
      });

      expect(mockIngestEntities).toHaveBeenCalledTimes(1);
      expect(mockIngestEntities).toHaveBeenCalledWith({
        esClient: mockEsClient,
        esqlResponse: mockEsqlResponse,
        esIdField: HASHED_ID_FIELD,
        fieldsToIgnore: [ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD],
        targetIndex: expect.stringContaining('.entities.v2.latest.security_default'),
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
        remoteLogsExtractionClient:
          mockRemoteLogsExtractionClient as unknown as RemoteLogsExtractionClient,
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

      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
      expect(mockIngestEntities).toHaveBeenCalledTimes(0);
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
      mockGlobalStateClient.find.mockResolvedValue(globalStateWithDelay5s);
      mockGlobalStateClient.findOrThrow.mockResolvedValue(globalStateWithDelay5s);
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

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(expectedFrom),
      });
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(expectedTo),
      });

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
      mockGlobalStateClient.find.mockResolvedValue(globalStateWithDelay5s);
      mockGlobalStateClient.findOrThrow.mockResolvedValue(globalStateWithDelay5s);
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
      mockGlobalStateClient.find.mockResolvedValue(globalStateWithDelay5s);
      mockGlobalStateClient.findOrThrow.mockResolvedValue(globalStateWithDelay5s);
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

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(checkpointTimestamp),
      });
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(expectedTo),
      });

      jest.useRealTimers();
    });

    it('should preserve inclusive lower bound on first bounded extraction when recovering from paginationId', async () => {
      const fromDateISO = '2025-01-15T10:00:00.000Z';
      const toDateISO = '2025-01-15T11:00:00.000Z';
      const recoveryId = 'recover-entity-id';
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user', {
          paginationId: recoveryId,
        }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(
          mockLogPaginationCursorProbeRow(fromDateISO, 1 /* single doc — last page */)
        )
        .mockResolvedValueOnce({ columns: [], values: [] });
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user', {
        specificWindow: { fromDateISO, toDateISO },
      });

      expect(result.success).toBe(true);
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);

      const probeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query;
      const boundedQuery = mockExecuteEsqlQuery.mock.calls[1][0].query;
      expect(probeQuery).toContain(`@timestamp >= TO_DATETIME("${fromDateISO}")`);
      expect(boundedQuery).toContain(`@timestamp >= TO_DATETIME("${fromDateISO}")`);
    });

    it('on recovery, first boundary probe uses checkpointTimestamp as the window start', async () => {
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      jest.useFakeTimers({ now: fixedNow.getTime() });
      const checkpointTimestamp = '2025-01-15T10:00:00.000Z';
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };
      const mainExtractionResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
        ],
        values: [],
      };
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user', {
          lookbackPeriod: '3h',
          delay: '1m',
          checkpointTimestamp,
          paginationId: 'entity-cursor',
          lastExecutionTimestamp: '2025-01-15T10:00:00.000Z',
        }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExtractSuccessSequence(mainExtractionResponse);
      mockIngestEntities.mockResolvedValue(undefined);

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);
      const firstProbeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query;
      expect(firstProbeQuery).toContain(checkpointTimestamp);
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

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(fromDate),
      });
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(toDate),
      });
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
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);
      expect(mockIngestEntities).toHaveBeenCalledTimes(1);
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

    it('should filter remote index patterns from the main query and run remote extraction in parallel', async () => {
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
      // Main path uses local patterns only; remote client runs in parallel via strategy.buildPatterns.
      expect(result.success && result.scannedIndices).toContain('logs-*');
      expect(result.success && result.scannedIndices).toContain('metrics-*');
      expect(result.success && result.scannedIndices).toContain('remote_cluster:logs-*');
      expect(result.success && result.scannedIndices).toContain('other:filebeat-*');
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);
      expect(mockRemoteLogsExtractionClient.strategy.buildPatterns).toHaveBeenCalledWith(
        expect.objectContaining({
          localIndexPatterns: expect.arrayContaining(['logs-*', 'metrics-*']),
          remoteIndexPatterns: ['remote_cluster:logs-*', 'other:filebeat-*'],
        })
      );
      expect(mockRemoteLogsExtractionClient.extractToUpdates).toHaveBeenCalledTimes(1);
      expect(mockRemoteLogsExtractionClient.extractToUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user',
          remoteIndexPatterns: ['remote_cluster:logs-*', 'other:filebeat-*'],
        })
      );
    });

    it('should store remote errors in the saved object while main execution remains unchanged', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: HASHED_ID_FIELD, type: 'keyword' },
          { name: 'entity.id', type: 'keyword' },
        ],
        values: [['2024-01-02T10:00:00.000Z', 'hash1', 'user:u1']],
      };

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*,remote_cluster:logs-*'),
      };

      const remoteError = new Error('remote connection failed');
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExtractSuccessSequence(mockEsqlResponse);
      mockIngestEntities.mockResolvedValue(undefined);
      mockRemoteLogsExtractionClient.extractToUpdates.mockResolvedValue({
        count: 0,
        pages: 0,
        error: remoteError,
      });

      const result = await client.extractLogs('user');

      expect(result.success).toBe(true);
      expect(result.success && result.count).toBe(1);
      expect(result.success && result.scannedIndices).toContain('logs-*');
      expect(result.success && result.scannedIndices).toContain('remote_cluster:logs-*');
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);
      expect(mockIngestEntities).toHaveBeenCalledTimes(1);

      // Remote error is stored in the saved object alongside the cleared log extraction state.
      expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith(
        'user',
        expect.objectContaining({
          logExtractionState: expect.objectContaining({
            checkpointTimestamp: null,
            paginationId: null,
            lastExecutionTimestamp: expect.any(String),
          }),
          error: { message: remoteError.message, action: 'extractLogs' },
        })
      );
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
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);
      expect(mockIngestEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          targetIndex: expect.stringContaining('.entities.v2.latest.security_default'),
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
        mockGlobalStateClient.find.mockResolvedValue(globalState);
        mockGlobalStateClient.findOrThrow.mockResolvedValue(globalState);
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
            { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
            { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2025-01-15T11:00:00.000Z', 'hash1', '2025-01-15T11:00:00.000Z', 'entity1'],
            ['2025-01-15T11:00:01.000Z', 'hash2', '2025-01-15T11:00:01.000Z', 'entity2'],
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
            { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
            { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2025-01-15T11:00:00.000Z', 'hash1', '2025-01-15T11:00:00.000Z', 'entity1'],
            ['2025-01-15T11:00:01.000Z', 'hash2', '2025-01-15T11:00:01.000Z', 'entity2'],
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
            { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
            { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2024-01-02T10:00:00.000Z', 'hash1', '2024-01-02T10:00:00.000Z', 'entity1'],
            [lastPageTimestamp, 'hash2', lastPageTimestamp, 'entity2'],
          ],
        };
        setupVolCapTest({ maxLogsPerWindow: 1, maxLogsPerWindowCapBehavior: 'defer' });
        // effectiveMaxLogsPerPage=1 → LIMIT 1 → total_logs=1 → sliceLogCount=1
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
            { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
            { name: ENGINE_METADATA_UNTYPED_ID_FIELD, type: 'keyword' },
          ],
          values: [
            ['2024-01-02T10:00:00.000Z', 'hash1', '2024-01-02T10:00:00.000Z', 'entity1'],
            ['2024-01-02T11:00:00.000Z', 'hash2', '2024-01-02T11:00:00.000Z', 'entity2'],
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
      // After the stall, a terminal empty probe ends the loop (full-page count no longer signals last page).

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
        // Probe 3 (with bumpedTs): empty → loop ends.
        mockExecuteEsqlQuery
          .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(stalledTs)) // slice 1, not last
          .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 1
          .mockResolvedValueOnce(
            mockLogPaginationCursorProbeRow(stalledTs, LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT) // slice 2: stall fires, extraction skipped
          )
          .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty()); // probe 3 with bumpedTs → loop ends

        const result = await client.extractLogs('user');

        expect(result.success).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(`Log-slice probe stalled at ${stalledTs}`)
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
        // Full page (total=max) → isLastLogsPage=false → loop continues; terminal empty probe ends it.
        mockExecuteEsqlQuery
          .mockResolvedValueOnce(mockLogPaginationCursorProbeRow(ts1)) // slice 1, not last
          .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 1
          .mockResolvedValueOnce(
            mockLogPaginationCursorProbeRow(ts2, LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT) // full page, different ts → not last
          )
          .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 2
          .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty()); // terminal probe → loop ends

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
        // Full page (total=max → isLastLogsPage=false): loop continues; terminal empty probe ends it.
        mockExecuteEsqlQuery
          .mockResolvedValueOnce(
            mockLogPaginationCursorProbeRow(someTs, LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT)
          )
          .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction
          .mockResolvedValueOnce(mockLogPaginationCursorProbeEmpty()); // terminal probe → loop ends

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
        mockGlobalStateClient.find.mockResolvedValue(globalState);
        mockGlobalStateClient.findOrThrow.mockResolvedValue(globalState);
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
        // 6 sub-windows × 1 probe each. Each probe returns empty so the inner outer-loop never
        // runs `advanceEngineStateAfterLogPageCompletes` — no per-slice persistence either.
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(6);

        // Single update call: the final cleanup at the end of extractLogs.
        expect(mockEngineDescriptorClient.update).toHaveBeenCalledTimes(1);
        expect(mockEngineDescriptorClient.update).toHaveBeenCalledWith(
          'user',
          expect.objectContaining({
            logExtractionState: {
              checkpointTimestamp: null,
              paginationId: null,
              lastExecutionTimestamp: effectiveWindowEnd,
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

        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
        expect(mockEngineDescriptorClient.update).toHaveBeenCalledTimes(1);
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
        mockGlobalStateClient.find.mockResolvedValue(globalState);
        mockGlobalStateClient.findOrThrow.mockResolvedValue(globalState);
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

        // A single probe over the full user-supplied window — no sub-window splitting.
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
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

        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);

        const subWindow1 = mockExecuteEsqlQuery.mock.calls[0][0].query;
        expect(subWindow1).toContain('2025-01-15T11:44:00.000Z');
        expect(subWindow1).toContain('2025-01-15T11:49:00.000Z');

        const subWindow2 = mockExecuteEsqlQuery.mock.calls[1][0].query;
        expect(subWindow2).toContain('2025-01-15T11:49:00.000Z');
        expect(subWindow2).toContain('2025-01-15T11:54:00.000Z');

        const subWindow3 = mockExecuteEsqlQuery.mock.calls[2][0].query;
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
    });
  });

  describe('updateConfig', () => {
    it('should merge provided params over current config and persist via globalStateClient', async () => {
      await client.updateConfig({ delay: '5m' });

      expect(mockGlobalStateClient.findOrThrow).toHaveBeenCalledTimes(1);
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
      mockGlobalStateClient.findOrThrow.mockRejectedValue(notFoundError);

      await expect(client.updateConfig({ delay: '5m' })).rejects.toThrow(
        'No global state found for this namespace'
      );
      expect(mockGlobalStateClient.update).not.toHaveBeenCalled();
    });
  });

  describe('getRemainingLogsCount', () => {
    it('should return document_count from ESQL response when engine is started', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [{ name: 'document_count', type: 'long' }],
        values: [[42]],
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
      mockExecuteEsqlQuery.mockResolvedValue(mockEsqlResponse);

      const result = await client.getRemainingLogsCount('user');

      expect(result).toBe(42);
      expect(mockEngineDescriptorClient.findOrThrow).toHaveBeenCalledWith('user');
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining('STATS document_count = COUNT()'),
      });
      expect(mockIngestEntities).not.toHaveBeenCalled();
    });

    it('applies excludedIndexPatterns to the count query', async () => {
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
        remoteLogsExtractionClient:
          mockRemoteLogsExtractionClient as unknown as RemoteLogsExtractionClient,
      });

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user') as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue({
        columns: [{ name: 'document_count', type: 'long' }],
        values: [[0]],
      });

      await client.getRemainingLogsCount('user');

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining('-logs-proxy-*'),
      });
    });

    it('should return 0 when ESQL response has no rows', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [{ name: 'document_count', type: 'long' }],
        values: [],
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
      mockExecuteEsqlQuery.mockResolvedValue(mockEsqlResponse);

      const result = await client.getRemainingLogsCount('user');

      expect(result).toBe(0);
    });

    it('should return 0 when document_count column is missing', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [{ name: 'other_column', type: 'keyword' }],
        values: [['value']],
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
      mockExecuteEsqlQuery.mockResolvedValue(mockEsqlResponse);

      const result = await client.getRemainingLogsCount('user');

      expect(result).toBe(0);
    });

    it('should use fromDateISO from extraction window and toDateISO as now', async () => {
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      jest.useFakeTimers({ now: fixedNow.getTime() });

      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [{ name: 'document_count', type: 'long' }],
        values: [[0]],
      };

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user', { lookbackPeriod: '3h', delay: '5s' }) as Awaited<
          ReturnType<EngineDescriptorClient['findOrThrow']>
        >
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockEsqlResponse);

      await client.getRemainingLogsCount('user');

      const expectedFrom = moment.utc(fixedNow).subtract(3, 'hours').toISOString();
      const expectedTo = moment.utc(fixedNow).toISOString();

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(expectedFrom),
      });
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(expectedTo),
      });

      jest.useRealTimers();
    });

    it('should throw and log when executeEsqlQuery throws', async () => {
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

      await expect(client.getRemainingLogsCount('user')).rejects.toThrow('ESQL query failed');
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get remaining logs count for entity type "user"')
      );
    });

    it('should pass recoveryId when engine has paginationId', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [{ name: 'document_count', type: 'long' }],
        values: [[5]],
      };

      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };

      const descriptor = createMockEngineDescriptor('user') as Awaited<
        ReturnType<EngineDescriptorClient['findOrThrow']>
      >;
      descriptor.logExtractionState = {
        ...descriptor.logExtractionState,
        paginationId: 'recovery-cursor-id',
      } as typeof descriptor.logExtractionState;
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(descriptor);
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockEsqlResponse);

      const result = await client.getRemainingLogsCount('user');

      expect(result).toBe(5);
      // When recoveryId is set, buildExtractionSourceClause uses >= for timestamp (recovery boundary)
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringMatching(/@timestamp\s*>=\s*TO_DATETIME/),
      });
    });

    it('should use checkpointTimestamp as both window start and log-slice lower bound in remaining-count ESQL', async () => {
      const fixedNow = new Date('2025-01-15T12:00:00.000Z');
      jest.useFakeTimers({ now: fixedNow.getTime() });
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [{ name: 'document_count', type: 'long' }],
        values: [[3]],
      };
      const mockDataView = {
        getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      };
      const checkpointTimestamp = '2025-01-15T10:20:00.000Z';
      mockEngineDescriptorClient.findOrThrow.mockResolvedValue(
        createMockEngineDescriptor('user', {
          lookbackPeriod: '3h',
          delay: '1m',
          checkpointTimestamp,
        }) as Awaited<ReturnType<EngineDescriptorClient['findOrThrow']>>
      );
      mockDataViewsService.get.mockResolvedValue(mockDataView as any);
      mockExecuteEsqlQuery.mockResolvedValue(mockEsqlResponse);

      const result = await client.getRemainingLogsCount('user');
      expect(result).toBe(3);
      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
        esClient: mockEsClient,
        query: expect.stringContaining(checkpointTimestamp),
      });
      jest.useRealTimers();
    });

    it('should convert document_count to number via Number()', async () => {
      const mockEsqlResponse: ESQLSearchResponse = {
        columns: [{ name: 'document_count', type: 'long' }],
        values: [['100'] as unknown as ESQLSearchResponse['values'][0]],
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
      mockExecuteEsqlQuery.mockResolvedValue(mockEsqlResponse);

      const result = await client.getRemainingLogsCount('user');

      expect(result).toBe(100);
    });
  });
});
