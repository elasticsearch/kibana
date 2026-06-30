/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLSearchResponse } from '@kbn/es-types';
import moment from 'moment';
import { errors } from '@elastic/elasticsearch';
import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import { RemoteLogsExtractionClient } from './remote_logs_extraction_client';
import type { RemoteExtractionStrategy } from './strategies';
import type { RemoteLogExtractionStateClient } from '../../saved_objects/remote_log_extraction_state';
import { getEntityDefinition } from '../../../../common/domain/definitions/registry';
import { getUpdatesEntitiesDataStreamName } from '../../asset_manager/updates_data_stream';
import { executeEsqlQuery } from '../../../infra/elasticsearch/esql';
import { ingestEntities } from '../../../infra/elasticsearch/ingest';
import { ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD } from '../query_builder_commons';
import { get } from 'lodash';

jest.mock('../../../infra/elasticsearch/esql', () => {
  const actual = jest.requireActual<typeof import('../../../infra/elasticsearch/esql')>(
    '../../../infra/elasticsearch/esql'
  );
  return {
    ...actual,
    executeEsqlQuery: jest.fn(),
  };
});

jest.mock('../../../infra/elasticsearch/ingest', () => ({
  ingestEntities: jest.fn().mockResolvedValue(undefined),
}));

const mockExecuteEsqlQuery = executeEsqlQuery as jest.MockedFunction<typeof executeEsqlQuery>;
const mockIngestEntities = ingestEntities as jest.MockedFunction<typeof ingestEntities>;

/** Returns a probe response with one row: the slice end boundary. */
function makeProbeResponse(ts: string, totalLogs: number): ESQLSearchResponse {
  return {
    columns: [
      { name: '@timestamp', type: 'date' },
      { name: 'total_logs', type: 'long' },
    ],
    values: [[ts, totalLogs]],
  };
}

const emptyProbeResponse: ESQLSearchResponse = { columns: [], values: [] };

// Fixed clock so moment()-based timestamps are deterministic across tests
const FIXED_NOW = new Date('2026-01-01T12:00:00.000Z');
// '3h' lookbackPeriod → fresh fromDateISO = FIXED_NOW - 10 800 000 ms
const EXPECTED_FROM_DATE_ISO = '2026-01-01T09:00:00.000Z';

const DEFAULT_MAX_LOGS_PER_PAGE = 10000;

describe('RemoteLogsExtractionClient', () => {
  const mockLogger = loggerMock.create();
  const mockEsClient = {
    indices: {
      resolveIndex: jest.fn().mockResolvedValue({ indices: [], aliases: [], data_streams: [] }),
    },
  } as unknown as jest.Mocked<ElasticsearchClient>;
  const namespace = 'default';

  const mockStateClient = {
    findOrInit: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    clearRecoveryId: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<RemoteLogExtractionStateClient>;

  const mockStrategy: RemoteExtractionStrategy = {
    id: 'ccs',
    client: mockEsClient,
    stateClient: mockStateClient,
    buildPatterns: ({ remoteIndexPatterns }) => remoteIndexPatterns,
  };

  let client: RemoteLogsExtractionClient;

  const defaultExtractParams = {
    type: 'host' as const,
    remoteIndexPatterns: ['remote_cluster:logs-*'],
    docsLimit: 10000,
    maxLogsPerPage: DEFAULT_MAX_LOGS_PER_PAGE,
    lookbackPeriod: '3h',
    delay: '1m',
    frequency: '1m',
    entityDefinition: getEntityDefinition('host', 'default'),
    // Use a very large cap so existing tests remain a single sub-window. The sub-window cap
    // behavior is exercised by the dedicated tests at the end of this describe block.
    maxTimeWindowSize: '999d',
    maxLogsPerWindow: 0,
    maxLogsPerWindowCapBehavior: 'drop' as const,
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW });
    jest.clearAllMocks();
    // Reset once-queue so leftover mocks from previous tests don't leak
    mockExecuteEsqlQuery.mockReset();
    mockStateClient.findOrInit.mockResolvedValue({
      checkpointTimestamp: null,
      paginationRecoveryId: null,
    });
    mockStateClient.update.mockResolvedValue(undefined);
    mockStateClient.clearRecoveryId.mockResolvedValue(undefined);
    client = new RemoteLogsExtractionClient(mockLogger, namespace, mockStrategy);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should extract to updates via bulk and return count and pages', async () => {
    const entityPageResponse: ESQLSearchResponse = {
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'entity.id', type: 'keyword' },
        { name: 'event.kind', type: 'keyword' },
      ],
      values: [
        ['2024-06-15T12:00:00.000Z', 'host:host-1', 'asset'],
        ['2024-06-15T12:00:00.000Z', 'host:host-2', 'asset'],
      ],
    };

    mockExecuteEsqlQuery
      .mockResolvedValueOnce(makeProbeResponse('2024-06-15T23:59:59.000Z', 2))
      .mockResolvedValueOnce(entityPageResponse);

    const result = await client.extractToUpdates(defaultExtractParams);

    expect(result).toEqual({ count: 2, pages: 1 });
    // probe + entity page; total_logs=2 < maxLogsPerPage=10000 → isLastLogsPage=true, no second probe
    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
    expect(mockIngestEntities).toHaveBeenCalledTimes(1);
    expect(mockIngestEntities).toHaveBeenCalledWith(
      expect.objectContaining({
        esClient: mockEsClient,
        esqlResponse: entityPageResponse,
        targetIndex: getUpdatesEntitiesDataStreamName(namespace),
        fieldsToIgnore: [ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD],
        transformDocument: expect.any(Function),
      })
    );
    const transformDocument = mockIngestEntities.mock.calls[0][0].transformDocument!;
    const doc1 = transformDocument({
      '@timestamp': '2024-06-15T12:00:00.000Z',
      'entity.id': 'host:host-1',
      'event.kind': 'asset',
    }) as Record<string, unknown>;
    expect(doc1['@timestamp']).toBeDefined();
    expect((doc1 as { event?: { kind?: string } }).event?.kind).toBe('asset');
    expect(get(doc1, ['host', 'entity', 'id'])).toBe('host:host-1');
  });

  it('should call bulk with flat entity doc and event.kind asset', async () => {
    mockExecuteEsqlQuery
      .mockResolvedValueOnce(makeProbeResponse('2026-01-01T11:58:59.000Z', 1))
      .mockResolvedValueOnce({
        columns: [
          { name: 'entity.id', type: 'keyword' },
          { name: 'entity.name', type: 'keyword' },
          { name: 'event.kind', type: 'keyword' },
        ],
        values: [['user:u1', 'alice', 'asset']],
      });

    await client.extractToUpdates({
      ...defaultExtractParams,
      type: 'user',
      entityDefinition: getEntityDefinition('user', 'default'),
    });

    expect(mockIngestEntities).toHaveBeenCalledTimes(1);
    expect(mockIngestEntities).toHaveBeenCalledWith(
      expect.objectContaining({
        targetIndex: getUpdatesEntitiesDataStreamName(namespace),
        fieldsToIgnore: [ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD],
      })
    );
    const transformDocument = mockIngestEntities.mock.calls[0][0].transformDocument!;
    const doc = transformDocument({
      'entity.id': 'user:u1',
      'entity.name': 'alice',
      'event.kind': 'asset',
    }) as Record<string, unknown>;
    expect((doc as { user?: { entity?: { id?: string } } }).user?.entity?.id).toBe('user:u1');
    expect(doc.user).toBeDefined();
    expect((doc as { event?: { kind?: string } }).event?.kind).toBe('asset');
    expect(doc['@timestamp']).toBeDefined();
    // @timestamp is rewritten to now + increment (1ms per doc) so it is always in the future
    const nowMs = FIXED_NOW.getTime();
    const ts = new Date(doc['@timestamp'] as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(nowMs);
    expect(ts).toBeLessThanOrEqual(nowMs + 10001);
  });

  it('should paginate (inner loop) when entity page is full', async () => {
    const docsLimit = 2;
    const firstPage: ESQLSearchResponse = {
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
        { name: 'entity.id', type: 'keyword' },
        { name: 'event.kind', type: 'keyword' },
      ],
      values: [
        ['2024-06-15T10:00:00.000Z', '2024-06-15T10:00:00.000Z', 'host:h1', 'asset'],
        ['2024-06-15T10:00:00.000Z', '2024-06-15T10:00:00.000Z', 'host:h2', 'asset'],
      ],
    };
    const secondPage: ESQLSearchResponse = {
      columns: firstPage.columns,
      values: [['2024-06-15T11:00:00.000Z', '2024-06-15T11:00:00.000Z', 'host:h3', 'asset']],
    };

    mockExecuteEsqlQuery
      .mockResolvedValueOnce(makeProbeResponse('2024-06-15T11:00:00.000Z', 3))
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    const result = await client.extractToUpdates({ ...defaultExtractParams, docsLimit });

    expect(result).toEqual({ count: 3, pages: 2 });
    // probe + 2 entity pages; total_logs=3 < maxLogsPerPage=10000 → isLastLogsPage=true, no second probe
    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);
    expect(mockIngestEntities).toHaveBeenCalledTimes(2);
    expect(mockIngestEntities).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ esqlResponse: firstPage })
    );
    expect(mockIngestEntities).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ esqlResponse: secondPage })
    );
    // State persisted after the first full entity page — checkpoint = last entity's _firstSeenLog
    expect(mockStateClient.update).toHaveBeenCalledWith('host', {
      checkpointTimestamp: '2024-06-15T10:00:00.000Z',
      paginationRecoveryId: 'host:h2',
    });
    // Outer loop advance after slice completes
    expect(mockStateClient.update).toHaveBeenCalledWith('host', {
      checkpointTimestamp: '2024-06-15T11:00:00.000Z',
      paginationRecoveryId: null,
    });
    // count > 0 → no clearRecoveryId
    expect(mockStateClient.clearRecoveryId).not.toHaveBeenCalled();
  });

  it('should paginate across outer (log-slice) loop when probe signals more slices', async () => {
    const docsLimit = 5;
    const maxLogsPerPage = 2;

    const slice1EntityPage: ESQLSearchResponse = {
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
        { name: 'entity.id', type: 'keyword' },
      ],
      values: [
        ['2024-06-15T10:00:00.000Z', '2024-06-15T09:00:00.000Z', 'host:h1'],
        ['2024-06-15T10:00:00.000Z', '2024-06-15T09:00:00.000Z', 'host:h2'],
      ],
    };
    const slice2EntityPage: ESQLSearchResponse = {
      columns: slice1EntityPage.columns,
      values: [
        ['2024-06-15T11:00:00.000Z', '2024-06-15T10:30:00.000Z', 'host:h3'],
        ['2024-06-15T11:00:00.000Z', '2024-06-15T10:30:00.000Z', 'host:h4'],
      ],
    };

    // Probe 1: total_logs=2 = maxLogsPerPage=2 → full page, isLastLogsPage=false → not last
    // Probe 2: total_logs=1 < maxLogsPerPage=2 → partial page, isLastLogsPage=true → last slice
    mockExecuteEsqlQuery
      .mockResolvedValueOnce(makeProbeResponse('2024-06-15T10:00:00.000Z', 2))
      .mockResolvedValueOnce(slice1EntityPage)
      .mockResolvedValueOnce(makeProbeResponse('2024-06-15T11:00:00.000Z', 1))
      .mockResolvedValueOnce(slice2EntityPage);

    const result = await client.extractToUpdates({
      ...defaultExtractParams,
      docsLimit,
      maxLogsPerPage,
    });

    expect(result).toEqual({ count: 4, pages: 2 });
    // 2 probes + 2 entity pages
    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(4);
    expect(mockIngestEntities).toHaveBeenCalledTimes(2);

    // Slice boundary state persisted after each slice completes
    expect(mockStateClient.update).toHaveBeenCalledWith('host', {
      checkpointTimestamp: '2024-06-15T10:00:00.000Z',
      paginationRecoveryId: null,
    });
    expect(mockStateClient.update).toHaveBeenCalledWith('host', {
      checkpointTimestamp: '2024-06-15T11:00:00.000Z',
      paginationRecoveryId: null,
    });
    // count > 0 → no clearRecoveryId
    expect(mockStateClient.clearRecoveryId).not.toHaveBeenCalled();
  });

  it('should return error when ESQL call is aborted during entity pagination', async () => {
    const docsLimit = 2;
    const firstPage: ESQLSearchResponse = {
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
        { name: 'entity.id', type: 'keyword' },
      ],
      values: [
        ['2024-06-15T10:00:00.000Z', '2024-06-15T10:00:00.000Z', 'host:h1'],
        ['2024-06-15T10:00:00.000Z', '2024-06-15T10:00:00.000Z', 'host:h2'],
      ],
    };

    const abortError = new DOMException('aborted', 'AbortError');
    mockExecuteEsqlQuery
      .mockResolvedValueOnce(makeProbeResponse('2024-06-15T10:00:00.000Z', 4))
      .mockResolvedValueOnce(firstPage)
      .mockRejectedValueOnce(abortError);

    const result = await client.extractToUpdates({
      ...defaultExtractParams,
      docsLimit,
      abortController: new AbortController(),
    });

    expect(result.error).toBeDefined();
    // probe + first entity page + second entity page (aborts)
    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);
    expect(mockIngestEntities).toHaveBeenCalledTimes(1);
  });

  it('should return zero count and pages when probe finds no logs', async () => {
    mockStateClient.findOrInit.mockResolvedValue({
      checkpointTimestamp: '2024-06-15T10:00:00.000Z',
      paginationRecoveryId: null,
    });
    mockExecuteEsqlQuery.mockResolvedValueOnce(emptyProbeResponse);

    const result = await client.extractToUpdates(defaultExtractParams);

    expect(result).toEqual({ count: 0, pages: 0 });
    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
    expect(mockIngestEntities).not.toHaveBeenCalled();
    // clearRecoveryId called to clean up any stale recovery id; checkpoint unchanged
    expect(mockStateClient.clearRecoveryId).toHaveBeenCalledWith('host');
    expect(mockStateClient.update).not.toHaveBeenCalledWith(
      'host',
      expect.objectContaining({ checkpointTimestamp: null })
    );
  });

  it('should resume from mid entity-page recovery state (paginationRecoveryId set)', async () => {
    // Use a recent checkpoint (within 4.5h of FIXED_NOW) so the lag cutoff does not fire.
    const recoveryTimestamp = '2026-01-01T08:00:00.000Z';
    const recoveryId = 'host:h2';
    mockStateClient.findOrInit.mockResolvedValue({
      checkpointTimestamp: recoveryTimestamp,
      paginationRecoveryId: recoveryId,
    });

    const entityPageResponse: ESQLSearchResponse = {
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
        { name: 'entity.id', type: 'keyword' },
      ],
      values: [['2026-01-01T09:00:00.000Z', '2026-01-01T08:00:00.000Z', 'host:h3']],
    };

    mockExecuteEsqlQuery
      .mockResolvedValueOnce(makeProbeResponse('2026-01-01T09:00:00.000Z', 1))
      .mockResolvedValueOnce(entityPageResponse);

    const result = await client.extractToUpdates(defaultExtractParams);

    expect(result).toEqual({ count: 1, pages: 1 });

    // The probe query must use checkpointTimestamp as the window start
    const probeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query as string;
    expect(probeQuery).toContain(recoveryTimestamp);
    // The entity page query must include the recoveryId for the WHERE clause
    const entityQuery = mockExecuteEsqlQuery.mock.calls[1][0].query as string;
    expect(entityQuery).toContain(recoveryId);
  });

  it('should resume from slice-boundary recovery state (checkpointTimestamp set, paginationRecoveryId null)', async () => {
    // Use a recent checkpoint (within 4.5h of FIXED_NOW) so the lag cutoff does not fire.
    const sliceBoundaryTimestamp = '2026-01-01T10:00:00.000Z';
    mockStateClient.findOrInit.mockResolvedValue({
      checkpointTimestamp: sliceBoundaryTimestamp,
      paginationRecoveryId: null,
    });

    const entityPageResponse: ESQLSearchResponse = {
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD, type: 'date' },
        { name: 'entity.id', type: 'keyword' },
      ],
      values: [['2026-01-01T09:00:00.000Z', '2026-01-01T08:30:00.000Z', 'host:h4']],
    };

    mockExecuteEsqlQuery
      .mockResolvedValueOnce(makeProbeResponse('2026-01-01T09:00:00.000Z', 1))
      .mockResolvedValueOnce(entityPageResponse);

    const result = await client.extractToUpdates(defaultExtractParams);

    expect(result).toEqual({ count: 1, pages: 1 });

    const probeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query as string;
    expect(probeQuery).toContain(sliceBoundaryTimestamp);
  });

  it('should use lookback window on fresh start (no checkpoint)', async () => {
    mockStateClient.findOrInit.mockResolvedValue({
      checkpointTimestamp: null,
      paginationRecoveryId: null,
    });
    mockExecuteEsqlQuery.mockResolvedValueOnce(emptyProbeResponse);

    await client.extractToUpdates(defaultExtractParams);

    const probeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query as string;
    // Probe should use now - lookbackPeriod as the from boundary
    expect(probeQuery).toContain(EXPECTED_FROM_DATE_ISO);
  });

  it('should use checkpointTimestamp as fromDateISO on normal continuation', async () => {
    // Use a recent checkpoint (within 4.5h of FIXED_NOW) so the lag cutoff does not fire.
    const checkpoint = '2026-01-01T10:00:00.000Z';
    mockStateClient.findOrInit.mockResolvedValue({
      checkpointTimestamp: checkpoint,
      paginationRecoveryId: null,
    });
    mockExecuteEsqlQuery.mockResolvedValueOnce(emptyProbeResponse);

    await client.extractToUpdates(defaultExtractParams);

    const probeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query as string;
    expect(probeQuery).toContain(checkpoint);
    expect(probeQuery).not.toContain(EXPECTED_FROM_DATE_ISO);
  });

  it('should use provided window override and skip state updates', async () => {
    const overrideFrom = '2024-01-01T00:00:00.000Z';
    const overrideTo = '2024-06-15T23:59:59.999Z';

    mockExecuteEsqlQuery
      .mockResolvedValueOnce(makeProbeResponse('2024-06-15T12:00:00.000Z', 1))
      .mockResolvedValueOnce({
        columns: [{ name: 'entity.id', type: 'keyword' }],
        values: [['host:h1']],
      });

    const result = await client.extractToUpdates({
      ...defaultExtractParams,
      windowOverride: { fromDateISO: overrideFrom, toDateISO: overrideTo },
    });

    expect(result).toMatchObject({ count: 1, pages: 1 });

    // findOrInit must NOT be called for override runs
    expect(mockStateClient.findOrInit).not.toHaveBeenCalled();
    // State must NOT be modified for override runs
    expect(mockStateClient.update).not.toHaveBeenCalled();
    expect(mockStateClient.clearRecoveryId).not.toHaveBeenCalled();

    // Probe must use the override window
    const probeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query as string;
    expect(probeQuery).toContain(overrideFrom);
    expect(probeQuery).toContain(overrideTo);
  });

  it('should return empty result immediately when window is empty (from >= to)', async () => {
    const futureCheckpoint = '2027-01-01T00:00:00.000Z'; // later than FIXED_NOW - 1min
    mockStateClient.findOrInit.mockResolvedValue({
      checkpointTimestamp: futureCheckpoint,
      paginationRecoveryId: null,
    });

    const result = await client.extractToUpdates(defaultExtractParams);

    expect(result).toEqual({ count: 0, pages: 0 });
    expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    expect(mockStateClient.clearRecoveryId).not.toHaveBeenCalled();
  });

  describe('sub-window cap', () => {
    it('walks the time window in capped sub-windows when checkpointTimestamp is far behind effectiveWindowEnd', async () => {
      // FIXED_NOW = 2026-01-01T12:00 ; delay = 1m → effectiveWindowEnd = 2026-01-01T11:59
      // checkpoint = 2026-01-01T11:29 → window ~30m, cap=5m, grace=30s → 6 sub-windows.
      const checkpoint = '2026-01-01T11:29:00.000Z';
      mockStateClient.findOrInit.mockResolvedValue({
        checkpointTimestamp: checkpoint,
        paginationRecoveryId: null,
      });
      // Each sub-window probe returns empty (no logs), so the inner outer-loop terminates
      // immediately and never persists per-slice checkpoints. No state updates occur.
      mockExecuteEsqlQuery.mockResolvedValue(emptyProbeResponse);

      const result = await client.extractToUpdates({
        ...defaultExtractParams,
        maxTimeWindowSize: '5m',
      });

      expect(result).toEqual({ count: 0, pages: 0 });
      // 6 sub-windows × 1 probe each.
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(6);
      // No per-sub-window checkpoint persistence — inner per-slice persistence is the only
      // mechanism, and it didn't fire because every probe was empty.
      expect(mockStateClient.update).not.toHaveBeenCalled();
      // count=0 across all sub-windows → clearRecoveryId
      expect(mockStateClient.clearRecoveryId).toHaveBeenCalledWith('host');
    });

    it('does not cap when the gap is within maxTimeWindowSize + grace', async () => {
      // Window ~ 5m + 10s, cap = 5m, grace = 30s → no cap, single sub-window.
      const checkpoint = '2026-01-01T11:53:50.000Z';
      mockStateClient.findOrInit.mockResolvedValue({
        checkpointTimestamp: checkpoint,
        paginationRecoveryId: null,
      });
      mockExecuteEsqlQuery.mockResolvedValueOnce(emptyProbeResponse);

      await client.extractToUpdates({
        ...defaultExtractParams,
        maxTimeWindowSize: '5m',
      });

      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
      // Empty probe → no per-slice state updates either.
      expect(mockStateClient.update).not.toHaveBeenCalled();
    });

    it('bypasses the sub-window cap when windowOverride is provided', async () => {
      const overrideFrom = '2024-01-01T00:00:00.000Z';
      const overrideTo = '2024-12-31T23:59:00.000Z'; // ~1y, exceeds the 5m cap

      mockExecuteEsqlQuery.mockResolvedValueOnce(emptyProbeResponse);

      await client.extractToUpdates({
        ...defaultExtractParams,
        maxTimeWindowSize: '5m',
        windowOverride: { fromDateISO: overrideFrom, toDateISO: overrideTo },
      });

      // Single probe over the full user-supplied window — no sub-window splitting.
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
      const probeQuery = mockExecuteEsqlQuery.mock.calls[0][0].query as string;
      expect(probeQuery).toContain(overrideFrom);
      expect(probeQuery).toContain(overrideTo);
      // Override runs do not touch remote extraction state.
      expect(mockStateClient.findOrInit).not.toHaveBeenCalled();
      expect(mockStateClient.update).not.toHaveBeenCalled();
    });

    it('passes monotonically advancing fromDateISO/toDateISO to each sub-window probe', async () => {
      const checkpoint = '2026-01-01T11:44:00.000Z'; // 15m before effectiveWindowEnd
      mockStateClient.findOrInit.mockResolvedValue({
        checkpointTimestamp: checkpoint,
        paginationRecoveryId: null,
      });
      mockExecuteEsqlQuery.mockResolvedValue(emptyProbeResponse);

      await client.extractToUpdates({
        ...defaultExtractParams,
        maxTimeWindowSize: '5m',
      });

      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(3);

      const subWindow1 = mockExecuteEsqlQuery.mock.calls[0][0].query as string;
      expect(subWindow1).toContain('2026-01-01T11:44:00.000Z');
      expect(subWindow1).toContain('2026-01-01T11:49:00.000Z');

      const subWindow2 = mockExecuteEsqlQuery.mock.calls[1][0].query as string;
      expect(subWindow2).toContain('2026-01-01T11:49:00.000Z');
      expect(subWindow2).toContain('2026-01-01T11:54:00.000Z');

      const subWindow3 = mockExecuteEsqlQuery.mock.calls[2][0].query as string;
      expect(subWindow3).toContain('2026-01-01T11:54:00.000Z');
      expect(subWindow3).toContain('2026-01-01T11:59:00.000Z');
    });
  });

  describe('stall detection', () => {
    // `sliceStart` starts undefined; it is only set after the first slice completes (line ~332).
    // Stall detection (`!!sliceStart && ...`) therefore requires at least two slice iterations.
    // After the stall, a terminal empty probe ends the loop (full-page count no longer signals last page).

    it('logs warn and bumps checkpointTimestamp by 1ms when timestamp unchanged and page is full', async () => {
      const stalledTs = '2024-06-15T10:00:00.000Z';
      const bumpedTs = moment(stalledTs).add(1, 'ms').toISOString();

      mockStateClient.findOrInit.mockResolvedValue({
        checkpointTimestamp: null,
        paginationRecoveryId: null,
      });

      // Slice 1: ends at stalledTs (full page → not last, loop continues).
      // Slice 2: same stalledTs + full page → stall fires, extraction skipped, cursor bumped.
      // Probe 3 (with bumpedTs): empty → loop ends.
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(makeProbeResponse(stalledTs, DEFAULT_MAX_LOGS_PER_PAGE)) // slice 1, not last
        .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 1
        .mockResolvedValueOnce(makeProbeResponse(stalledTs, DEFAULT_MAX_LOGS_PER_PAGE)) // slice 2: stall fires, extraction skipped
        .mockResolvedValueOnce(emptyProbeResponse); // probe 3 with bumpedTs → loop ends

      const result = await client.extractToUpdates(defaultExtractParams);

      expect(result.error).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`log-slice probe stalled at ${stalledTs}`)
      );
      // The outer loop persists the bumped value as checkpointTimestamp after the stalled slice.
      expect(mockStateClient.update).toHaveBeenCalledWith('host', {
        checkpointTimestamp: bumpedTs,
        paginationRecoveryId: null,
      });
    });

    it('does not warn when timestamp advances between slices', async () => {
      const ts1 = '2024-06-15T10:00:00.000Z';
      const ts2 = '2024-06-15T10:00:01.000Z'; // different timestamp → no stall

      mockStateClient.findOrInit.mockResolvedValue({
        checkpointTimestamp: null,
        paginationRecoveryId: null,
      });

      // Slice 1: sliceStart becomes ts1. Slice 2: advances to ts2 (different) → no stall.
      // Full page (total=max) → isLastLogsPage=false → loop continues; terminal empty probe ends it.
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(makeProbeResponse(ts1, DEFAULT_MAX_LOGS_PER_PAGE)) // slice 1, not last
        .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 1
        .mockResolvedValueOnce(makeProbeResponse(ts2, DEFAULT_MAX_LOGS_PER_PAGE)) // full page, different ts → not last
        .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 2
        .mockResolvedValueOnce(emptyProbeResponse); // terminal probe → loop ends

      const result = await client.extractToUpdates(defaultExtractParams);

      expect(result.error).toBeUndefined();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('does not warn when page is partial even if timestamp unchanged', async () => {
      const ts1 = '2024-06-15T10:00:00.000Z';

      mockStateClient.findOrInit.mockResolvedValue({
        checkpointTimestamp: null,
        paginationRecoveryId: null,
      });

      // Slice 1: sliceStart becomes ts1 (full page, not last). Slice 2: same ts but only 5 docs (partial) → no stall.
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(makeProbeResponse(ts1, DEFAULT_MAX_LOGS_PER_PAGE)) // slice 1, not last
        .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction 1
        .mockResolvedValueOnce(makeProbeResponse(ts1, 5)) // same ts, partial page → no stall, isLastLogsPage=true
        .mockResolvedValueOnce({ columns: [], values: [] }); // entity extraction 2

      const result = await client.extractToUpdates(defaultExtractParams);

      expect(result.error).toBeUndefined();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('does not warn on first iteration (sliceStart is always undefined initially)', async () => {
      // The first probe always runs with sliceStart=undefined → stall guard is skipped.
      mockStateClient.findOrInit.mockResolvedValue({
        checkpointTimestamp: null,
        paginationRecoveryId: null,
      });

      const someTs = '2024-06-15T10:00:00.000Z';
      // Full page (total=max → isLastLogsPage=false): loop continues; terminal empty probe ends it.
      mockExecuteEsqlQuery
        .mockResolvedValueOnce(makeProbeResponse(someTs, DEFAULT_MAX_LOGS_PER_PAGE)) // slice 1, not last
        .mockResolvedValueOnce({ columns: [], values: [] }) // entity extraction
        .mockResolvedValueOnce(emptyProbeResponse); // terminal probe → loop ends

      const result = await client.extractToUpdates(defaultExtractParams);

      expect(result.error).toBeUndefined();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('CPS/CCS extraction error handling', () => {
    const makeClient = (id: 'ccs' | 'cps') =>
      new RemoteLogsExtractionClient(mockLogger, namespace, {
        id,
        client: mockEsClient,
        stateClient: mockStateClient,
        buildPatterns: ({ remoteIndexPatterns }) => remoteIndexPatterns,
      });

    // The matcher reads only body.error.type, so statusCode is irrelevant here.
    const esResponseError = (type: string) =>
      new errors.ResponseError({
        warnings: [],
        meta: {} as never,
        body: { error: { type, reason: null } },
      });

    it('CPS: treats no_such_element_exception (no linked projects) as empty, no error', async () => {
      mockExecuteEsqlQuery.mockRejectedValueOnce(esResponseError('no_such_element_exception'));

      const result = await makeClient('cps').extractToUpdates(defaultExtractParams);

      expect(result).toEqual({ count: 0, pages: 0 });
    });

    it('CPS: treats no_such_remote_cluster_exception (CPS disabled) as empty, no error', async () => {
      mockExecuteEsqlQuery.mockRejectedValueOnce(
        esResponseError('no_such_remote_cluster_exception')
      );

      const result = await makeClient('cps').extractToUpdates(defaultExtractParams);

      expect(result).toEqual({ count: 0, pages: 0 });
    });

    it('CCS: surfaces no_such_remote_cluster_exception as an error (gate is CPS-only)', async () => {
      mockExecuteEsqlQuery.mockRejectedValueOnce(
        esResponseError('no_such_remote_cluster_exception')
      );

      const result = await makeClient('ccs').extractToUpdates(defaultExtractParams);

      expect(result.count).toBe(0);
      expect(result.pages).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('CPS: surfaces unrelated failures as an error', async () => {
      mockExecuteEsqlQuery.mockRejectedValueOnce(new Error('some other failure'));

      const result = await makeClient('cps').extractToUpdates(defaultExtractParams);

      expect(result.error?.message).toContain('some other failure');
    });
  });
});
